/**
 * Shared RVM tensor packing, quantization, and ONNX Runtime WASM configuration
 * used by both main-thread fallback (segmenter.js) and worker (segmenter-worker.js).
 */
// 512x288 is an exact 16:9 multiple of 32 (512 = 16*32, 288 = 9*32), avoiding
// the ceil_mode feature-map misalignment that occurs at 640x360 (360/2 = 180 -> 45 -> 23 -> 12).
export const RVM_MAX_DIM = 512;

export function configureOrtWasm(ort, wasmPaths) {
  ort.env.wasm.wasmPaths = wasmPaths || './';
  if (typeof navigator !== 'undefined' && typeof self !== 'undefined') {
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.min(4, Math.max(1, navigator.hardwareConcurrency || 4))
      : 1;
  }
}

export function createRvmSession(ort, buffer) {
  return ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
    executionMode: 'sequential',
  });
}

export function computeMatteDims(srcW, srcH, maxDim = RVM_MAX_DIM) {
  const aspect = (srcW || 1280) / (srcH || 720);
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

export function packRgbPlanes(px, planeSize, floatData, prevSubsample = null) {
  const plane2 = 2 * planeSize;
  const inv255 = 1 / 255;
  for (let i = 0; i < planeSize; i++) {
    const p4 = i << 2;
    floatData[i] = px[p4] * inv255;
    floatData[planeSize + i] = px[p4 + 1] * inv255;
    floatData[plane2 + i] = px[p4 + 2] * inv255;
  }
  if (!prevSubsample) return 0;
  const step = Math.max(1, Math.floor(planeSize / prevSubsample.length));
  let diffSum = 0;
  let count = 0;
  for (let k = 0, idx = 0; idx < planeSize && k < prevSubsample.length; idx += step, k++) {
    const luma = 0.299 * floatData[idx] + 0.587 * floatData[planeSize + idx] + 0.114 * floatData[plane2 + idx];
    diffSum += Math.abs(luma - prevSubsample[k]);
    prevSubsample[k] = luma;
    count++;
  }
  return count > 0 ? diffSum / count : 0;
}

export function quantizeRvmOutputs(pha, fgr, planeSize) {
  const out = new Uint8ClampedArray(planeSize);
  const fgrOut = fgr ? new Uint8ClampedArray(3 * planeSize) : null;
  const plane2 = 2 * planeSize;
  for (let i = 0; i < planeSize; i++) {
    out[i] = Math.round(Math.max(0, Math.min(1, pha[i])) * 255);
    if (fgrOut) {
      const i3 = i * 3;
      fgrOut[i3] = Math.round(Math.max(0, Math.min(1, fgr[i])) * 255);
      fgrOut[i3 + 1] = Math.round(Math.max(0, Math.min(1, fgr[planeSize + i])) * 255);
      fgrOut[i3 + 2] = Math.round(Math.max(0, Math.min(1, fgr[plane2 + i])) * 255);
    }
  }
  return { out, fgrOut };
}
