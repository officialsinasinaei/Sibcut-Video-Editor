/**
 * Web Worker for off-main-thread RobustVideoMatting (RVM) inference.
 * Keeps recurrent tensors (r1..r4) and the ONNX Runtime session inside the
 * worker thread so main-thread UI and WebGL2 compositing never stall.
 */
import * as ort from 'onnxruntime-web';
import { configureOrtWasm, createRvmSession, packRgbPlanes, quantizeRvmOutputs } from './segmenter-core.js';

const ZERO_STATE_TENSOR = new ort.Tensor('float32', new Float32Array([0]), [1, 1, 1, 1]);
const downsampleTensors = new Map();

function getDownsampleTensor(ratio) {
  let t = downsampleTensors.get(ratio);
  if (!t) {
    t = new ort.Tensor('float32', new Float32Array([ratio]), [1]);
    downsampleTensors.set(ratio, t);
  }
  return t;
}

let session = null;
let cachedFloatData = null;
let defaultState = null;
const clipStates = new Map(); // stateKey -> { r1, r2, r3, r4, w, h }

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      configureOrtWasm(ort, msg.wasmPaths);
      const res = await fetch(msg.modelUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      session = await createRvmSession(ort, buffer);
      self.postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'reset') {
      if (msg.stateKey) clipStates.delete(msg.stateKey);
      else {
        defaultState = null;
        clipStates.clear();
      }
      if (msg.id) self.postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'segment') {
      if (!session) throw new Error('Session not initialized');
      const { w, h, rgbaBuffer, stateKey, resetState, recurrent, downsampleRatio = 0.5 } = msg;
      const px = new Uint8ClampedArray(rgbaBuffer);
      const planeSize = w * h;
      if (!cachedFloatData || cachedFloatData.length !== 3 * planeSize) {
        cachedFloatData = new Float32Array(3 * planeSize);
      }

      let prevState = null;
      if (recurrent !== false && !resetState) {
        prevState = stateKey ? clipStates.get(stateKey) : defaultState;
      }
      const subsample = prevState?.subsample || new Float32Array(1024);
      const meanDiff = packRgbPlanes(px, planeSize, cachedFloatData, subsample);
      const sceneCut = Boolean(prevState && prevState.w === w && prevState.h === h && meanDiff > 0.13);
      const hasValidState = Boolean(prevState && prevState.w === w && prevState.h === h && !sceneCut);

      const srcTensor = new ort.Tensor('float32', cachedFloatData, [1, 3, h, w]);
      const feeds = {
        src: srcTensor,
        r1i: hasValidState ? prevState.r1 : ZERO_STATE_TENSOR,
        r2i: hasValidState ? prevState.r2 : ZERO_STATE_TENSOR,
        r3i: hasValidState ? prevState.r3 : ZERO_STATE_TENSOR,
        r4i: hasValidState ? prevState.r4 : ZERO_STATE_TENSOR,
        downsample_ratio: getDownsampleTensor(downsampleRatio),
      };

      const results = await session.run(feeds);
      const nextState = {
        r1: results.r1o,
        r2: results.r2o,
        r3: results.r3o,
        r4: results.r4o,
        w,
        h,
        subsample,
      };
      if (recurrent !== false) {
        if (stateKey) clipStates.set(stateKey, nextState);
        else defaultState = nextState;
      }

      const { out, fgrOut } = quantizeRvmOutputs(results.pha.data, results.fgr?.data, planeSize);
      const transfer = [out.buffer];
      if (fgrOut) transfer.push(fgrOut.buffer);
      self.postMessage(
        {
          id: msg.id,
          ok: true,
          dataBuffer: out.buffer,
          fgrBuffer: fgrOut ? fgrOut.buffer : null,
          width: w,
          height: h,
          sceneCut,
        },
        transfer
      );
    }
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: err?.message || String(err) });
  }
};
