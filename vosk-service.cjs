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

let Worker = null;
let isMainThread = true;
try {
  const wt = require('worker_threads');
  Worker = wt.Worker;
  isMainThread = wt.isMainThread;
} catch {}

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
 * Native library platform configurations
 */
const PLATFORM_CONFIGS = {
  win32: {
    platformDir: path.join('native', 'win-x86_64'),
    primaryFile: 'libvosk.dll',
    requiredFiles: ['libwinpthread-1.dll', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libvosk.dll'],
  },
  darwin: {
    platformDir: path.join('native', 'darwin'),
    primaryFile: 'libvosk.dylib',
    requiredFiles: ['libvosk.dylib'],
  },
  linux: {
    platformDir: path.join('native', 'linux-x64'),
    primaryFile: 'libvosk.so',
    requiredFiles: ['libvosk.so'],
  },
};

/**
 * Return native binary configuration per platform
 */
function getPlatformNativeConfig(platform = process.platform) {
  return PLATFORM_CONFIGS[platform] || null;
}

/**
 * Find the directory containing libvosk for the target platform.
 * Ensures binaries are mirrored to persistent userData/vosk-native for portable stability.
 */
function getNativeLibraryDir(platform = process.platform) {
  const cfg = getPlatformNativeConfig(platform);
  if (!cfg) return null;

  // 1. Check persistent userData/vosk-native directory first
  if (modelsDir) {
    const userNativeDir = path.join(path.dirname(modelsDir), 'vosk-native', platform);
    const allUserExist = cfg.requiredFiles.every((d) => fs.existsSync(path.join(userNativeDir, d)));
    if (allUserExist) {
      return userNativeDir;
    }
  }

  // 2. Search candidate package/app directories
  const execDir = process.execPath ? path.dirname(process.execPath) : '';
  const candidateDirs = [
    path.join(__dirname, cfg.platformDir),
    path.join(__dirname.replace(/app\.asar[\\/]?$/, 'app.asar.unpacked'), cfg.platformDir),
    path.join(__dirname, '..', 'app.asar.unpacked', cfg.platformDir),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', cfg.platformDir),
    path.join(process.resourcesPath || '', cfg.platformDir),
    path.join(execDir, 'resources', 'app.asar.unpacked', cfg.platformDir),
    path.join(execDir, cfg.platformDir),
  ];

  let foundDir = null;
  for (const dir of candidateDirs) {
    if (fs.existsSync(path.join(dir, cfg.primaryFile))) {
      foundDir = dir;
      break;
    }
  }

  // 3. If found in a packaged/temporary directory, mirror to persistent userData/vosk-native
  if (foundDir && modelsDir) {
    try {
      const userNativeDir = path.join(path.dirname(modelsDir), 'vosk-native', platform);
      fs.mkdirSync(userNativeDir, { recursive: true });
      for (const f of cfg.requiredFiles) {
        const src = path.join(foundDir, f);
        const dst = path.join(userNativeDir, f);
        if (fs.existsSync(src)) {
          if (!fs.existsSync(dst) || fs.statSync(src).size !== fs.statSync(dst).size) {
            fs.copyFileSync(src, dst);
          }
        }
      }
      if (cfg.requiredFiles.every((d) => fs.existsSync(path.join(userNativeDir, d)))) {
        return userNativeDir;
      }
    } catch (copyErr) {
      console.warn('[Vosk] Mirroring native binaries to userData failed:', copyErr.message);
    }
  }

  return foundDir;
}

// Backward-compatibility alias
function getNativeDllDir() {
  return getNativeLibraryDir('win32');
}

/**
 * Check if the host operating system is supported by the Vosk engine.
 */
function isPlatformSupported(platform = process.platform) {
  return ['win32', 'darwin', 'linux'].includes(platform);
}

/**
 * Check if the native library is available and hydrated on disk.
 */
function isNativeSupported(platform = process.platform) {
  if (!isPlatformSupported(platform)) return false;
  return Boolean(getNativeLibraryDir(platform));
}

/**
 * Locate and load native Vosk library with Koffi
 */
function initNativeLibrary(targetPlatform = process.platform) {
  if (!isPlatformSupported(targetPlatform)) {
    const msg = `Native speech recognition is not supported on ${targetPlatform}.`;
    console.info('[Vosk]', msg);
    lastNativeLoadError = new Error(msg);
    return false;
  }

  const libDir = getNativeLibraryDir(targetPlatform);
  if (!libDir) {
    const msg = `Vosk native binary not found for ${targetPlatform} in candidate paths.`;
    console.warn('[Vosk]', msg);
    lastNativeLoadError = new Error(msg);
    return false;
  }

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

  const cfg = getPlatformNativeConfig(targetPlatform);
  const primaryPath = path.join(libDir, cfg.primaryFile);

  // Platform-specific helper library pre-loading
  if (targetPlatform === 'win32') {
    // 1. Tell Windows OS to look in libDir for dependent DLLs
    try {
      const k32 = koffi.load('kernel32.dll');
      const SetDllDirectoryA = k32.func('int __stdcall SetDllDirectoryA(const char *lpPathName)');
      SetDllDirectoryA(libDir);
    } catch (e) {
      console.warn('[Vosk] SetDllDirectoryA call warning:', e.message);
    }

    // 2. Pre-load dependent MinGW / GCC / pthread DLLs in dependency order
    const depFiles = ['libwinpthread-1.dll', 'libgcc_s_seh-1.dll', 'libstdc++-6.dll'];
    for (const dep of depFiles) {
      const depPath = path.join(libDir, dep);
      if (fs.existsSync(depPath)) {
        try {
          koffi.load(depPath);
        } catch (depErr) {
          console.warn(`[Vosk] Warning loading ${dep}:`, depErr.message);
        }
      }
    }

    // 3. Update PATH as fallback
    process.env.PATH = libDir + ';' + process.env.PATH;
  }

  try {
    libvosk = koffi.load(primaryPath);

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
    console.log(`[Vosk] Native Vosk library initialized successfully from: ${libDir}`);
    return true;
  } catch (err) {
    console.error(`[Vosk] Failed to load ${cfg.primaryFile}:`, err);
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
 * Execute system extraction fallback (PowerShell on Windows, unzip on macOS/Linux)
 */
function runSystemFallback(zipPath, targetDir, resolve, reject) {
  const { spawn } = require('child_process');
  if (process.platform === 'win32') {
    const ps = spawn('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force`], { windowsHide: true });
    ps.on('close', (pCode) => (pCode === 0 ? resolve(true) : reject(new Error('Zip extraction failed with exit code ' + pCode))));
    ps.on('error', reject);
  } else {
    const uz = spawn('unzip', ['-o', '-q', zipPath, '-d', targetDir]);
    uz.on('close', (uCode) => (uCode === 0 ? resolve(true) : reject(new Error('Zip extraction failed with exit code ' + uCode))));
    uz.on('error', reject);
  }
}

/**
 * Safe unzipping with yauzl or native system tool (tar / powershell / unzip) to target directory
 */
function extractZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    function fallbackExtract() {
      const { spawn } = require('child_process');
      const tar = spawn('tar', ['-xf', zipPath, '-C', targetDir], { windowsHide: true });
      tar.on('close', (code) => {
        if (code === 0) return resolve(true);
        runSystemFallback(zipPath, targetDir, resolve, reject);
      });
      tar.on('error', () => {
        runSystemFallback(zipPath, targetDir, resolve, reject);
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
  if (!modelsDir) return [];
  const catalog = getCatalog();
  const catalogMap = new Map(catalog.map((m) => [m.name, m]));

  const installed = [];
  const candidateModelDirs = [modelsDir];
  const knownDirs = [
    'D:\\apps\\Sibcut Video Editor\\data\\vosk-models',
    path.join(process.env.APPDATA || '', 'video-studio', 'vosk-models'),
    path.join(process.env.APPDATA || '', 'Video Studio', 'vosk-models'),
    path.resolve('models'),
  ];
  for (const kd of knownDirs) {
    if (kd && fs.existsSync(kd) && !candidateModelDirs.includes(kd)) {
      candidateModelDirs.push(kd);
    }
  }

  for (const scanDir of candidateModelDirs) {
    if (!fs.existsSync(scanDir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(scanDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === 'temp' || entry.name.startsWith('.')) continue;
      const dir = path.join(scanDir, entry.name);
      let isDir = false;
      try {
        isDir = entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(dir).isDirectory());
      } catch {
        continue;
      }
      if (!isDir) continue;

      let modelDir = dir;
      // Check if the model files are inside a nested subfolder
      if (!isValidModelDir(dir)) {
        try {
          const subEntries = fs.readdirSync(dir, { withFileTypes: true });
          const validSub = subEntries.find((s) => {
            const subPath = path.join(dir, s.name);
            let subIsDir = false;
            try {
              subIsDir = s.isDirectory() || (s.isSymbolicLink() && fs.statSync(subPath).isDirectory());
            } catch {}
            return subIsDir && isValidModelDir(subPath);
          });
          if (validSub) modelDir = path.join(dir, validSub.name);
          else continue;
        } catch {
          continue;
        }
      }

      // Avoid duplicates
      if (installed.some((m) => m.id === entry.name || m.path === modelDir)) continue;

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
 * Get or load a VoskModel instance for the given path or model ID
 */
function getOrLoadModel(modelPathOrId) {
  if (!initNativeLibrary()) {
    throw new Error('Vosk native library could not be loaded: ' + (lastNativeLoadError?.message || 'Check native DLL dependencies.'));
  }

  let actualPath = modelPathOrId;
  // If actualPath is an object, extract modelPath or modelId
  if (typeof actualPath === 'object' && actualPath !== null) {
    actualPath = actualPath.path || actualPath.modelPath || actualPath.id || actualPath.modelId;
  }

  // If actualPath is not a valid directory or is just an ID, search installed models
  if (!actualPath || !fs.existsSync(actualPath) || !isValidModelDir(actualPath)) {
    const installed = listInstalledModels();
    const match = installed.find((m) => m.id === actualPath || m.name === actualPath);
    if (match) {
      actualPath = match.path;
    } else if (modelsDir && typeof actualPath === 'string') {
      const candidate = path.join(modelsDir, actualPath);
      if (fs.existsSync(candidate)) actualPath = candidate;
    }
  }

  if (!actualPath || typeof actualPath !== 'string' || !fs.existsSync(actualPath)) {
    throw new Error('Vosk model not found: ' + JSON.stringify(modelPathOrId));
  }

  // Verify model directory
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

// ─── Worker Thread Management ────────────────────────────────────────────────
let workerInstance = null;
let activeTaskId = 0;
const pendingWorkerTasks = new Map();

/**
 * Spawn or return a persistent background worker thread for CPU-heavy speech recognition
 */
function getOrCreateWorker() {
  if (!Worker || !isMainThread) return null;
  if (workerInstance) return workerInstance;

  const workerScript = path.join(__dirname, 'vosk-worker.cjs');
  if (!fs.existsSync(workerScript)) return null;

  const userPath = appInstance ? appInstance.getPath('userData') : (modelsDir ? path.dirname(modelsDir) : '');

  try {
    const worker = new Worker(workerScript, {
      workerData: {
        userDataPath: userPath,
        modelsDir: modelsDir,
        nativeDir: getNativeLibraryDir(process.platform),
        dllDir: getNativeLibraryDir(process.platform),
      },
    });

    worker.on('message', (msg) => {
      if (!msg || !msg.id) return;
      const task = pendingWorkerTasks.get(msg.id);
      if (!task) return;

      if (msg.type === 'progress') {
        try {
          task.onProgress?.(msg.fraction);
        } catch {}
      } else if (msg.type === 'done') {
        pendingWorkerTasks.delete(msg.id);
        task.resolve(msg.result);
      } else if (msg.type === 'cancelled') {
        pendingWorkerTasks.delete(msg.id);
        task.reject(new DOMException('Transcription cancelled', 'AbortError'));
      } else if (msg.type === 'error') {
        pendingWorkerTasks.delete(msg.id);
        task.reject(new Error(msg.error || 'Vosk worker transcription error'));
      }
    });

    worker.on('error', (err) => {
      console.error('[Vosk Service] Worker error:', err);
      for (const [id, task] of pendingWorkerTasks) {
        task.reject(err);
      }
      pendingWorkerTasks.clear();
      workerInstance = null;
    });

    worker.on('exit', (code) => {
      if (code !== 0 && pendingWorkerTasks.size > 0) {
        const err = new Error(`Vosk worker exited unexpectedly with code ${code}`);
        for (const [id, task] of pendingWorkerTasks) {
          task.reject(err);
        }
        pendingWorkerTasks.clear();
      }
      workerInstance = null;
    });

    workerInstance = worker;
    return worker;
  } catch (err) {
    console.warn('[Vosk] Failed to spawn worker thread:', err.message);
    workerInstance = null;
    return null;
  }
}

/**
 * Cancel active transcription immediately and terminate background worker
 */
function cancelTranscription() {
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {}
    workerInstance = null;
  }
  for (const [id, task] of pendingWorkerTasks) {
    task.reject(new DOMException('Transcription cancelled', 'AbortError'));
  }
  pendingWorkerTasks.clear();
  return true;
}

/**
 * Synchronous/chunked in-process transcription with cooperative event-loop yielding
 */
async function inProcessTranscribeAudio(modelPathOrOptions, audioData, sampleRate = 16000, onProgress = null, isCancelled = null) {
  let modelPath = modelPathOrOptions;
  let rawAudio = audioData;
  let sRate = sampleRate;
  let progressCb = onProgress;

  if (typeof modelPathOrOptions === 'object' && modelPathOrOptions !== null && !Array.isArray(modelPathOrOptions) && !Buffer.isBuffer(modelPathOrOptions) && !(modelPathOrOptions instanceof Uint8Array)) {
    modelPath = modelPathOrOptions.modelPath || modelPathOrOptions.modelId || modelPathOrOptions.path;
    rawAudio = modelPathOrOptions.audioData || modelPathOrOptions.audioBuffer;
    sRate = modelPathOrOptions.sampleRate || 16000;
    progressCb = modelPathOrOptions.onProgress || onProgress;
  }

  const model = getOrLoadModel(modelPath);

  // Convert input to Int16 PCM buffer
  let pcmBuffer;
  if (rawAudio instanceof Float32Array) {
    const pcm16 = new Int16Array(rawAudio.length);
    for (let i = 0; i < rawAudio.length; i++) {
      const s = Math.max(-1, Math.min(1, rawAudio[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    pcmBuffer = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  } else if (rawAudio instanceof Int16Array) {
    pcmBuffer = Buffer.from(rawAudio.buffer, rawAudio.byteOffset, rawAudio.byteLength);
  } else if (Buffer.isBuffer(rawAudio)) {
    pcmBuffer = rawAudio;
  } else if (rawAudio instanceof ArrayBuffer || rawAudio instanceof Uint8Array) {
    pcmBuffer = Buffer.from(rawAudio);
  } else {
    throw new Error('Unsupported audio data format passed to transcribeAudio');
  }

  const recognizer = vosk_recognizer_new(model, sRate);
  if (!recognizer) {
    throw new Error('Failed to create Vosk recognizer.');
  }

  vosk_recognizer_set_words(recognizer, 1);

  const words = [];
  let fullText = '';

  const CHUNK_SIZE = 16000; // 0.5 sec of 16kHz 16-bit audio (16000 bytes)
  const totalBytes = pcmBuffer.length;
  let offset = 0;
  let chunkCount = 0;

  try {
    while (offset < totalBytes) {
      if (isCancelled && isCancelled()) {
        break;
      }

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
      chunkCount++;
      if (progressCb) {
        progressCb(Math.min(1, offset / totalBytes));
      }

      // Yield event loop every 4 chunks (~2s of audio) to let OS message pump and IPC dispatch
      if (chunkCount % 4 === 0) {
        await new Promise((r) => setImmediate(r));
      }
    }

    if (!isCancelled || !isCancelled()) {
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
    }
  } finally {
    vosk_recognizer_free(recognizer);
  }

  return { words, text: fullText };
}

/**
 * Transcribe 16kHz mono audio buffer using Vosk
 * Automatically offloads to dedicated background worker thread to prevent UI freezing
 *
 * @param {string|object} modelPathOrOptions - Model path/ID or options object
 * @param {ArrayBuffer|Float32Array|Int16Array|Buffer} audioData - Audio samples
 * @param {number} sampleRate - Sample rate (defaults to 16000)
 * @param {Function} onProgress - Progress callback (fraction 0..1)
 * @returns {Promise<{ words: Array<{ word: string, start: number, end: number, conf: number }>, text: string }>}
 */
async function transcribeAudio(modelPathOrOptions, audioData, sampleRate = 16000, onProgress = null) {
  let modelPath = modelPathOrOptions;
  let rawAudio = audioData;
  let sRate = sampleRate;
  let progressCb = onProgress;

  if (typeof modelPathOrOptions === 'object' && modelPathOrOptions !== null && !Array.isArray(modelPathOrOptions) && !Buffer.isBuffer(modelPathOrOptions) && !(modelPathOrOptions instanceof Uint8Array)) {
    modelPath = modelPathOrOptions.modelPath || modelPathOrOptions.modelId || modelPathOrOptions.path;
    rawAudio = modelPathOrOptions.audioData || modelPathOrOptions.audioBuffer;
    sRate = modelPathOrOptions.sampleRate || 16000;
    progressCb = modelPathOrOptions.onProgress || onProgress;
  }

  // Convert input to Int16 PCM Buffer for transferring to worker
  let pcmBuffer;
  if (rawAudio instanceof Float32Array) {
    const pcm16 = new Int16Array(rawAudio.length);
    for (let i = 0; i < rawAudio.length; i++) {
      const s = Math.max(-1, Math.min(1, rawAudio[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    pcmBuffer = Buffer.from(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
  } else if (rawAudio instanceof Int16Array) {
    pcmBuffer = Buffer.from(rawAudio.buffer, rawAudio.byteOffset, rawAudio.byteLength);
  } else if (Buffer.isBuffer(rawAudio)) {
    pcmBuffer = rawAudio;
  } else if (rawAudio instanceof ArrayBuffer || rawAudio instanceof Uint8Array) {
    pcmBuffer = Buffer.from(rawAudio);
  } else {
    throw new Error('Unsupported audio data format passed to transcribeAudio');
  }

  // If in a worker thread itself, run in-process directly to avoid recursive workers
  if (!isMainThread) {
    return inProcessTranscribeAudio(modelPath, pcmBuffer, sRate, progressCb);
  }

  const worker = getOrCreateWorker();
  if (worker) {
    const taskId = ++activeTaskId;
    return await new Promise((resolve, reject) => {
      pendingWorkerTasks.set(taskId, { resolve, reject, onProgress: progressCb });
      worker.postMessage({
        type: 'transcribe',
        id: taskId,
        modelPath,
        audioBuffer: pcmBuffer,
        sampleRate: sRate,
      });
    });
  }

  // Fallback to in-process transcription with event-loop yielding
  return inProcessTranscribeAudio(modelPath, pcmBuffer, sRate, progressCb);
}

module.exports = {
  init,
  initNativeLibrary,
  getNativeLibraryDir,
  getNativeDllDir,
  getPlatformNativeConfig,
  isPlatformSupported,
  isNativeSupported,
  listInstalledModels,
  listAllModels,
  getCatalog,
  downloadModel,
  cancelDownload,
  importModelZip,
  deleteModel,
  transcribeAudio,
  inProcessTranscribeAudio,
  cancelTranscription,
  freeCachedModel,
};
