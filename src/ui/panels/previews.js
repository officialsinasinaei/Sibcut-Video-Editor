/**
 * Thumbnail previews for effects, filters and transitions, rendered with the
 * real compositor onto a generated sample scene so each tile shows exactly
 * what the look does. One small offscreen GL context serves every tile.
 * Tiles render when they scroll into view, a few per frame, so opening a tab
 * with dozens of looks compiles only the shaders that are actually shown.
 */
import { Compositor } from '../../engine/compositor.js';
import { DEFAULT_ADJUST } from '../../model/project.js';
import { effectDefaults } from '../../model/effect-params.js';
import { isBodyEffect } from '../../model/body-effects.js';
import { EFFECTS, FILTERS, TRANSITIONS } from '../../model/catalog.js';

/** Search: a look matches by its label or its category's label. */
export function matchesLook(item, q, categories = []) {
  if (!q) return true;
  const cat = categories.find((c) => c.id === item.cat)?.label || '';
  return item.label.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
}

/** Params a tile shows an effect with: its defaults, with on/off strength turned up enough to read. */
function previewParams(id) {
  const p = effectDefaults(id);
  if (typeof p.strength === 'number') p.strength = Math.max(p.strength, 60);
  return p;
}

const effectLayer = (id, t) => ({ kind: 'effect', effect: id, params: previewParams(id), local: t * 1e6, duration: 2e6 });

/** Layers that show an effect: over the category photo (or sample scene), or on the figure for body effects. */
const effectLayers = (id, t, cat) => {
  const c = cat || EFFECTS.find((e) => e.id === id)?.cat || 'basic';
  return isBodyEffect(id)
    ? [mediaLayer('cat:fx:body', { effects: [{ id, params: previewParams(id) }], fxTime: t * 1e6, fxDur: 2e6 })]
    : [mediaLayer(`cat:fx:${c}`), effectLayer(id, t)];
};

export const PREVIEW_ASSETS = {
  // Effects
  'fx:basic': 'fx-basic.jpg',
  'fx:motion': 'fx-motion.jpg',
  'fx:light': 'fx-light.jpg',
  'fx:retro': 'fx-retro.jpg',
  'fx:glitch': 'fx-glitch.jpg',
  'fx:distort': 'fx-distort.jpg',
  'fx:stylize': 'fx-stylize.jpg',
  'fx:party': 'fx-party.jpg',
  'fx:frames': 'fx-frames.jpg',
  'fx:weather': 'fx-weather.jpg',
  'fx:body': 'fx-body.jpg',

  // Filters
  'filter:featured': 'filter-featured.jpg',
  'filter:portrait': 'filter-portrait.jpg',
  'filter:landscape': 'filter-landscape.jpg',
  'filter:food': 'filter-food.jpg',
  'filter:film': 'filter-film.jpg',
  'filter:vintage': 'filter-vintage.jpg',
  'filter:mono': 'filter-mono.jpg',
  'filter:cinematic': 'filter-cinematic.jpg',
  'filter:night': 'filter-night.jpg',
  'filter:warm': 'filter-warm.jpg',
  'filter:cool': 'filter-cool.jpg',

  // Transitions
  'trans:a:basic': 'trans-a-basic.jpg',
  'trans:b:basic': 'trans-b-basic.jpg',
  'trans:a:slide': 'trans-a-slide.jpg',
  'trans:b:slide': 'trans-b-slide.jpg',
  'trans:a:shape': 'trans-a-shape.jpg',
  'trans:b:shape': 'trans-b-shape.jpg',
  'trans:a:zoom': 'trans-a-zoom.jpg',
  'trans:b:zoom': 'trans-b-zoom.jpg',
  'trans:a:light': 'trans-a-light.jpg',
  'trans:b:light': 'trans-b-light.jpg',
  'trans:a:glitch': 'trans-a-glitch.jpg',
  'trans:b:glitch': 'trans-b-glitch.jpg',
  'trans:a:3d': 'trans-a-3d.jpg',
  'trans:b:3d': 'trans-b-3d.jpg',
  'trans:a:blur': 'trans-a-blur.jpg',
  'trans:b:blur': 'trans-b-blur.jpg',

  // Color
  'color:layer': 'color-layer.jpg',
  'color:luts': 'color-luts.jpg',
  'color:presets': 'color-presets.jpg',
};

const loadedImages = new Map();
const failedImages = new Set();
const pendingListeners = new Map();

function previewUrl(fileName) {
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      return new URL(`previews/${fileName}`, document.baseURI).href;
    } catch {}
  }
  return `previews/${fileName}`;
}

export function loadPreviewImage(key) {
  if (loadedImages.has(key)) return loadedImages.get(key);
  if (failedImages.has(key)) return null;
  const fileName = PREVIEW_ASSETS[key];
  if (!fileName || typeof Image === 'undefined') return null;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';

  img.onload = () => {
    loadedImages.set(key, img);
    const listeners = pendingListeners.get(key);
    if (listeners) {
      pendingListeners.delete(key);
      listeners.forEach((fn) => {
        try { fn(img); } catch {}
      });
    }
  };
  img.onerror = () => {
    failedImages.add(key);
    const listeners = pendingListeners.get(key);
    if (listeners) {
      pendingListeners.delete(key);
      listeners.forEach((fn) => {
        try { fn(null); } catch {}
      });
    }
  };
  img.src = previewUrl(fileName);
  if (img.complete && img.naturalWidth > 0) {
    loadedImages.set(key, img);
  }
  return loadedImages.get(key) || null;
}

export function onAssetReady(key, cb) {
  if (loadedImages.has(key)) {
    cb(loadedImages.get(key));
    return;
  }
  if (failedImages.has(key)) {
    cb(null);
    return;
  }
  let list = pendingListeners.get(key);
  if (!list) {
    list = new Set();
    pendingListeners.set(key, list);
  }
  list.add(cb);
  loadPreviewImage(key);
}

// Preload in browser / Electron environment
if (typeof Image !== 'undefined') {
  for (const k of Object.keys(PREVIEW_ASSETS)) {
    loadPreviewImage(k);
  }
}

export function getRequiredAssetKeys(kind, cat, id) {
  if (kind === 'effect') {
    const c = cat || EFFECTS.find((e) => e.id === id)?.cat || 'basic';
    return isBodyEffect(id) ? ['fx:body'] : [`fx:${c}`];
  }
  if (kind === 'filter') {
    const c = cat || FILTERS.find((f) => f.id === id)?.cat || 'featured';
    return [`filter:${c}`];
  }
  if (kind === 'transition') {
    const c = cat || TRANSITIONS.find((t) => t.id === id)?.cat || 'basic';
    return [`trans:a:${c}`, `trans:b:${c}`];
  }
  if (kind === 'color') {
    return [`color:${cat || 'layer'}`];
  }
  return [];
}

const W = 192;
const H = 108;
let shared = null;
const cache = new Map();
const stacks = new Map(); // key -> effect list, for 'stack' previews

function sampleScene(warm) {
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d');
  if (!g) return c;
  const w = c.width;
  const hh = c.height;
  const sky = g.createLinearGradient(0, 0, 0, hh);
  sky.addColorStop(0, warm ? '#ff9a62' : '#4f8dd6');
  sky.addColorStop(0.6, warm ? '#ffd49a' : '#b6dcf5');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, hh);
  g.fillStyle = warm ? '#fff3c4' : '#ffffff';
  g.beginPath();
  g.arc(w * 0.72, hh * 0.34, hh * 0.13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = warm ? '#7a3b4a' : '#2f6f5b';
  g.beginPath();
  g.moveTo(0, hh * 0.72);
  g.quadraticCurveTo(w * 0.25, hh * 0.48, w * 0.5, hh * 0.68);
  g.quadraticCurveTo(w * 0.75, hh * 0.86, w, hh * 0.6);
  g.lineTo(w, hh);
  g.lineTo(0, hh);
  g.fill();
  g.fillStyle = warm ? '#3c1f33' : '#1d4038';
  g.beginPath();
  g.moveTo(0, hh * 0.86);
  g.quadraticCurveTo(w * 0.4, hh * 0.7, w, hh * 0.9);
  g.lineTo(w, hh);
  g.lineTo(0, hh);
  g.fill();
  // A figure so motion effects read.
  g.fillStyle = warm ? '#2a1424' : '#14302a';
  g.beginPath();
  g.arc(w * 0.3, hh * 0.5, hh * 0.06, 0, Math.PI * 2);
  g.fill();
  g.fillRect(w * 0.285, hh * 0.56, w * 0.03, hh * 0.18);
  return c;
}

/** A standing figure, for body effect tiles: drawn in color on a scene, or white alone as its matte. */
function drawFigure(g, w, hh, fill) {
  const x = w * 0.5;
  g.fillStyle = fill.skin || fill;
  g.beginPath();
  g.ellipse(x, hh * 0.3, hh * 0.085, hh * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(x - hh * 0.03, hh * 0.37, hh * 0.06, hh * 0.06);
  g.fillStyle = fill.shirt || fill;
  g.beginPath();
  g.moveTo(x - hh * 0.2, hh * 0.47);
  g.quadraticCurveTo(x, hh * 0.39, x + hh * 0.2, hh * 0.47);
  g.lineTo(x + hh * 0.24, hh);
  g.lineTo(x - hh * 0.24, hh);
  g.closePath();
  g.fill();
}

function personScene() {
  const c = sampleScene(false);
  const g = c.getContext('2d');
  if (g) drawFigure(g, c.width, c.height, { skin: '#d9a07a', shirt: '#e2513c' });
  return c;
}

function personMatte() {
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d');
  if (g) drawFigure(g, c.width, c.height, '#ffffff');
  return c;
}

/** A standing silhouette matched to fx-body.jpg for body effect overlays. */
function bodyMatte() {
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d');
  if (!g) return c;
  const w = c.width;
  const hh = c.height;
  g.fillStyle = '#ffffff';
  g.beginPath();
  // Head
  g.ellipse(w * 0.445, hh * 0.35, w * 0.021, hh * 0.045, 0, 0, Math.PI * 2);
  g.fill();
  // Torso and legs
  g.beginPath();
  g.moveTo(w * 0.437, hh * 0.393);
  g.lineTo(w * 0.401, hh * 0.444);
  g.bezierCurveTo(w * 0.398, hh * 0.509, w * 0.401, hh * 0.56, w * 0.406, hh * 0.620);
  g.lineTo(w * 0.408, hh * 0.770);
  g.lineTo(w * 0.474, hh * 0.770);
  g.lineTo(w * 0.476, hh * 0.620);
  g.bezierCurveTo(w * 0.487, hh * 0.56, w * 0.487, hh * 0.509, w * 0.487, hh * 0.444);
  g.lineTo(w * 0.453, hh * 0.393);
  g.closePath();
  g.fill();
  return c;
}

function engine() {
  if (shared !== null) return shared;
  try {
    const canvas = document.createElement('canvas');
    const scenes = { a: sampleScene(true), b: sampleScene(false), p: personScene() };
    const comp = new Compositor(canvas, {
      resolve: (layer) => {
        const id = layer.clip.id;
        if (id && id.startsWith('cat:')) {
          const assetKey = id.slice(4);
          const img = loadedImages.get(assetKey);
          if (img && img.naturalWidth > 0) {
            return { key: `preview:${assetKey}`, source: img, width: img.naturalWidth, height: img.naturalHeight, version: 1 };
          }
          if (assetKey.startsWith('trans:b:')) {
            return { key: 'sample:b', source: scenes.b, width: scenes.b.width, height: scenes.b.height, version: 1 };
          }
          if (assetKey === 'fx:body') {
            return { key: 'sample:p', source: scenes.p, width: scenes.p.width, height: scenes.p.height, version: 1 };
          }
          return { key: 'sample:a', source: scenes.a, width: scenes.a.width, height: scenes.a.height, version: 1 };
        }
        const src = scenes[id];
        return src ? { key: `sample:${id}`, source: src, width: src.width, height: src.height, version: 1 } : null;
      },
    });
    const matte = { canvas: personMatte(), version: 1 };
    const photoMatte = { canvas: bodyMatte(), version: 1 };
    comp.personMatte = (layer) => (layer.clip?.id === 'cat:fx:body' ? photoMatte : layer.clip?.id === 'p' ? matte : null);
    comp.resize(W, H, W, H);
    shared = { comp, canvas };
  } catch {
    shared = false;
  }
  return shared;
}

function mediaLayer(id, extra = {}) {
  return { kind: 'media', clip: { id }, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, blur: 0, reveal: 1, blend: 'normal', width: W * 2, height: H * 2, crop: { l: 0, t: 0, r: 0, b: 0 }, adjust: DEFAULT_ADJUST, filter: null, ...extra };
}

/** Render a look into ctx2d now (and cache it). */
function drawLook(ctx2d, kind, id, progress, time, cat) {
  const key = `${kind}:${id}:${cat || ''}:${progress}:${time}`;
  const hit = cache.get(key);
  if (hit) {
    ctx2d.drawImage(hit, 0, 0);
    return;
  }
  const e = engine();
  if (!e) {
    ctx2d.fillStyle = '#333';
    ctx2d.fillRect(0, 0, W, H);
    return;
  }
  let layers;
  if (kind === 'transition') {
    const transCat = cat || TRANSITIONS.find((t) => t.id === id)?.cat || 'basic';
    layers = [{
      kind: 'transition',
      id,
      progress,
      from: mediaLayer(`cat:trans:a:${transCat}`),
      to: mediaLayer(`cat:trans:b:${transCat}`),
    }];
  } else if (kind === 'filter') {
    const filterCat = cat || FILTERS.find((f) => f.id === id)?.cat || 'featured';
    layers = [mediaLayer(`cat:filter:${filterCat}`, { filter: id && id !== 'none' ? { id, intensity: 100 } : null })];
  } else if (kind === 'effect') {
    layers = effectLayers(id, time, cat);
  } else if (kind === 'stack') {
    layers = [mediaLayer('p', { effects: stacks.get(id) || [], fxTime: time * 1e6, fxDur: 2e6 })];
  } else {
    layers = [mediaLayer(`cat:filter:${cat || 'featured'}`)];
  }
  e.comp.render(layers, { settings: { background: { type: 'color', color: '#000000' } }, time });
  ctx2d.drawImage(e.canvas, 0, 0);

  const requiredKeys = getRequiredAssetKeys(kind, cat, id);
  const isReady = requiredKeys.every((k) => loadedImages.has(k) || failedImages.has(k));
  if (isReady) {
    // Keep a copy so re-rendering the grid is cheap.
    const keep = document.createElement('canvas');
    keep.width = W;
    keep.height = H;
    keep.getContext('2d')?.drawImage(e.canvas, 0, 0);
    cache.set(key, keep);
  } else {
    for (const k of requiredKeys) {
      if (!loadedImages.has(k) && !failedImages.has(k)) {
        onAssetReady(k, () => {
          drawLook(ctx2d, kind, id, progress, time, cat);
        });
      }
    }
  }
}

/* Lazy rendering: tiles draw when visible, within a small time budget per frame. */
const jobs = new Map(); // canvas -> draw()
let observer = null;
let pumping = false;

function pump() {
  pumping = false;
  const start = performance.now();
  for (const [canvas, draw] of jobs) {
    if (!canvas.isConnected) {
      jobs.delete(canvas);
      continue;
    }
    if (!canvas.dataset.visible) continue;
    jobs.delete(canvas);
    observer?.unobserve(canvas);
    draw();
    if (performance.now() - start > 10) break;
  }
  if ([...jobs.keys()].some((c) => c.dataset.visible)) schedulePump();
}

function schedulePump() {
  if (pumping) return;
  pumping = true;
  requestAnimationFrame(pump);
}

function deferDraw(canvas, draw) {
  if (typeof IntersectionObserver !== 'function' || typeof requestAnimationFrame !== 'function') {
    draw();
    return;
  }
  observer ||= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) en.target.dataset.visible = '1';
      else delete en.target.dataset.visible;
    }
    schedulePump();
  }, { rootMargin: '200px' });
  jobs.set(canvas, draw);
  observer.observe(canvas);
}

/** Draw a preview into a new canvas. kind: 'effect' | 'filter' | 'transition' | 'none'. */
export function lookPreview(kind, id, { progress = 0.5, time = 0.6, lazy = true, cat = null } = {}) {
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.className = 'tile-canvas';
  out.setAttribute('aria-hidden', 'true');
  const ctx2d = out.getContext('2d');
  if (!ctx2d) return out;
  const key = `${kind}:${id}:${cat || ''}:${progress}:${time}`;
  if (!lazy || cache.has(key)) drawLook(ctx2d, kind, id, progress, time, cat);
  else deferDraw(out, () => drawLook(ctx2d, kind, id, progress, time, cat));
  return out;
}

/**
 * Preview of an effect list on the sample scene with a person, as a clip's
 * own stack (style looks). key names the list for the cache.
 */
export function stackPreview(effects, key, opts) {
  stacks.set(key, effects);
  return lookPreview('stack', key, opts);
}

/**
 * Animate a preview while hovered: transitions sweep, effects run over time,
 * filters wipe back and forth between the original and the look.
 */
export function animatePreview(canvas, kind, id, opts = {}) {
  const cat = typeof opts === 'string' ? opts : opts?.cat;
  let raf = 0;
  let start = 0;
  const e = engine();
  if (!e) return () => {};
  const ctx2d = canvas.getContext('2d');
  const frame = (now) => {
    // A tile replaced while hovered never gets pointerleave.
    if (!canvas.isConnected) {
      raf = 0;
      return;
    }
    if (!start) start = now;
    const t = (now - start) / 1000;
    let layers;
    if (kind === 'transition') {
      const transCat = cat || TRANSITIONS.find((tr) => tr.id === id)?.cat || 'basic';
      layers = [{
        kind: 'transition',
        id,
        progress: (t % 1.6) / 1.6,
        from: mediaLayer(`cat:trans:a:${transCat}`),
        to: mediaLayer(`cat:trans:b:${transCat}`),
      }];
    } else if (kind === 'filter') {
      const filterCat = cat || FILTERS.find((f) => f.id === id)?.cat || 'featured';
      const base = `cat:filter:${filterCat}`;
      layers = [{
        kind: 'transition',
        id: 'wipe-right',
        progress: 0.5 - 0.42 * Math.cos(t * 2.2),
        from: mediaLayer(base),
        to: mediaLayer(base, { filter: { id, intensity: 100 } }),
      }];
    } else if (kind === 'effect') {
      layers = effectLayers(id, t, cat);
    } else {
      layers = [mediaLayer(`cat:filter:${cat || 'featured'}`)];
    }
    e.comp.render(layers, { settings: { background: { type: 'color', color: '#000000' } }, time: t });
    ctx2d.drawImage(e.canvas, 0, 0);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  stop.running = () => raf !== 0;
  return stop;
}

/** Wire hover/focus animation on a tile whose preview canvas is inside. */
export function hoverAnimate(tileEl, kind, id, opts = {}) {
  const cat = typeof opts === 'string' ? opts : opts?.cat;
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let stop = null;
  const on = () => {
    if (stop?.running?.()) return;
    const c = tileEl.querySelector('canvas');
    if (c) stop = animatePreview(c, kind, id, { cat });
  };
  const off = () => {
    stop?.();
    stop = null;
    const c = tileEl.querySelector('canvas');
    const g = c?.getContext('2d');
    if (g) drawLook(g, kind, id, 0.5, 0.6, cat);
  };
  tileEl.addEventListener('pointerenter', on);
  tileEl.addEventListener('pointerleave', off);
  tileEl.addEventListener('focus', on);
  tileEl.addEventListener('blur', off);
}

/**
 * Preview of a color setup (adjust values and grade) on the sample scene,
 * drawn into canvas (a new one when omitted). Not cached: LUT previews are
 * redrawn once their table has loaded.
 */
export function gradePreview({ adjust = DEFAULT_ADJUST, grade = null } = {}, canvas = null, opts = 'layer') {
  const cat = typeof opts === 'string' ? opts : (opts?.cat || 'layer');
  const out = canvas || document.createElement('canvas');
  out.width = W;
  out.height = H;
  out.className = 'tile-canvas';
  out.setAttribute('aria-hidden', 'true');
  const ctx2d = out.getContext('2d');
  const e = ctx2d ? engine() : null;
  if (!e) {
    ctx2d?.fillRect(0, 0, W, H);
    return out;
  }
  const assetKey = `color:${cat}`;
  e.comp.render([mediaLayer(`cat:${assetKey}`, { adjust: { ...DEFAULT_ADJUST, ...adjust }, grade })], { settings: { background: { type: 'color', color: '#000000' } }, time: 0.6 });
  ctx2d.drawImage(e.canvas, 0, 0);
  if (!loadedImages.has(assetKey) && !failedImages.has(assetKey)) {
    onAssetReady(assetKey, () => {
      gradePreview({ adjust, grade }, out, opts);
    });
  }
  return out;
}
