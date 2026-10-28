'use strict';

/**
 * Video Studio – Vosk Speech Recognition & Model Management Service
 *
 * Runs in Electron main process.
 * Provides offline speech recognition using native Vosk C library via Koffi FFI.
 * Manages model downloading from https://alphacephei.com/vosk/models,
 * unzipping, offline model importing, and audio transcription.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
let yauzl = null;
try {
  yauzl = require('yauzl');
} catch (e) {
  console.warn('[Vosk] yauzl not loaded:', e.message);
}
let koffi = null;
try {
  koffi = require('koffi');
} catch (e) {
  console.warn('[Vosk] Koffi not loaded yet:', e.message);
}

// ─── Native Library Binding ──────────────────────────────────────────────────
let libvosk = null;
let VoskModel = null;
let VoskRecognizer = null;
let vosk_set_log_level = null;
let vosk_model_new = null;
let vosk_model_free = null;
let vosk_recognizer_new = null;
let vosk_recognizer_set_words = null;
let vosk_recognizer_accept_waveform = null;
let vosk_recognizer_result = null;
let vosk_recognizer_final_result = null;
let vosk_recognizer_free = null;

let isInitialized = false;
let modelsDir = null;
let appInstance = null;
let lastNativeLoadError = null;

// Keep the current loaded model in memory to avoid reloading on successive runs
let cachedModelPath = null;
let cachedModelPtr = null;

// Track active downloads
const activeDownloads = new Map();

/**
 * Locate and load libvosk.dll with Koffi
 */
function initNativeLibrary() {
  if (libvosk) return true;
  lastNativeLoadError = null;
  if (!koffi) {
    try {
      koffi = require('koffi');
    } catch (err) {
      lastNativeLoadError = err;
      console.error('[Vosk] Failed to require koffi:', err);
      return false;
    }
  }

  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  const candidateDirs = [
    path.join(__dirname, 'native', 'win-x86_64'),
    path.join(__dirname.replace(/app\.asar$/, 'app.asar.unpacked'), 'native', 'win-x86_64'),
    path.join(__dirname, '..', 'app.asar.unpacked', 'native', 'win-x86_64'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'native', 'win-x86_64'),
    path.join(process.resourcesPath || '', 'native', 'win-x86_64'),
    path.join(execDir, 'resources', 'app.asar.unpacked', 'native', 'win-x86_64'),
    path.join(execDir, 'native', 'win-x86_64'),
  ];

  let dllDir = null;
  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, 'libvosk.dll'))) {
      dllDir = dir;
      break;
    }
  }

  if (!dllDir) {
    const msg = 'libvosk.dll not found in candidate paths: ' + candidateDirs.join('; ');
    console.error('[Vosk]', msg);
    lastNativeLoadError = new Error(msg);
    return false;
  }

  // 1. Tell Windows OS to look in dllDir for dependent DLLs
  try {
    const k32 = koffi.load('kernel32.dll');
    const SetDllDirectoryA = k32.func('int __stdcall SetDllDirectoryA(const char *lpPathName)');
    SetDllDirectoryA(dllDir);
  } catch (e) {
    console.warn('[Vosk] SetDllDirectoryA call warning:', e.message);
  }

  // 2. Pre-load dependent MinGW / GCC / pthread DLLs in dependency order
  const depFiles = ['libwinpthread-1.dll', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll'];
  for (const dep of depFiles) {
    const depPath = path.join(dllDir, dep);
    if (fs.existsSync(depPath)) {
      try {
        koffi.load(depPath);
      } catch (depErr) {
        console.warn(`[Vosk] Warning loading ${dep}:`, depErr.message);
      }
    }
  }

  // 3. Update PATH as fallback
  process.env.PATH = dllDir + ';' + process.env.PATH;

  try {
    const dllPath = path.join(dllDir, 'libvosk.dll');
    libvosk = koffi.load(dllPath);

    VoskModel = koffi.opaque('VoskModel');
    VoskRecognizer = koffi.opaque('VoskRecognizer');

    vosk_set_log_level = libvosk.func('void vosk_set_log_level(int level)');
    vosk_model_new = libvosk.func('VoskModel *vosk_model_new(const char *model_path)');
    vosk_model_free = libvosk.func('void vosk_model_free(VoskModel *model)');
    vosk_recognizer_new = libvosk.func('VoskRecognizer *vosk_recognizer_new(VoskModel *model, float sample_rate)');
    vosk_recognizer_set_words = libvosk.func('void vosk_recognizer_set_words(VoskRecognizer *recognizer, int words)');
    vosk_recognizer_accept_waveform = libvosk.func('int vosk_recognizer_accept_waveform(VoskRecognizer *recognizer, const char *data, int length)');
    vosk_recognizer_result = libvosk.func('const char *vosk_recognizer_result(VoskRecognizer *recognizer)');
    vosk_recognizer_final_result = libvosk.func('const char *vosk_recognizer_final_result(VoskRecognizer *recognizer)');
    vosk_recognizer_free = libvosk.func('void vosk_recognizer_free(VoskRecognizer *recognizer)');

    vosk_set_log_level(-1); // Warnings and errors only
    console.log('[Vosk] Native Vosk library initialized successfully from:', dllDir);
    return true;
  } catch (err) {
    console.error('[Vosk] Failed to load libvosk.dll:', err);
    lastNativeLoadError = err;
    libvosk = null;
    return false;
  }
}

/**
 * Initialize the service with the Electron app instance
 */
function init(electronApp) {
  if (isInitialized) return;
  appInstance = electronApp;

  // Store models in userData/vosk-models
  modelsDir = path.join(electronApp.getPath('userData'), 'vosk-models');
  try {
    fs.mkdirSync(modelsDir, { recursive: true });
    fs.mkdirSync(path.join(modelsDir, 'temp'), { recursive: true });
  } catch {}

  initNativeLibrary();
  isInitialized = true;
}

// ─── Zip Extraction ──────────────────────────────────────────────────────────

/**
 * Safe unzipping with yauzl or native system tool (tar / powershell) to target directory
 */
function extractZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    function fallbackExtract() {
      const { spawn } = require('child_process');
      const tar = spawn('tar', ['-xf', zipPath, '-C', targetDir], { windowsHide: true });
      tar.on('close', (code) => {
        if (code === 0) return resolve(true);
        // Fallback to PowerShell Expand-Archive
        const ps = spawn('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`], { windowsHide: true });
        ps.on('close', (pCode) => {
          if (pCode === 0) resolve(true);
          else reject(new Error('Zip extraction failed with exit code ' + pCode));
        });
        ps.on('error', reject);
      });
      tar.on('error', () => {
        const ps = spawn('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`], { windowsHide: true });
        ps.on('close', (pCode) => {
          if (pCode === 0) resolve(true);
          else reject(new Error('Zip extraction failed with exit code ' + pCode));
        });
        ps.on('error', reject);
      });
    }

    if (!yauzl) {
      return fallbackExtract();
    }

    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return fallbackExtract();
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // Prevent zip-slip path traversal
        const resolvedPath = path.resolve(targetDir, entry.fileName);
        if (!resolvedPath.startsWith(path.resolve(targetDir) + path.sep) && resolvedPath !== path.resolve(targetDir)) {
          return zipfile.readEntry();
        }

        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(resolvedPath, { recursive: true });
          zipfile.readEntry();
        } else {
          fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) return reject(err);
            const writeStream = fs.createWriteStream(resolvedPath);
            readStream.pipe(writeStream);
            writeStream.on('finish', () => zipfile.readEntry());
            writeStream.on('error', reject);
          });
        }
      });
      zipfile.on('end', () => resolve(true));
      zipfile.on('error', () => fallbackExtract());
    });
  });
}

// ─── Model Discovery & Catalog ───────────────────────────────────────────────

/**
 * Format bytes to readable string (e.g. "45.2 MB")
 */
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Calculate directory size recursively
 */
function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) size += getDirSize(full);
      else if (entry.isFile()) size += fs.statSync(full).size;
    }
  } catch {}
  return size;
}

/**
 * Check if a directory contains a valid Vosk model structure
 */
function isValidModelDir(dirPath) {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
    const items = fs.readdirSync(dirPath);
    // Typical Vosk model has am/ or model.conf or conf/
    return (
      items.includes('am') ||
      items.includes('conf') ||
      items.includes('model.conf') ||
      items.includes('final.mdl')
    );
  } catch {
    return false;
  }
}

/**
 * Load cached or bundled model catalog
 */
function getCatalog() {
  // 1. Check cached catalog in userData
  const cachePath = path.join(modelsDir, 'catalog.json');
  try {
    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}

  // 2. Bundled fallback
  const candidateCatalogPaths = [
    path.join(__dirname, 'src', 'assets', 'vosk-model-list.json'),
    path.join(__dirname, 'dist', 'assets', 'vosk-model-list.json'),
    path.join(process.resourcesPath || '', 'src', 'assets', 'vosk-model-list.json'),
  ];
  for (const bundledPath of candidateCatalogPaths) {
    try {
      if (fs.existsSync(bundledPath)) {
        return JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
      }
    } catch {}
  }

  return [];
}

/**
 * Refresh model catalog from alphacephei.com
 */
async function refreshCatalog() {
  return new Promise((resolve) => {
    https.get('https://alphacephei.com/vosk/models/model-list.json', { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(getCatalog());
      }
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const list = JSON.parse(raw);
          const cachePath = path.join(modelsDir, 'catalog.json');
          fs.writeFileSync(cachePath, JSON.stringify(list, null, 2), 'utf8');
          resolve(list);
        } catch {
          resolve(getCatalog());
        }
      });
    }).on('error', () => resolve(getCatalog()))
      .on('timeout', () => resolve(getCatalog()));
  });
}

/**
 * Scan for all installed models on disk
 */
function listInstalledModels() {
  if (!modelsDir || !fs.existsSync(modelsDir)) return [];
  const catalog = getCatalog();
  const catalogMap = new Map(catalog.map((m) => [m.name, m]));

  const installed = [];
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'temp') continue;
    const dir = path.join(modelsDir, entry.name);

    let modelDir = dir;
    // Check if the model files are inside a nested subfolder
    if (!isValidModelDir(dir)) {
      const subEntries = fs.readdirSync(dir, { withFileTypes: true });
      const validSub = subEntries.find((s) => s.isDirectory() && isValidModelDir(path.join(dir, s.name)));
      if (validSub) modelDir = path.join(dir, validSub.name);
      else continue;
    }

    const cat = catalogMap.get(entry.name);
    const sizeBytes = getDirSize(modelDir);

    // Extract language from catalog or parse from name
    let lang = cat?.lang || 'unknown';
    let langText = cat?.lang_text || '';
    if (lang === 'fa' || langText.toLowerCase() === 'farsi') {
      lang = 'fa';
      langText = 'Persian (Farsi)';
    } else if (lang === 'en-us') {
      langText = 'English (US)';
    } else if (!langText) {
      if (entry.name.includes('-fa-') || entry.name.endsWith('-fa')) { lang = 'fa'; langText = 'Persian (Farsi)'; }
      else if (entry.name.includes('-en-') || entry.name.endsWith('-en') || entry.name.includes('en-us')) { lang = 'en'; langText = 'English'; }
      else if (entry.name.includes('-ar-') || entry.name.endsWith('-ar')) { lang = 'ar'; langText = 'Arabic'; }
      else if (entry.name.includes('-es-') || entry.name.endsWith('-es')) { lang = 'es'; langText = 'Spanish'; }
      else if (entry.name.includes('-fr-') || entry.name.endsWith('-fr')) { lang = 'fr'; langText = 'French'; }
      else if (entry.name.includes('-de-') || entry.name.endsWith('-de')) { lang = 'de'; langText = 'German'; }
      else if (entry.name.includes('-ru-') || entry.name.endsWith('-ru')) { lang = 'ru'; langText = 'Russian'; }
      else { langText = lang.toUpperCase(); }
    }

    installed.push({
      id: entry.name,
      name: entry.name,
      path: modelDir,
      lang,
      langText,
      type: entry.name.includes('small') ? 'small' : 'big',
      size: sizeBytes,
      sizeText: formatBytes(sizeBytes),
      version: cat?.version || '',
    });
  }

  // Also check workspace root for pre-extracted test models or models folder
  const rootModelsDir = path.resolve('models');
  if (fs.existsSync(rootModelsDir)) {
    try {
      for (const entry of fs.readdirSync(rootModelsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const p = path.join(rootModelsDir, entry.name);
        if (isValidModelDir(p) && !installed.some((m) => m.id === entry.name)) {
          installed.push({
            id: entry.name,
            name: entry.name,
            path: p,
            lang: entry.name.includes('-fa-') ? 'fa' : 'en',
            langText: entry.name.includes('-fa-') ? 'Persian (Farsi)' : 'English',
            type: entry.name.includes('small') ? 'small' : 'big',
            size: getDirSize(p),
            sizeText: formatBytes(getDirSize(p)),
            version: '',
          });
        }
      }
    } catch {}
  }

  return installed;
}

/**
 * List both installed models and available catalog models
 */
async function listAllModels(refreshOnline = false) {
  const catalog = refreshOnline ? await refreshCatalog() : getCatalog();
  const installed = listInstalledModels();
  const installedIds = new Set(installed.map((m) => m.id));

  // Mark models in catalog as installed or not
  const available = catalog
    .filter((m) => m.obsolete !== 'true')
    .map((m) => ({
      ...m,
      installed: installedIds.has(m.name),
    }));

  return {
    installed,
    available,
  };
}

// ─── Model Download & Import ─────────────────────────────────────────────────

/**
 * Download a model from alphacephei.com with progress updates
 */
function downloadModel(modelUrl, modelName, onProgress) {
  if (activeDownloads.has(modelName)) {
    throw new Error('Download already in progress for ' + modelName);
  }

  const tempZipPath = path.join(modelsDir, 'temp', `${modelName}-${Date.now()}.zip`);
  const abortController = { aborted: false, req: null };
  activeDownloads.set(modelName, abortController);

  return new Promise((resolve, reject) => {
    function startRequest(url) {
      if (abortController.aborted) {
        return cleanupAndReject(new Error('Download cancelled'));
      }

      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'VideoStudio-VoskDownloader/1.0' } }, (res) => {
        // Follow redirect (301, 302, 307, 308)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return startRequest(res.headers.location);
        }

        if (res.statusCode !== 200) {
          res.resume();
          return cleanupAndReject(new Error(`Server returned HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let receivedBytes = 0;
        let lastReport = Date.now();
        let lastBytes = 0;
        let speed = 0;

        const fileStream = fs.createWriteStream(tempZipPath);
        res.pipe(fileStream);

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReport >= 300) {
            speed = ((receivedBytes - lastBytes) / (now - lastReport)) * 1000;
            lastBytes = receivedBytes;
            lastReport = now;
            onProgress?.({
              modelName,
              receivedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0,
              speedText: `${formatBytes(speed)}/s`,
              status: 'downloading',
            });
          }
        });

        fileStream.on('finish', async () => {
          fileStream.close();
          if (abortController.aborted) {
            return cleanupAndReject(new Error('Download cancelled'));
          }

          onProgress?.({
            modelName,
            receivedBytes,
            totalBytes,
            percent: 100,
            status: 'extracting',
          });

          try {
            const targetDir = path.join(modelsDir, modelName);
            fs.mkdirSync(targetDir, { recursive: true });
            await extractZip(tempZipPath, targetDir);

            // Clean up temp zip
            try { fs.unlinkSync(tempZipPath); } catch {}
            activeDownloads.delete(modelName);

            // Return installed model info
            const installed = listInstalledModels().find((m) => m.id === modelName);
            resolve(installed || { id: modelName, name: modelName, path: targetDir });
          } catch (extractErr) {
            cleanupAndReject(extractErr);
          }
        });

        fileStream.on('error', (err) => cleanupAndReject(err));
      });

      abortController.req = req;
      req.on('error', (err) => cleanupAndReject(err));
    }

    function cleanupAndReject(err) {
      activeDownloads.delete(modelName);
      try { if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath); } catch {}
      reject(err);
    }

    startRequest(modelUrl);
  });
}

/**
 * Cancel an ongoing model download
 */
function cancelDownload(modelName) {
  const download = activeDownloads.get(modelName);
  if (download) {
    download.aborted = true;
    try { download.req?.destroy(); } catch {}
    activeDownloads.delete(modelName);
    return true;
  }
  return false;
}

/**
 * Import a pre-downloaded model .zip file
 */
async function importModelZip(zipFilePath, onProgress) {
  if (!fs.existsSync(zipFilePath)) throw new Error('File does not exist: ' + zipFilePath);

  const baseName = path.basename(zipFilePath, path.extname(zipFilePath));
  const targetDir = path.join(modelsDir, baseName);

  onProgress?.({ status: 'extracting', percent: 50 });
  fs.mkdirSync(targetDir, { recursive: true });
  await extractZip(zipFilePath, targetDir);

  const installed = listInstalledModels().find((m) => m.id === baseName);
  return installed || { id: baseName, name: baseName, path: targetDir };
}

/**
 * Delete an installed model from disk
 */
function deleteModel(modelId) {
  if (!modelsDir) return false;
  const targetDir = path.join(modelsDir, modelId);
  if (fs.existsSync(targetDir)) {
    if (cachedModelPath && cachedModelPath.startsWith(targetDir)) {
      freeCachedModel();
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    return true;
  }
  return false;
}

// ─── Transcription Engine ───────────────────────────────────────────────────

function freeCachedModel() {
  if (cachedModelPtr && vosk_model_free) {
    try {
      vosk_model_free(cachedModelPtr);
    } catch {}
    cachedModelPtr = null;
    cachedModelPath = null;
  }
}

/**
 * Get or load a VoskModel instance for the given path
 */
function getOrLoadModel(modelPath) {
  if (!initNativeLibrary()) {
    throw new Error('Vosk native library could not be loaded: ' + (lastNativeLoadError?.message || 'Check native DLL dependencies.'));
  }

  // Verify model directory
  let actualPath = modelPath;
  if (!isValidModelDir(actualPath)) {
    const sub = fs.readdirSync(actualPath, { withFileTypes: true }).find((s) => s.isDirectory() && isValidModelDir(path.join(actualPath, s.name)));
    if (sub) actualPath = path.join(actualPath, sub.name);
    else throw new Error('Invalid Vosk model directory: missing model data files.');
  }

  if (cachedModelPath === actualPath && cachedModelPtr) {
    return cachedModelPtr;
  }

  // Free previous model to conserve RAM
  freeCachedModel();

  console.log('[Vosk] Loading model from:', actualPath);
  const modelPtr = vosk_model_new(actualPath);
  if (!modelPtr) {
    throw new Error('Failed to load Vosk model from: ' + actualPath);
  }

  cachedModelPath = actualPath;
  cachedModelPtr = modelPtr;
  return modelPtr;
}

/**
 * Transcribe 16kHz mono audio buffer using Vosk
 *
 * @param {string} modelPath - Full path to the Vosk model directory
 * @param {ArrayBuffer|Float32Array|Int16Array|Buffer} audioData - Audio samples
 * @param {number} sampleRate - Sample rate (defaults to 16000)
 * @param {Function} onProgress - Progress callback (fraction 0..1)
 * @returns {Promise<{ words: Array<{ word: string, start: number, end: number, conf: number }>, text: string }>}
 */
async function transcribeAudio(modelPath, audioData, sampleRate = 16000, onProgress = null) {
  const model = getOrLoadModel(modelPath);

  // Convert input to Int16 PCM buffer
  let pcmBuffer;
  if (audioData instanceof Float32Array) {
    const pcm16 = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    pcmBuffer = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  } else if (audioData instanceof Int16Array) {
    pcmBuffer = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
  } else if (Buffer.isBuffer(audioData)) {
    pcmBuffer = audioData;
  } else if (audioData instanceof ArrayBuffer) {
    // Treat as Float32Array if length matches typical float or check
    const floats = new Float32Array(audioData);
    const pcm16 = new Int16Array(floats.length);
    for (let i = 0; i < floats.length; i++) {
      const s = Math.max(-1, Math.min(1, floats[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    pcmBuffer = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  } else {
    throw new Error('Unsupported audio data format passed to transcribeAudio');
  }

  const recognizer = vosk_recognizer_new(model, sampleRate);
  if (!recognizer) {
    throw new Error('Failed to create Vosk recognizer.');
  }

  vosk_recognizer_set_words(recognizer, 1);

  const words = [];
  let fullText = '';

  const CHUNK_SIZE = 16000; // 0.5 sec of 16kHz 16-bit audio (16000 bytes)
  const totalBytes = pcmBuffer.length;
  let offset = 0;

  try {
    while (offset < totalBytes) {
      const end = Math.min(offset + CHUNK_SIZE, totalBytes);
      const chunk = pcmBuffer.subarray(offset, end);

      const hasResult = vosk_recognizer_accept_waveform(recognizer, chunk, chunk.length);
      if (hasResult) {
        const jsonStr = vosk_recognizer_result(recognizer);
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed.result)) {
              for (const w of parsed.result) {
                if (w.word) {
                  words.push({
                    text: w.word,
                    word: w.word,
                    start: w.start,
                    end: w.end,
                    conf: w.conf ?? 1.0,
                  });
                }
              }
            }
            if (parsed.text) fullText += (fullText ? ' ' : '') + parsed.text;
          } catch {}
        }
      }

      offset = end;
      if (onProgress) {
        onProgress(Math.min(1, offset / totalBytes));
      }
    }

    // Final result
    const finalJsonStr = vosk_recognizer_final_result(recognizer);
    if (finalJsonStr) {
      try {
        const parsed = JSON.parse(finalJsonStr);
        if (Array.isArray(parsed.result)) {
          for (const w of parsed.result) {
            if (w.word) {
              words.push({
                text: w.word,
                word: w.word,
                start: w.start,
                end: w.end,
                conf: w.conf ?? 1.0,
              });
            }
          }
        }
        if (parsed.text) fullText += (fullText ? ' ' : '') + parsed.text;
      } catch {}
    }
  } finally {
    vosk_recognizer_free(recognizer);
  }

  return { words, text: fullText };
}

module.exports = {
  init,
  initNativeLibrary,
  listInstalledModels,
  listAllModels,
  getCatalog,
  downloadModel,
  cancelDownload,
  importModelZip,
  deleteModel,
  transcribeAudio,
  freeCachedModel,
};
