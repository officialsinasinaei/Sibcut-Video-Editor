'use strict';

/**
 * IPC handlers and local HTTP endpoints for Vosk in Electron
 */
const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function setupVoskIPC(ipcMain, voskService) {
  ipcMain.handle('vosk:is-available', async () => {
    return voskService.initNativeLibrary();
  });

  ipcMain.handle('vosk:list-models', async (event, refreshOnline) => {
    try {
      return await voskService.listAllModels(Boolean(refreshOnline));
    } catch (err) {
      console.error('[Vosk IPC] listAllModels error:', err);
      return { installed: [], available: [] };
    }
  });

  ipcMain.handle('vosk:download-model', async (event, { modelUrl, modelName }) => {
    try {
      return await voskService.downloadModel(modelUrl, modelName, (progress) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('vosk:download-progress', progress);
          }
        } catch {}
      });
    } catch (err) {
      console.error('[Vosk IPC] downloadModel error:', err);
      throw err;
    }
  });

  ipcMain.handle('vosk:cancel-download', async (event, modelName) => {
    return voskService.cancelDownload(modelName);
  });

  ipcMain.handle('vosk:import-model', async (event, filePath) => {
    return await voskService.importModelZip(filePath);
  });

  ipcMain.handle('vosk:select-and-import', async (event) => {
    const res = await dialog.showOpenDialog({
      title: 'Import Vosk Model Archive',
      filters: [{ name: 'Vosk Model Archive (*.zip)', extensions: ['zip'] }],
      properties: ['openFile'],
    });

    if (res.canceled || !res.filePaths.length) return null;
    const zipPath = res.filePaths[0];
    return await voskService.importModelZip(zipPath);
  });

  ipcMain.handle('vosk:delete-model', async (event, modelId) => {
    return voskService.deleteModel(modelId);
  });

  ipcMain.handle('vosk:transcribe', async (event, { modelPath, audioData, sampleRate }) => {
    try {
      let data = audioData;
      if (audioData instanceof Uint8Array || audioData instanceof ArrayBuffer) {
        data = Buffer.from(audioData);
      }
      return await voskService.transcribeAudio(
        modelPath,
        data,
        sampleRate || 16000,
        (fraction) => {
          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send('vosk:transcribe-progress', fraction);
            }
          } catch {}
        }
      );
    } catch (err) {
      console.error('[Vosk IPC] transcribe error:', err);
      throw err;
    }
  });
}

/**
 * Handle HTTP requests for /api/vosk/
 */
async function handleVoskHttp(req, res, voskService) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  const corsHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return true;
  }

  if (pathname === '/api/vosk/models' && req.method === 'GET') {
    const refresh = url.searchParams.get('refresh') === 'true';
    try {
      const data = await voskService.listAllModels(refresh);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, corsHeaders);
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  if (pathname === '/api/vosk/download' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { modelUrl, modelName } = JSON.parse(body);
        const result = await voskService.downloadModel(modelUrl, modelName);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/vosk/cancel' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { modelName } = JSON.parse(body);
        const ok = voskService.cancelDownload(modelName);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok }));
      } catch (err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/vosk/import' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { filePath } = JSON.parse(body);
        const result = await voskService.importModelZip(filePath);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/vosk/delete' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try {
        const { modelId } = JSON.parse(body);
        const ok = voskService.deleteModel(modelId);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify({ ok }));
      } catch (err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/vosk/transcribe' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const buf = Buffer.concat(chunks);
        const modelPath = decodeURIComponent(req.headers['x-model-path'] || '');
        const sampleRate = parseInt(req.headers['x-sample-rate'] || '16000', 10);
        const result = await voskService.transcribeAudio(modelPath, buf, sampleRate);
        res.writeHead(200, corsHeaders);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  return false;
}

module.exports = {
  setupVoskIPC,
  handleVoskHttp,
};
