/**
 * Video Studio Extension SDK (v1.0.0)
 * 
 * Shared bridge library for extensions running inside Video Studio.
 * Provides a controlled, type-safe messaging interface for:
 *  - Project context (dimensions, FPS, theme)
 *  - High-quality canvas video recording
 *  - Adding exported videos directly to the main timeline
 *  - Progress reporting and user notifications
 */

(function (global) {
  'use strict';

  // Message protocol types
  const MSG = {
    READY: 'VS_EXT_READY',
    INIT: 'VS_EXT_INIT',
    PROGRESS: 'VS_EXT_PROGRESS',
    ADD_TO_TIMELINE: 'VS_EXT_ADD_TO_TIMELINE',
    EXPORT_SUCCESS: 'VS_EXT_EXPORT_SUCCESS',
    EXPORT_ERROR: 'VS_EXT_EXPORT_ERROR',
    TRIGGER_EXPORT: 'VS_EXT_TRIGGER_EXPORT',
    CANCEL_EXPORT: 'VS_EXT_CANCEL_EXPORT',
    CLOSE: 'VS_EXT_CLOSE',
    TOAST: 'VS_EXT_TOAST',
  };

  class ExtensionSDK {
    constructor() {
      this._handlers = new Map();
      this._context = null;
      this._pendingExport = null;
      this._exportTriggerHandler = null;
      this._cancelExportHandler = null;

      this._setupMessageListener();
      this._signalReady();
    }

    /** Set up window message listener for communication with host Video Studio */
    _setupMessageListener() {
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object' || !data.type) return;

        switch (data.type) {
          case MSG.INIT:
            this._context = data.payload || {};
            this._emit('init', this._context);
            break;

          case MSG.TRIGGER_EXPORT:
            if (this._exportTriggerHandler) {
              this._exportTriggerHandler();
            }
            break;

          case MSG.CANCEL_EXPORT:
            if (this._cancelExportHandler) {
              this._cancelExportHandler();
            }
            break;

          case MSG.EXPORT_SUCCESS:
            if (this._pendingExport) {
              this._pendingExport.resolve(data.payload);
              this._pendingExport = null;
            }
            break;

          case MSG.EXPORT_ERROR:
            if (this._pendingExport) {
              this._pendingExport.reject(new Error(data.error || 'Timeline import failed'));
              this._pendingExport = null;
            }
            break;

          default:
            this._emit(data.type, data.payload);
            break;
        }
      });
    }

    /** Signal to host window that extension is mounted and ready */
    _signalReady() {
      this._postToHost({ type: MSG.READY });
    }

    /** Post message to parent frame */
    _postToHost(message) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
    }

    /** Register event listener */
    _emit(event, payload) {
      const cbs = this._handlers.get(event) || [];
      for (const cb of cbs) {
        try {
          cb(payload);
        } catch (e) {
          console.error('[Extension SDK Error]', e);
        }
      }
    }

    on(event, callback) {
      if (!this._handlers.has(event)) {
        this._handlers.set(event, []);
      }
      this._handlers.get(event).push(callback);
      // If already initialized and listening for init, trigger immediately
      if (event === 'init' && this._context) {
        callback(this._context);
      }
      return () => {
        const arr = this._handlers.get(event) || [];
        this._handlers.set(event, arr.filter((x) => x !== callback));
      };
    }

    /**
     * Called when extension context is received from host.
     * @param {Function} callback receives { project: { width, height, fps, name }, theme: 'dark'|'light' }
     */
    onInit(callback) {
      return this.on('init', callback);
    }

    /**
     * Called when host triggers an export (e.g. from workspace header button).
     */
    onExportRequested(handler) {
      this._exportTriggerHandler = handler;
    }

    /**
     * Called when host cancels export.
     */
    onCancelExport(handler) {
      this._cancelExportHandler = handler;
    }

    /**
     * Get currently cached project context
     */
    getContext() {
      return this._context || {
        project: { width: 1920, height: 1080, fps: 30, name: 'Project 1' },
        theme: 'dark',
      };
    }

    /**
     * Report progress of video generation or export to host application.
     * @param {number} progress Between 0.0 and 1.0 (or 0 to 100)
     * @param {string} statusText Description e.g. "Rendering frame 45/120..."
     */
    reportProgress(progress, statusText = '') {
      const normalized = progress > 1 ? progress / 100 : Math.max(0, Math.min(1, progress));
      this._postToHost({
        type: MSG.PROGRESS,
        payload: {
          progress: normalized,
          statusText,
        },
      });
    }

    /**
     * Send an exported video directly to the Video Studio timeline.
     * @param {Blob|File} videoBlob Exported video blob (e.g. webm or mp4)
     * @param {Object} options Options such as filename, duration, width, height
     * @returns {Promise<Object>} Resolves when the clip is successfully added to the timeline
     */
    async addToTimeline(videoBlob, options = {}) {
      if (!videoBlob || !(videoBlob instanceof Blob)) {
        throw new Error('Invalid video file: expected Blob or File instance.');
      }

      if (this._pendingExport) {
        throw new Error('An export is already in progress.');
      }

      const name = options.name || `Extension Export ${new Date().toISOString().slice(11, 19)}.webm`;
      const mimeType = options.mimeType || videoBlob.type || 'video/webm';

      return new Promise((resolve, reject) => {
        this._pendingExport = { resolve, reject };

        this._postToHost({
          type: MSG.ADD_TO_TIMELINE,
          payload: {
            name,
            mimeType,
            blob: videoBlob,
            duration: options.duration || null,
            width: options.width || null,
            height: options.height || null,
          },
        });
      });
    }

    /**
     * Show a notification toast in the main application.
     */
    toast(message, kind = 'info') {
      this._postToHost({
        type: MSG.TOAST,
        payload: { message, kind },
      });
    }

    /**
     * Close the extension workspace and return to the main timeline editor.
     */
    close() {
      this._postToHost({ type: MSG.CLOSE });
    }

    /**
     * Helper utility: High-quality canvas video recorder.
     * Captures any HTML5 Canvas stream and encodes to WebM video using MediaRecorder.
     * 
     * @param {HTMLCanvasElement} canvas The canvas element to record
     * @param {Object} options
     * @param {number} options.durationSec Duration in seconds to record
     * @param {number} options.fps Target frame rate (default 30)
     * @param {number} options.bitrate Video bits per second (default 12_000_000 for pristine quality)
     * @param {Function} options.onProgress (0..1, text) Callback during recording
     * @param {Function} options.renderFrame Optional (timeSec) callback to render frames if using deterministic stepping
     * @returns {Promise<Blob>} Resolves to recorded video Blob
     */
    async recordCanvas(canvas, options = {}) {
      const durationSec = options.durationSec || 3;
      const fps = options.fps || 30;
      const bitrate = options.bitrate || 12_000_000;
      const onProgress = options.onProgress || (() => {});

      if (!canvas || typeof canvas.captureStream !== 'function') {
        throw new Error('Canvas captureStream is not supported in this environment.');
      }

      // Check supported MIME type for best quality
      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ];
      let selectedMime = 'video/webm';
      for (const m of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType: selectedMime,
        videoBitsPerSecond: bitrate,
      });

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      return new Promise((resolve, reject) => {
        let isCancelled = false;
        const totalMs = durationSec * 1000;
        const startWall = performance.now();

        const progressInterval = setInterval(() => {
          if (isCancelled) return;
          const elapsed = performance.now() - startWall;
          const ratio = Math.min(1, elapsed / totalMs);
          onProgress(ratio, `Recording video (${Math.round(ratio * 100)}%)...`);
          this.reportProgress(ratio, `Recording video (${Math.round(ratio * 100)}%)...`);
        }, 100);

        recorder.onerror = (err) => {
          clearInterval(progressInterval);
          reject(err);
        };

        recorder.onstop = () => {
          clearInterval(progressInterval);
          onProgress(1, 'Finalizing video stream...');
          this.reportProgress(1, 'Finalizing video stream...');
          const blob = new Blob(chunks, { type: selectedMime });
          resolve(blob);
        };

        // Handle cancel if registered
        this.onCancelExport(() => {
          isCancelled = true;
          clearInterval(progressInterval);
          try {
            if (recorder.state !== 'inactive') recorder.stop();
          } catch (_) {}
          reject(new Error('Export cancelled by user.'));
        });

        recorder.start(100); // chunk every 100ms

        // Stop when duration completes
        setTimeout(() => {
          if (!isCancelled && recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, totalMs);
      });
    }
  }

  // Export as singleton and global
  const sdk = new ExtensionSDK();
  global.VideoStudioExtension = sdk;
  global.VSExtension = sdk;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = sdk;
  }
})(typeof window !== 'undefined' ? window : this);
