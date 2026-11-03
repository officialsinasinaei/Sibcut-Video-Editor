/**
 * Frontend client module for Vosk Speech Recognition & Model Management
 *
 * Bridges the UI to Electron's native Vosk service via window.voskAPI
 * (or fallback HTTP endpoints).
 */

const hasVoskIPC = typeof window !== 'undefined' && Boolean(window.voskAPI);

/**
 * Check if Vosk offline engine is available in this environment
 */
export async function isVoskAvailable() {
  if (hasVoskIPC) {
    try {
      return await window.voskAPI.isAvailable();
    } catch {
      return false;
    }
  }

  // Fallback to checking HTTP endpoint
  try {
    const res = await fetch('/api/vosk/models', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List installed and available models
 */
export async function listVoskModels(refreshOnline = false) {
  if (hasVoskIPC) {
    return await window.voskAPI.listModels(refreshOnline);
  }

  try {
    const res = await fetch(`/api/vosk/models${refreshOnline ? '?refresh=true' : ''}`);
    if (!res.ok) return { installed: [], available: [] };
    return await res.json();
  } catch {
    return { installed: [], available: [] };
  }
}

/**
 * Download a model from Alphacephei
 */
export async function downloadVoskModel(model, onProgress) {
  const modelUrl = model.url;
  const modelName = model.name;

  if (hasVoskIPC) {
    const unsub = onProgress
      ? window.voskAPI.onDownloadProgress((prog) => {
          if (prog.modelName === modelName) onProgress(prog);
        })
      : null;

    try {
      return await window.voskAPI.downloadModel(modelUrl, modelName);
    } finally {
      unsub?.();
    }
  }

  // Fallback via fetch
  const res = await fetch('/api/vosk/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelUrl, modelName }),
  });
  if (!res.ok) throw new Error('Download failed: ' + (await res.text()));
  return await res.json();
}

/**
 * Cancel an active model download
 */
export async function cancelVoskDownload(modelName) {
  if (hasVoskIPC) {
    return await window.voskAPI.cancelDownload(modelName);
  }

  const res = await fetch('/api/vosk/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName }),
  });
  return res.ok;
}

/**
 * Select a model zip from disk and import it
 */
export async function selectAndImportModel() {
  if (hasVoskIPC && window.voskAPI.selectAndImportModel) {
    return await window.voskAPI.selectAndImportModel();
  }

  // Web file input fallback
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        if (file.path && hasVoskIPC) {
          const res = await window.voskAPI.importModelZip(file.path);
          resolve(res);
        } else {
          // If in browser without native path
          resolve(null);
        }
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}

/**
 * Import a model zip from a known file path
 */
export async function importModelZip(filePath) {
  if (hasVoskIPC) {
    return await window.voskAPI.importModelZip(filePath);
  }

  const res = await fetch('/api/vosk/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  if (!res.ok) throw new Error('Import failed: ' + (await res.text()));
  return await res.json();
}

/**
 * Delete an installed model
 */
export async function deleteVoskModel(modelId) {
  if (hasVoskIPC) {
    return await window.voskAPI.deleteModel(modelId);
  }

  const res = await fetch('/api/vosk/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId }),
  });
  return res.ok;
}

/**
 * Convert Float32Array to 16-bit PCM ArrayBuffer
 */
export function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

/**
 * Cancel active Vosk transcription
 */
export async function cancelVoskTranscription() {
  if (hasVoskIPC && window.voskAPI?.cancelTranscribe) {
    try {
      return await window.voskAPI.cancelTranscribe();
    } catch {}
    return;
  }
  try {
    await fetch('/api/vosk/cancel-transcribe', { method: 'POST' });
  } catch {}
}

/**
 * Transcribe float samples using a Vosk model
 */
export async function transcribeWithVosk(modelPath, floatSamples, sampleRate = 16000, { onProgress, signal } = {}) {
  const pcmBuffer = floatTo16BitPCM(floatSamples);

  if (hasVoskIPC) {
    let unsub = null;
    if (onProgress) {
      unsub = window.voskAPI.onTranscribeProgress((fraction) => {
        if (!signal?.aborted) onProgress(fraction);
      });
    }

    const abortHandler = () => {
      cancelVoskTranscription().catch(() => {});
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    try {
      const res = await window.voskAPI.transcribe(modelPath, pcmBuffer, sampleRate);
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      return res;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
      unsub?.();
    }
  }

  // Fallback via HTTP POST
  const abortHandler = () => {
    cancelVoskTranscription().catch(() => {});
  };
  signal?.addEventListener('abort', abortHandler, { once: true });

  try {
    const res = await fetch('/api/vosk/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Model-Path': encodeURIComponent(modelPath),
        'X-Sample-Rate': String(sampleRate),
      },
      body: pcmBuffer,
      signal,
    });

    if (!res.ok) {
      throw new Error('Transcription failed: ' + (await res.text()));
    }

    return await res.json();
  } finally {
    signal?.removeEventListener('abort', abortHandler);
  }
}
