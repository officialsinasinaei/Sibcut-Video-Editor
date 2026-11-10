/**
 * Person segmentation that runs on this device: RobustVideoMatting (RVM)
 * MobileNetV3 FP32 on ONNX Runtime Web, bundled with the app and only fetched
 * the first time background removal is used. Produces high-fidelity continuous
 * sub-pixel alpha mattes with recurrent temporal stability.
 */
import * as ort from 'onnxruntime-web';
import modelUrl from './models/rvm_mobilenetv3.onnx?url';
import { lazyModel } from './lazy-model.js';
import {
  configureOrtWasm,
  createRvmSession,
  computeMatteDims,
  packRgbPlanes,
  quantizeRvmOutputs,
} from './segmenter-core.js';

/** Base side dimension for backwards compatibility with tests and callers. */
export const SEG_SIZE = 256;

// Configure ONNX Runtime Web WASM paths locally using an absolute base URL so
// dynamic import() inside bundled /assets/ chunks resolves to the root public/ files.
let resolvedWasmPaths = './';
if (typeof location !== 'undefined' && location.href) {
  try {
    resolvedWasmPaths = new URL('./', location.href).href;
  } catch {
    resolvedWasmPaths = './';
  }
}
configureOrtWasm(ort, resolvedWasmPaths);

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
let cachedFloatData = null;
const ZERO_STATE_TENSOR = new ort.Tensor('float32', new Float32Array([0]), [1, 1, 1, 1]);

let workerInstance = null;
let workerMsgId = 1;
const workerPending = new Map();

function callWorker(payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = workerMsgId++;
    workerPending.set(id, { resolve, reject });
    workerInstance.postMessage({ ...payload, id }, transfer);
  });
}

export function resetRecurrentState(stateKey = null) {
  recurrentState = null;
  if (workerInstance) {
    workerInstance.postMessage({ type: 'reset', stateKey });
  }
}

const model = lazyModel(async () => {
  const absModelUrl =
    typeof location !== 'undefined' && location.href
      ? new URL(modelUrl, location.href).href
      : modelUrl;

  if (typeof Worker === 'function') {
    try {
      const w = new Worker(new URL('./segmenter-worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => {
        const msg = e.data;
        const p = workerPending.get(msg.id);
        if (!p) return;
        workerPending.delete(msg.id);
        if (msg.ok) p.resolve(msg);
        else p.reject(new Error(msg.error || 'Worker error'));
      };
      w.onerror = (err) => {
        for (const [, p] of workerPending) p.reject(err);
        workerPending.clear();
      };
      workerInstance = w;
      await callWorker({ type: 'init', modelUrl: absModelUrl, wasmPaths: resolvedWasmPaths });
      return { mode: 'worker' };
    } catch {
      workerInstance = null;
    }
  }

  const res = await fetch(absModelUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const session = await createRvmSession(ort, buffer);
  return { mode: 'direct', session };
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
  const inst = model.instance;
  if (!inst) return null;

  try {
    const srcW = image.videoWidth || image.naturalWidth || image.width || 640;
    const srcH = image.videoHeight || image.naturalHeight || image.height || 360;

    let w = opts.width;
    let h = opts.height;
    if (!w || !h) {
      ({ w, h } = computeMatteDims(srcW, srcH));
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

    const downsampleRatio = opts.downsampleRatio ?? 0.5;

    if (inst.mode === 'worker' && workerInstance) {
      const copy = new Uint8ClampedArray(px);
      const resetState = opts.recurrentState === null;
      const stateKey = opts.stateKey || null;
      const res = await callWorker(
        {
          type: 'segment',
          w,
          h,
          rgbaBuffer: copy.buffer,
          stateKey,
          resetState,
          recurrent: opts.recurrent !== false,
          downsampleRatio,
        },
        [copy.buffer]
      );
      return {
        data: new Uint8ClampedArray(res.dataBuffer),
        fgr: res.fgrBuffer ? new Uint8ClampedArray(res.fgrBuffer) : null,
        width: res.width,
        height: res.height,
        sceneCut: Boolean(res.sceneCut),
        recurrentState: { workerManaged: true, w: res.width, h: res.height },
      };
    }

    const session = inst.session;
    const planeSize = w * h;
    if (!cachedFloatData || cachedFloatData.length !== 3 * planeSize) {
      cachedFloatData = new Float32Array(3 * planeSize);
    }

    let stateToUse = null;
    if (opts.recurrentState !== undefined) {
      stateToUse = opts.recurrentState;
    } else if (opts.recurrent !== false) {
      stateToUse = recurrentState;
    }
    const subsample = stateToUse?.subsample || new Float32Array(1024);
    const meanDiff = packRgbPlanes(px, planeSize, cachedFloatData, subsample);
    const sceneCut = Boolean(stateToUse && stateToUse.r1 && stateToUse.w === w && stateToUse.h === h && meanDiff > 0.13);
    const hasValidState = Boolean(stateToUse && stateToUse.r1 && stateToUse.w === w && stateToUse.h === h && !sceneCut);

    const srcTensor = new ort.Tensor('float32', cachedFloatData, [1, 3, h, w]);
    const feeds = {
      src: srcTensor,
      r1i: hasValidState ? stateToUse.r1 : ZERO_STATE_TENSOR,
      r2i: hasValidState ? stateToUse.r2 : ZERO_STATE_TENSOR,
      r3i: hasValidState ? stateToUse.r3 : ZERO_STATE_TENSOR,
      r4i: hasValidState ? stateToUse.r4 : ZERO_STATE_TENSOR,
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
      subsample,
    };
    if (opts.recurrent !== false) {
      recurrentState = nextRecurrent;
    } else {
      recurrentState = null;
    }

    const { out, fgrOut } = quantizeRvmOutputs(results.pha.data, results.fgr?.data, planeSize);
    return { data: out, fgr: fgrOut, width: w, height: h, sceneCut, recurrentState: nextRecurrent };
  } catch (err) {
    console.error('[segmenter]', err);
    return null;
  }
}
