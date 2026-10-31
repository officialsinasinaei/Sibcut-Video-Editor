/**
 * Compositor side of automatic background removal (model/cutout.js) and
 * skin retouch (model/retouch.js): finds the person matte of the frame a
 * layer is showing, keeps it per clip until the frame changes, and binds it
 * for LAYER_FS, which refines the soft low-resolution matte against the
 * full picture to cut the person out, and limits retouching to people. The
 * face and hair tools have their own models (engine/face-render.js).
 */
import { SEG_SIZE, segment, ready, segmenterState, onSegmenterChange } from '../media/segmenter.js';
import { matteWindow, steadyMatte, strokeOverride, applyOverride, CUTOUT_DEFAULT } from '../model/cutout.js';
import { retouchAmounts } from '../model/retouch.js';
import { clipUsesBodyEffect } from '../model/body-effects.js';
import { frameOf, drawUpright, faceModelsIn, ensureFaceModels, onFaceModelsReady, bindFaceLayer } from './face-render.js';
import { bindBodyLayer } from './body-render.js';

/** Texture unit of the matte (masks use 6). */
export const MATTE_UNIT = 7;

const makeCanvas = (w, h) => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

/** Whether a project has any clip that needs the person matte (background removal, retouch, body effects, person or background color). */
export function usesPersonMatte(project) {
  return (project?.tracks || []).some((t) => t.clips.some((c) => (c.cutout || retouchAmounts(c.retouch) || clipUsesBodyEffect(c) || c.colorTarget) && !c.disabled));
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

/** Mattes per clip: the frame they were made from and the result. */
export class MatteCache {
  constructor(onUpdate = null) {
    this.entries = new Map(); // clipId -> { frameKey, raw (model matte), strokes, canvas, version, ... }
    this.input = null;
    this.inputCtx = null;
    this.pending = new Map(); // clipId -> frameKey
    this.onUpdate = onUpdate;
  }

  _dims(info) {
    const sw = info?.width || 1280;
    const sh = info?.height || 720;
    const aspect = sw / sh;
    const maxDim = 640;
    let w, h;
    if (aspect >= 1) {
      w = maxDim;
      h = Math.round(maxDim / aspect);
    } else {
      h = maxDim;
      w = Math.round(maxDim * aspect);
    }
    w = Math.max(16, Math.round(w / 2) * 2);
    h = Math.max(16, Math.round(h / 2) * 2);
    return { w, h };
  }

  _input(w, h) {
    if (!this.input || this.input.width !== w || this.input.height !== h) {
      this.input = makeCanvas(w, h);
      this.inputCtx = this.input.getContext('2d', { willReadFrequently: true });
    }
    return this.inputCtx;
  }

  async _runSegment(src, info, recurrentState = null) {
    const { w, h } = this._dims(info);
    if (!drawUpright(this._input(w, h), src, w, h)) return null;
    try {
      const res = segment(this.input, { width: w, height: h, recurrentState, downsampleRatio: 0.5 });
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async _process(layer, info, frameKey, sec) {
    const clipId = layer.clip.id;
    const existing = this.pending.get(clipId);
    if (existing && existing.frameKey === frameKey) {
      return existing.promise;
    }

    const run = async () => {
      const src = info.source;
      if (src && typeof src.seeking === 'boolean' && src.seeking) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 600);
          src.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
      }
      if (src && typeof src.currentTime === 'number' && typeof src.seeking === 'boolean') {
        const targetSec = (layer.sourceTime || 0) / 1e6;
        if (Math.abs(src.currentTime - targetSec) > 0.08) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 600);
            src.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once: true });
          });
        }
      }
      let e = this.entries.get(clipId);
      const near = Boolean(e && Math.abs(e.sec - sec) < 0.2);
      const m = await this._runSegment(info.source, info, near ? e?.recurrentState : null);
      if (!m) return;
      const steadyNear = near && e?.raw && e.raw.length === m.data.length;
      const raw = steadyMatte(m.data, steadyNear ? e.raw : null, layer.cutout?.smooth ?? CUTOUT_DEFAULT.smooth);
      if (!e) {
        e = { canvas: makeCanvas(m.width, m.height), version: 0, img: null, ov: null, ovFor: null, recurrentState: null };
        this.entries.set(clipId, e);
      }
      Object.assign(e, { frameKey, raw, sec, w: m.width, h: m.height, recurrentState: m.recurrentState || null });
      const strokes = layer.cutout?.strokes || null;
      this._compose(e, strokes, info);
      notifyCutoutReady();
      this.onUpdate?.();
    };

    const promise = run();
    this.pending.set(clipId, { frameKey, promise });
    try {
      await promise;
    } finally {
      if (this.pending.get(clipId)?.frameKey === frameKey) {
        this.pending.delete(clipId);
      }
    }
  }

  /**
   * Matte canvas for a layer showing `info` (the resolved source), or null
   * while the model loads. The canvas is upright and the size of the model.
   */
  get(layer, info) {
    if (segmenterState() !== 'ready') {
      ready();
      return null;
    }
    const src = info.source;
    if (src && typeof src.seeking === 'boolean' && src.seeking) {
      let e = this.entries.get(layer.clip.id);
      return e || null;
    }
    const targetSec = (layer.sourceTime || 0) / 1e6;
    if (src && typeof src.currentTime === 'number' && typeof src.seeking === 'boolean') {
      if (Math.abs(src.currentTime - targetSec) > 0.08) {
        let e = this.entries.get(layer.clip.id);
        return e || null;
      }
    }
    const { sec, key: frameKey } = frameOf(layer, info);
    const strokes = layer.cutout?.strokes || null;
    let e = this.entries.get(layer.clip.id);
    if (e && e.frameKey === frameKey) {
      if (e.strokes !== strokes) this._compose(e, strokes, info);
      return e;
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
    let e = this.entries.get(layer.clip.id);
    if (e && e.frameKey === frameKey) {
      const strokes = layer.cutout?.strokes || null;
      if (e.strokes !== strokes) this._compose(e, strokes, info);
      return e;
    }
    await this._process(layer, info, frameKey, sec);
    return this.entries.get(layer.clip.id) || null;
  }

  /** Hand-painted strokes over the model's matte, written to the matte canvas. */
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
    if (!e.img || e.img.width !== e.w || e.img.height !== e.h) {
      e.img = new ImageData(e.w, e.h);
      e.img.data.fill(255);
    }
    const px = e.img.data;
    for (let i = 0; i < data.length; i++) px[i * 4 + 3] = data[i];
    e.canvas.getContext('2d').putImageData(e.img, 0, 0);
    e.strokes = strokes;
    e.version++;
  }

  dispose() {
    this.entries.clear();
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
  const t = comp._texture({ key: `matte:${layer.clip.id}`, source: e.canvas, width: e.canvas.width, height: e.canvas.height, version: e.version });
  gl.activeTexture(gl.TEXTURE0);
  return t ? { ...t, mw: e.canvas.width, mh: e.canvas.height } : undefined;
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
  const media = layer.kind === 'media' && layer.clip && info?.source;
  const cut = Boolean(media && layer.cutout);
  const touch = media ? retouchAmounts(layer.retouch) : null;
  const target = media ? COLOR_TARGETS[layer.colorTarget] || 0 : 0;
  if (cut || touch || target) {
    const t = bindPersonMatte(comp, layer, info);
    if (t) {
      on = 1;
      const [lo, hi] = matteWindow(layer.cutout);
      comp._set(p, 'u_matteWin', lo, hi);
      comp._set(p, 'u_matteTexel', 1 / t.mw, 1 / t.mh);
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
}

const COLOR_TARGETS = { person: 1, background: 2 };
