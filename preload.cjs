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

  cancelTranscribe: () =>
    ipcRenderer.invoke('vosk:cancel-transcribe'),

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

/**
 * Expose project storage and local file management API
 */
contextBridge.exposeInMainWorld('projectStorageAPI', {
  isElectron: true,

  getProjectsDir: () => ipcRenderer.invoke('projects:get-dir'),
  setProjectsDir: () => ipcRenderer.invoke('projects:set-dir'),
  openInExplorer: (targetPath) => ipcRenderer.invoke('projects:open-in-explorer', targetPath),
  showOpenProjectDialog: () => ipcRenderer.invoke('projects:dialog-open'),
  showSaveProjectAsDialog: (defaultName) => ipcRenderer.invoke('projects:dialog-save-as', defaultName),

  readJSON: (relPath, opts) => ipcRenderer.invoke('projects:fs-read-json', { relPath, ...opts }),
  writeJSON: (relPath, data, opts) => ipcRenderer.invoke('projects:fs-write-json', { relPath, data, ...opts }),
  readBinary: (relPath, opts) => ipcRenderer.invoke('projects:fs-read-binary', { relPath, ...opts }),
  writeBinary: (relPath, buffer, opts) => ipcRenderer.invoke('projects:fs-write-binary', { relPath, buffer, ...opts }),
  remove: (relPath, opts) => ipcRenderer.invoke('projects:fs-remove', { relPath, ...opts }),
  list: (relPath, opts) => ipcRenderer.invoke('projects:fs-list', { relPath, ...opts }),
  exists: (relPath, opts) => ipcRenderer.invoke('projects:fs-exists', { relPath, ...opts }),
  rename: (oldRelPath, newRelPath, opts) => ipcRenderer.invoke('projects:fs-rename', { oldRelPath, newRelPath, ...opts }),

  onMenuAction: (callback) => {
    const handler = (event, action, data) => callback(action, data);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
});

