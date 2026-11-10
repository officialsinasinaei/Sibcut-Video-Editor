/**
 * Compositor side of automatic background removal (model/cutout.js) and
 * skin retouch (model/retouch.js): finds the person matte of the frame a
 * layer is showing, keeps it per clip until the frame changes, and binds it
 * for LAYER_FS, which refines the soft low-resolution matte against the
 * full picture to cut the person out, and limits retouching to people. The
 * face and hair tools have their own models (engine/face-render.js).
 */
import { SEG_SIZE, segment, ready, segmenterState, onSegmenterChange } from '../media/segmenter.js';
import { computeMatteDims } from '../media/segmenter-core.js';
import {
  matteWindow,
  foregroundDecontaminationAmount,
  steadyMatte,
  strokeOverride,
  applyOverride,
  CUTOUT_DEFAULT,
} from '../model/cutout.js';
import { retouchAmounts } from '../model/retouch.js';
import { clipUsesBodyEffect } from '../model/body-effects.js';
import { frameOf, drawUpright, faceModelsIn, ensureFaceModels, onFaceModelsReady, bindFaceLayer } from './face-render.js';
import { bindBodyLayer } from './body-render.js';

/** Texture unit of the matte (masks use 6). */
export const MATTE_UNIT = 7;

const makeCanvas = (w, h) =>
  typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Whether a project has any clip that needs the person matte (background removal, retouch, body effects, person or background color). */
export function usesPersonMatte(project) {
  return (project?.tracks || []).some((t) =>
    t.clips.some((c) => (c.cutout || retouchAmounts(c.retouch) || clipUsesBodyEffect(c) || c.colorTarget) && !c.disabled)
  );
}

/** Whether a project needs any of the people models (person matte, face or pose landmarks, hair matte). */
export function usesCutout(project) {
  if (usesPersonMatte(project)) return true;
  const n = faceModelsIn(project);
  return n.face || n.hair || n.pose;
}

/** Load the models a project needs. Resolves to whether its people tools can render. { retry: true } tries failed ones again. */
export async function ensureCutout(project, opts) {
  const ok = await Promise.all([usesPersonMatte(project) ? ready(opts) : true, ensureFaceModels(project, opts)]);
  return ok.every(Boolean);
}

const matteListeners = new Set();

function notifyCutoutReady() {
  for (const fn of matteListeners) {
    try {
      fn();
    } catch {
      /* listener error */
    }
  }
}

/** Call fn whenever a people model finishes loading or produces a new matte (to redraw). */
export function onCutoutReady(fn) {
  const a = onSegmenterChange((s) => {
    if (s === 'ready') fn();
  });
  const b = onFaceModelsReady(fn);
  matteListeners.add(fn);
  return () => {
    a();
    b();
    matteListeners.delete(fn);
  };
}

function waitSeeked(src) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 600);
    src.addEventListener(
      'seeked',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

async function ensureVideoSourceSynced(src, layer) {
  if (!src || typeof src.seeking !== 'boolean') return;
  if (src.seeking) await waitSeeked(src);
  if (typeof src.currentTime === 'number') {
    const targetSec = (layer.sourceTime || 0) / 1e6;
    if (Math.abs(src.currentTime - targetSec) > 0.08) {
      await waitSeeked(src);
    }
  }
}

/** Mattes per clip: the frame they were made from and the result. */
export class MatteCache {
  constructor(onUpdate = null) {
    this.entries = new Map(); // clipId -> { frameKey, raw, fgr, rgba, strokes, canvas, sourceSnap, snapVersion, version, ... }
    this.frameHistory = new Map(); // `${clipId}:${frameKey}` -> frameData { raw, fgr, w, h, sec, frameKey }
    this.input = null;
    this.inputCtx = null;
    this.snap = null;
    this.snapCtx = null;
    this.pending = new Map(); // clipId -> { frameKey, promise, queued }
    this.onUpdate = onUpdate;
  }

  _dims(info) {
    return computeMatteDims(info?.width || 1280, info?.height || 720);
  }

  _input(w, h) {
    if (!this.input || this.input.width !== w || this.input.height !== h) {
      this.input = makeCanvas(w, h);
      this.inputCtx = this.input.getContext('2d', { willReadFrequently: true });
    }
    return this.inputCtx;
  }

  _captureSnap(src, w, h) {
    if (!src || !w || !h) return null;
    if (!this.snap || this.snap.width !== w || this.snap.height !== h) {
      this.snap = makeCanvas(w, h);
      this.snapCtx = this.snap.getContext('2d');
    }
    if (!drawUpright(this.snapCtx, src, w, h)) return null;
    return this.snap;
  }

  async _runSegment(src, info, recurrentState = null, clipId = null) {
    const { w, h } = this._dims(info);
    if (!drawUpright(this._input(w, h), src, w, h)) return null;
    try {
      const res = segment(this.input, { width: w, height: h, recurrentState, stateKey: clipId, downsampleRatio: 0.5 });
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  _applyEntry(clipId, layer, info, frame, snapCanvas = null) {
    let e = this.entries.get(clipId);
    if (!e) {
      e = {
        canvas: makeCanvas(frame.w, frame.h),
        version: 0,
        snapVersion: 0,
        sourceSnap: null,
        sourceSnapCtx: null,
        rgba: null,
        ov: null,
        ovFor: null,
        recurrentState: null,
      };
      this.entries.set(clipId, e);
    }
    if (snapCanvas) {
      const sw = snapCanvas.width;
      const sh = snapCanvas.height;
      if (!e.sourceSnap || e.sourceSnap.width !== sw || e.sourceSnap.height !== sh) {
        e.sourceSnap = makeCanvas(sw, sh);
        e.sourceSnapCtx = e.sourceSnap.getContext('2d');
      }
      e.sourceSnapCtx.clearRect(0, 0, sw, sh);
      e.sourceSnapCtx.drawImage(snapCanvas, 0, 0, sw, sh);
      e.snapVersion = (e.snapVersion || 0) + 1;
    }
    Object.assign(e, {
      frameKey: frame.frameKey,
      raw: frame.raw,
      fgr: frame.fgr || null,
      sec: frame.sec,
      w: frame.w,
      h: frame.h,
      recurrentState: frame.recurrentState !== undefined ? frame.recurrentState : null,
    });
    const strokes = layer.cutout?.strokes || null;
    this._compose(e, strokes, info);
    return e;
  }

  _rememberFrame(clipId, frame) {
    const k = `${clipId}:${frame.frameKey}`;
    if (this.frameHistory.has(k)) this.frameHistory.delete(k);
    this.frameHistory.set(k, {
      frameKey: frame.frameKey,
      raw: new Uint8ClampedArray(frame.raw),
      fgr: frame.fgr ? new Uint8ClampedArray(frame.fgr) : null,
      w: frame.w,
      h: frame.h,
      sec: frame.sec,
      recurrentState: null,
    });
    if (this.frameHistory.size > 150) {
      const oldest = this.frameHistory.keys().next().value;
      this.frameHistory.delete(oldest);
    }
  }

  async _process(layer, info, frameKey, sec) {
    const clipId = layer.clip.id;
    const cached = this.frameHistory.get(`${clipId}:${frameKey}`);
    if (cached) {
      this._applyEntry(clipId, layer, info, cached);
      notifyCutoutReady();
      this.onUpdate?.();
      return;
    }

    const existing = this.pending.get(clipId);
    if (existing) {
      if (existing.frameKey === frameKey) return existing.promise;
      existing.queued = { layer, info, frameKey, sec };
      return existing.promise;
    }

    const state = { frameKey, promise: null, queued: null };
    const run = async () => {
      let cur = { layer, info, frameKey, sec };
      while (cur) {
        state.frameKey = cur.frameKey;
        await ensureVideoSourceSynced(cur.info.source, cur.layer);
        const sw = cur.info?.width || cur.layer.width || 1280;
        const sh = cur.info?.height || cur.layer.height || 720;
        const snapCanvas = cur.info?.dynamic ? this._captureSnap(cur.info.source, sw, sh) : null;
        const segSource = snapCanvas || cur.info.source;
        const e = this.entries.get(clipId);
        const dt = e ? Math.abs(e.sec - cur.sec) : Infinity;
        const near = Boolean(e && e.recurrentState && dt < 0.25 && cur.sec >= (e.sec ?? 0) - 0.05);
        const m = await this._runSegment(segSource, cur.info, near ? e.recurrentState : null, clipId);
        if (m) {
          const steadyNear = near && !m.sceneCut && e?.raw && e.raw.length === m.data.length;
          const raw = steadyMatte(m.data, steadyNear ? e.raw : null, cur.layer.cutout?.smooth ?? CUTOUT_DEFAULT.smooth);
          const frame = {
            frameKey: cur.frameKey,
            raw,
            fgr: m.fgr || null,
            w: m.width,
            h: m.height,
            sec: cur.sec,
            recurrentState: m.recurrentState || null,
          };
          this._rememberFrame(clipId, frame);
          this._applyEntry(clipId, cur.layer, cur.info, frame, snapCanvas);
          notifyCutoutReady();
          this.onUpdate?.();
        }
        cur = state.queued;
        state.queued = null;
      }
    };

    state.promise = run();
    this.pending.set(clipId, state);
    try {
      await state.promise;
    } finally {
      if (this.pending.get(clipId) === state) {
        this.pending.delete(clipId);
      }
    }
  }

  /**
   * Matte entry for a layer showing `info` (the resolved source), or null
   * while the model loads.
   */
  get(layer, info) {
    if (segmenterState() !== 'ready') {
      ready();
      return null;
    }
    const src = info.source;
    if (src && typeof src.seeking === 'boolean' && src.seeking) {
      return this.entries.get(layer.clip.id) || null;
    }
    const targetSec = (layer.sourceTime || 0) / 1e6;
    if (src && typeof src.currentTime === 'number' && typeof src.seeking === 'boolean') {
      if (Math.abs(src.currentTime - targetSec) > 0.08) {
        return this.entries.get(layer.clip.id) || null;
      }
    }
    const { sec, key: frameKey } = frameOf(layer, info);
    const strokes = layer.cutout?.strokes || null;
    const e = this.entries.get(layer.clip.id);
    if (e && e.frameKey === frameKey) {
      if (e.strokes !== strokes) this._compose(e, strokes, info);
      return e;
    }
    const cached = this.frameHistory.get(`${layer.clip.id}:${frameKey}`);
    if (cached) {
      return this._applyEntry(layer.clip.id, layer, info, cached);
    }
    this._process(layer, info, frameKey, sec);
    return e || null;
  }

  /** Ensure the matte for a layer is computed and ready (for export and stills). */
  async ensure(layer, info) {
    if (segmenterState() !== 'ready') {
      await ready({ retry: true });
    }
    const src = info.source;
    if (src && typeof src.seeking === 'boolean' && src.seeking) {
      await new Promise((resolve) => src.addEventListener('seeked', resolve, { once: true }));
    }
    const { sec, key: frameKey } = frameOf(layer, info);
    const e = this.entries.get(layer.clip.id);
    if (e && e.frameKey === frameKey) {
      const strokes = layer.cutout?.strokes || null;
      if (e.strokes !== strokes) this._compose(e, strokes, info);
      return e;
    }
    await this._process(layer, info, frameKey, sec);
    return this.entries.get(layer.clip.id) || null;
  }

  /**
   * Pack unpremultiplied foreground RGB (e.fgr) and stroke-adjusted alpha (data)
   * into an RGBA Uint8Array for direct WebGL2 texture upload without 2D canvas
   * premultiplication loss.
   */
  _compose(e, strokes, info) {
    let data = e.raw;
    if (strokes?.length) {
      if (e.ovFor !== strokes || e.ov?.length !== e.w * e.h) {
        e.ov = strokeOverride(strokes, e.w, e.h, (info.width || 1) / (info.height || 1));
        e.ovFor = strokes;
      }
      data = applyOverride(Uint8ClampedArray.from(e.raw), e.ov);
    }
    if (e.canvas.width !== e.w || e.canvas.height !== e.h) Object.assign(e.canvas, { width: e.w, height: e.h });
    const byteLen = e.w * e.h * 4;
    if (!e.rgba || e.rgba.length !== byteLen) {
      e.rgba = new Uint8Array(byteLen);
    }
    const px = e.rgba;
    const fgr = e.fgr;
    if (fgr && fgr.length === data.length * 3) {
      for (let i = 0; i < data.length; i++) {
        const j = i << 2;
        const k = i * 3;
        px[j] = fgr[k];
        px[j + 1] = fgr[k + 1];
        px[j + 2] = fgr[k + 2];
        px[j + 3] = data[i];
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        const j = i << 2;
        px[j] = 255;
        px[j + 1] = 255;
        px[j + 2] = 255;
        px[j + 3] = data[i];
      }
    }
    e.strokes = strokes;
    e.version++;
  }

  dispose() {
    this.entries.clear();
    this.frameHistory.clear();
    this.pending.clear();
  }
}

/**
 * Bind the person matte of a layer on MATTE_UNIT. Returns the texture
 * entry, null while the model loads (it starts loading), or undefined when
 * it cannot be had. comp.personMatte(layer, info), when set, supplies the
 * matte instead (look previews use a drawn one).
 */
export function bindPersonMatte(comp, layer, info) {
  let e;
  if (comp.personMatte) e = comp.personMatte(layer, info);
  else {
    comp._matteCache ||= new MatteCache(() => comp._redraw?.());
    e = comp._matteCache.get(layer, info);
  }
  if (!e) return segmenterState() === 'failed' ? undefined : null;
  const gl = comp.gl;
  gl.activeTexture(gl.TEXTURE0 + MATTE_UNIT);
  const w = e.w || e.canvas.width;
  const h = e.h || e.canvas.height;
  const t = comp._texture({
    key: `matte:${layer.clip.id}`,
    source: e.rgba || e.canvas,
    width: w,
    height: h,
    version: e.version,
  });
  let matchedTex = null;
  if (info?.dynamic && e.sourceSnap && e.frameKey !== frameOf(layer, info).key) {
    gl.activeTexture(gl.TEXTURE0);
    matchedTex = comp._texture({
      key: `matteSnap:${layer.clip.id}`,
      source: e.sourceSnap,
      width: e.sourceSnap.width,
      height: e.sourceSnap.height,
      version: e.snapVersion,
    });
  }
  gl.activeTexture(gl.TEXTURE0);
  return t ? { ...t, mw: w, mh: h, matchedTex } : undefined;
}

/** Ensure the person matte of a layer is ready before drawing (export and stills). */
export async function ensurePersonMatte(comp, layer, info) {
  if (comp.personMatte) return comp.personMatte(layer, info);
  comp._matteCache ||= new MatteCache(() => comp._redraw?.());
  return comp._matteCache.ensure(layer, info);
}

/** Set the matte, cutout and retouch uniforms of the layer program for a layer drawn from `info`. */
export function bindLayerMatte(comp, p, layer, info) {
  let on = 0;
  let matchedTex = null;
  const media = layer.kind === 'media' && layer.clip && info?.source;
  const cut = Boolean(media && layer.cutout);
  const touch = media ? retouchAmounts(layer.retouch) : null;
  const target = media ? COLOR_TARGETS[layer.colorTarget] || 0 : 0;
  if (cut || touch || target) {
    const t = bindPersonMatte(comp, layer, info);
    if (t) {
      on = 1;
      if (cut && t.matchedTex) matchedTex = t.matchedTex;
      const [lo, hi] = matteWindow(layer.cutout);
      comp._set(p, 'u_matteWin', lo, hi);
      comp._set(p, 'u_matteTexel', 1 / t.mw, 1 / t.mh);
      comp._set(p, 'u_fgDecontaminate', cut ? foregroundDecontaminationAmount(layer.cutout) : 0);
    } else if (t === null) {
      // Still loading: hide a cut-out clip rather than flash its background.
      on = 2;
    }
  }
  comp._seti(p, 'u_matteTex', MATTE_UNIT);
  comp._seti(p, 'u_matteOn', on);
  comp._seti(p, 'u_cutOn', cut ? 1 : 0);
  comp._seti(p, 'u_retouchOn', touch ? 1 : 0);
  if (touch) comp._set(p, 'u_retouch', touch);
  comp._seti(p, 'u_colorTarget', target);
  comp._seti(p, 'u_maskColor', media && layer.maskUse === 'color' && layer.masks?.length ? 1 : 0);
  bindBodyLayer(comp, p, layer, info);
  bindFaceLayer(comp, p, layer, info);
  return matchedTex;
}

const COLOR_TARGETS = { person: 1, background: 2 };
