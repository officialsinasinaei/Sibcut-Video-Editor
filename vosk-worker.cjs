'use strict';

/**
 * Video Studio – Vosk Offline Speech Recognition Worker Thread
 *
 * Runs in a dedicated worker_threads Worker to isolate CPU-intensive
 * Vosk C library FFI operations from the Electron main process event loop.
 * Prevents OS window freezing ("Not Responding") and allows smooth 60fps UI
 * and real-time progress reporting.
 */

const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const vs = require(path.join(__dirname, 'vosk-service.cjs'));

if (workerData?.userDataPath) {
  vs.init({ getPath: () => workerData.userDataPath });
}

let activeCancelId = null;

parentPort.on('message', async (msg) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'cancel') {
    if (msg.id === activeCancelId || !msg.id) {
      activeCancelId = 'ABORT';
    }
    return;
  }

  if (msg.type === 'transcribe') {
    const taskId = msg.id;
    activeCancelId = taskId;

    try {
      const isCancelled = () => activeCancelId === 'ABORT' || activeCancelId !== taskId;

      const result = await vs.inProcessTranscribeAudio(
        msg.modelPath,
        msg.audioBuffer,
        msg.sampleRate || 16000,
        (fraction) => {
          if (!isCancelled()) {
            parentPort.postMessage({ type: 'progress', id: taskId, fraction });
          }
        },
        isCancelled
      );

      if (isCancelled()) {
        parentPort.postMessage({ type: 'cancelled', id: taskId });
      } else {
        parentPort.postMessage({ type: 'done', id: taskId, result });
      }
    } catch (err) {
      parentPort.postMessage({ type: 'error', id: taskId, error: err.message || String(err) });
    } finally {
      if (activeCancelId === taskId) {
        activeCancelId = null;
      }
    }
  }
});
