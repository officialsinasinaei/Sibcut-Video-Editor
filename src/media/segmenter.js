/**
 * Person segmentation that runs on this device: RobustVideoMatting (RVM)
 * MobileNetV3 FP32 on ONNX Runtime Web, bundled with the app and only fetched
 * the first time background removal is used. Produces high-fidelity continuous
 * sub-pixel alpha mattes with recurrent temporal stability.
 */
import * as ort from 'onnxruntime-web';
import modelUrl from './models/rvm_mobilenetv3.onnx?url';
import { lazyModel } from './lazy-model.js';

/** Base side dimension for backwards compatibility with tests and callers. */
export const SEG_SIZE = 256;

// Configure ONNX Runtime Web WASM paths locally so no external network requests are made.
if (typeof location !== 'undefined') {
  ort.env.wasm.wasmPaths = './';
}
if (typeof navigator !== 'undefined' && typeof self !== 'undefined' && !self.crossOriginIsolated) {
  ort.env.wasm.numThreads = 1;
}

const makeCanvas = (w, h) =>
  typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });

let helperCanvas = null;
let helperCtx = null;
function getHelper(w, h) {
  if (!helperCanvas || helperCanvas.width !== w || helperCanvas.height !== h) {
    helperCanvas = makeCanvas(w, h);
    helperCtx = helperCanvas.getContext('2d', { willReadFrequently: true });
  }
  return helperCtx;
}

// Recurrent state tracking across frames for video temporal coherence
let recurrentState = null;

export function resetRecurrentState() {
  recurrentState = null;
}

const model = lazyModel(async () => {
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();

  const session = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return session;
}, 'Background removal could not start in this browser.');

/** Subscribe to the model becoming ready (or failing); returns an unsubscribe. */
export const onSegmenterChange = (fn) => model.onChange(fn);
export const segmenterState = () => model.state();
export const segmenterError = () => model.error();
/** Load the model (once). Resolves to true when segment() can be used. { retry: true } tries again after a failure. */
export const ready = (opts) => model.ready(opts);

/**
 * Person alpha matte (0..255 continuous per pixel, width x height, rows top to
 * bottom), or null while not ready.
 */
export async function segment(image, opts = {}) {
  const session = model.instance;
  if (!session) return null;

  try {
    const srcW = image.videoWidth || image.naturalWidth || image.width || 640;
    const srcH = image.videoHeight || image.naturalHeight || image.height || 360;

    let w = opts.width;
    let h = opts.height;
    if (!w || !h) {
      const maxDim = 640;
      const aspect = srcW / srcH;
      if (aspect >= 1) {
        w = maxDim;
        h = Math.round(maxDim / aspect);
      } else {
        h = maxDim;
        w = Math.round(maxDim * aspect);
      }
      w = Math.max(16, Math.round(w / 2) * 2);
      h = Math.max(16, Math.round(h / 2) * 2);
    }

    let px;
    if (typeof ImageData !== 'undefined' && image instanceof ImageData) {
      w = image.width;
      h = image.height;
      px = image.data;
    } else if (
      ((typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
        (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas)) &&
      image.width === w &&
      image.height === h
    ) {
      px = image.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    } else {
      const g = getHelper(w, h);
      g.clearRect(0, 0, w, h);
      g.drawImage(image, 0, 0, w, h);
      px = g.getImageData(0, 0, w, h).data;
    }

    const planeSize = w * h;
    const floatData = new Float32Array(3 * planeSize);
    for (let i = 0; i < planeSize; i++) {
      const p4 = i * 4;
      floatData[i] = px[p4] / 255.0;
      floatData[planeSize + i] = px[p4 + 1] / 255.0;
      floatData[2 * planeSize + i] = px[p4 + 2] / 255.0;
    }

    const srcTensor = new ort.Tensor('float32', floatData, [1, 3, h, w]);
    const zeroState = () => new ort.Tensor('float32', new Float32Array([0]), [1, 1, 1, 1]);

    let stateToUse = null;
    if (opts.recurrentState !== undefined) {
      stateToUse = opts.recurrentState;
    } else if (opts.recurrent !== false) {
      stateToUse = recurrentState;
    }
    const hasValidState = Boolean(stateToUse && stateToUse.w === w && stateToUse.h === h);

    const downsampleRatio = opts.downsampleRatio ?? 0.5;
    const feeds = {
      src: srcTensor,
      r1i: hasValidState ? stateToUse.r1 : zeroState(),
      r2i: hasValidState ? stateToUse.r2 : zeroState(),
      r3i: hasValidState ? stateToUse.r3 : zeroState(),
      r4i: hasValidState ? stateToUse.r4 : zeroState(),
      downsample_ratio: new ort.Tensor('float32', new Float32Array([downsampleRatio]), [1]),
    };

    const results = await session.run(feeds);
    const nextRecurrent = {
      r1: results.r1o,
      r2: results.r2o,
      r3: results.r3o,
      r4: results.r4o,
      w,
      h,
    };
    if (opts.recurrent !== false) {
      recurrentState = nextRecurrent;
    } else {
      recurrentState = null;
    }

    const pha = results.pha.data;
    const out = new Uint8ClampedArray(planeSize);
    for (let i = 0; i < planeSize; i++) {
      out[i] = Math.round(Math.max(0, Math.min(1, pha[i])) * 255);
    }
    return { data: out, width: w, height: h, recurrentState: nextRecurrent };
  } catch (err) {
    console.error('[segmenter]', err);
    return null;
  }
}
