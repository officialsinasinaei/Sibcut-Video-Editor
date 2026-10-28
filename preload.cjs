'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose safe, structured Vosk speech recognition and model management API
 * to the renderer process.
 */
contextBridge.exposeInMainWorld('voskAPI', {
  isAvailable: () => ipcRenderer.invoke('vosk:is-available'),

  listModels: (refreshOnline = false) =>
    ipcRenderer.invoke('vosk:list-models', refreshOnline),

  downloadModel: (modelUrl, modelName) =>
    ipcRenderer.invoke('vosk:download-model', { modelUrl, modelName }),

  cancelDownload: (modelName) =>
    ipcRenderer.invoke('vosk:cancel-download', modelName),

  importModelZip: (filePath) =>
    ipcRenderer.invoke('vosk:import-model', filePath),

  selectAndImportModel: () =>
    ipcRenderer.invoke('vosk:select-and-import'),

  deleteModel: (modelId) =>
    ipcRenderer.invoke('vosk:delete-model', modelId),

  transcribe: (modelPath, audioData, sampleRate = 16000) =>
    ipcRenderer.invoke('vosk:transcribe', { modelPath, audioData, sampleRate }),

  onDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('vosk:download-progress', handler);
    return () => ipcRenderer.removeListener('vosk:download-progress', handler);
  },

  onTranscribeProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('vosk:transcribe-progress', handler);
    return () => ipcRenderer.removeListener('vosk:transcribe-progress', handler);
  },
});
