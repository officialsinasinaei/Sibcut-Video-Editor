'use strict';

/**
 * Video Studio – Electron main process
 *
 * Strategy
 * --------
 * 1. Serve the Vite-built `dist/` folder via a tiny local HTTP server on a
 *    random loopback port.  A real HTTP origin is required so that:
 *      • SharedArrayBuffer (WASM SIMD, audio DSP) works (COOP+COEP headers)
 *      • Web Workers with ES-module format load correctly
 *      • OPFS (Origin Private File System) is available for project storage
 *      • fetch() inside the app resolves relative URLs correctly
 *
 * 2. The server injects Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
 *    headers on every response so SharedArrayBuffer is always available.
 *
 * 3. Operates in pure offline/local mode and stores all projects in the
 *    browser's OPFS – no account required, fully portable and private.
 *
 * 4. Native menus, keyboard shortcuts, a "Save before quit" guard, and a
 *    persistent window-bounds preference make it feel like a real desktop app.
 */

const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { checkForUpdates, setupUpdaterIPC } = require('./updater.cjs');
const voskService = require('./vosk-service.cjs');
const { setupVoskIPC, handleVoskHttp } = require('./electron-vosk-ipc.cjs');
const { getPortableDir, isWritable, setupProjectsIPC } = require('./electron-projects-ipc.cjs');

// ─── Single-Instance Guard & Smoke-Test Detection ──────────────────────────────
// Detect deterministic CI smoke test runs
const isSmokeTest = process.argv.includes('--smoke-test') || process.env.ELECTRON_SMOKE_TEST === '1';

if (isSmokeTest) {
  console.log('[SMOKE-TEST] Launching in automated verification mode...');
  process.on('uncaughtException', (err) => {
    console.error('[SMOKE-TEST-FATAL] Uncaught exception:', err);
    app.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[SMOKE-TEST-FATAL] Unhandled rejection:', reason);
    app.exit(1);
  });
  // Safety watchdog: abort if ready-to-show is not reached within 20s
  const watchdog = setTimeout(() => {
    console.error('[SMOKE-TEST-FATAL] Timed out waiting for ready-to-show after 20s');
    app.exit(1);
  }, 20000);
  watchdog.unref();
}

// Prevents multiple concurrent processes from contending over the portable
// extraction directory or user data directories.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock && !isSmokeTest) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── Lazy Native Vosk Engine ─────────────────────────────────────────────────
let voskInitialized = false;
function ensureVoskInit() {
  if (voskInitialized) return;
  voskInitialized = true;
  try {
    voskService.init(app);
  } catch (err) {
    console.error('[Main] Vosk init error:', err);
  }
}

const lazyVoskService = new Proxy(voskService, {
  get(target, prop) {
    const val = target[prop];
    if (typeof val === 'function') {
      return (...args) => {
        ensureVoskInit();
        return val.apply(target, args);
      };
    }
    return val;
  },
});

// ─── Portable UserData Configuration ──────────────────────────────────────────
const PORTABLE_DIR = getPortableDir(app);
const userDataDir = path.join(PORTABLE_DIR, 'data');
if (isWritable(userDataDir)) {
  try {
    app.setPath('userData', userDataDir);
  } catch (err) {
    console.warn('[Main] Could not configure portable userData directory:', err.message);
  }
}

// ─── Paths & Icons ────────────────────────────────────────────────────────────
const DIST = path.join(__dirname, 'dist');

function getAppIconPath() {
  if (process.platform === 'win32') {
    const ico = path.join(__dirname, 'build', 'icon.ico');
    if (fs.existsSync(ico)) return ico;
    const brandingIco = path.join(__dirname, 'assets', 'branding', 'app-icons', 'windows', 'icon.ico');
    if (fs.existsSync(brandingIco)) return brandingIco;
  }
  const png = path.join(__dirname, 'build', 'icon.png');
  if (fs.existsSync(png)) return png;
  const brandingPng = path.join(__dirname, 'assets', 'branding', 'app-icons', 'linux', '512x512.png');
  if (fs.existsSync(brandingPng)) return brandingPng;
  const master = path.join(__dirname, 'assets', 'branding', 'master', 'app-icon-master.png');
  if (fs.existsSync(master)) return master;
  return undefined;
}


// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.m4a':  'audio/mp4',
  '.aac':  'audio/aac',
  '.flac': 'audio/flac',
  '.cube': 'text/plain',
  '.tflite': 'application/octet-stream',
  '.task': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.zip':  'application/zip',
  '.woff2': 'font/woff2',
  '.woff':  'font/woff',
  '.ttf':   'font/ttf',
};

// ─── Deterministic loopback port ─────────────────────────────────────────────
const PREFERRED_PORT = 52420;

function handleLocalMediaHttp(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://127.0.0.1:${serverPort || PREFERRED_PORT}`);
    const filePath = parsedUrl.searchParams.get('path');
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Media file not found');
      return;
    }
    const resolvedPath = path.resolve(filePath);
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Path is a directory');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    const total = stat.size;

    const headers = {
      'Content-Type': mime,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Accept-Ranges': 'bytes',
    };

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        ...headers,
        'Content-Length': total,
      });
      res.end();
      return;
    }

    const rangeHeader = req.headers['range'];
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }
      const [, startStr, endStr] = match;
      let start = 0;
      let end = total - 1;

      if (startStr === '' && endStr !== '') {
        const suffixLen = parseInt(endStr, 10);
        start = Math.max(0, total - suffixLen);
        end = total - 1;
      } else if (startStr !== '' && endStr === '') {
        start = parseInt(startStr, 10);
        end = total - 1;
      } else if (startStr !== '' && endStr !== '') {
        start = parseInt(startStr, 10);
        end = parseInt(endStr, 10);
      } else {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }

      if (start > end || start >= total || end >= total) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': chunkSize,
      });
      const stream = fs.createReadStream(resolvedPath, { start, end });
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    } else {
      headers['Content-Length'] = total;
      res.writeHead(200, headers);
      const stream = fs.createReadStream(resolvedPath);
      req.on('close', () => stream.destroy());
      stream.pipe(res);
    }
  } catch (err) {
    console.error('[Server] /api/local-media error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
}

// ─── Local file server ────────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      // Handle Vosk API endpoints
      if (req.url.startsWith('/api/vosk/')) {
        handleVoskHttp(req, res, lazyVoskService);
        return;
      }

      // Handle linked local media streaming with full range seeking
      if (req.url.startsWith('/api/local-media')) {
        handleLocalMediaHttp(req, res);
        return;
      }

      // Strip query string and decode URI
      let urlPath = req.url.split('?')[0];
      try { urlPath = decodeURIComponent(urlPath); } catch {}

      // Resolve to a real file, falling back to index.html for SPA routing
      let filePath = path.join(DIST, urlPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        const indexHtml = path.join(filePath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          filePath = indexHtml;
        } else {
          filePath = path.join(DIST, 'index.html');
        }
      } else if (!fs.existsSync(filePath)) {
        if (!path.extname(urlPath)) {
          filePath = path.join(DIST, 'index.html');
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('File not found');
          return;
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';

      // Mandatory headers for SharedArrayBuffer & WASM SIMD
      const headers = {
        'Content-Type': mime,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      };

      // Range support for video/audio seeking
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const rangeHeader = req.headers['range'];

      if (rangeHeader && (mime.startsWith('video/') || mime.startsWith('audio/'))) {
        const [, startStr, endStr] = /bytes=(\d*)-(\d*)/.exec(rangeHeader) || [];
        const start = startStr ? parseInt(startStr, 10) : 0;
        const end = endStr ? parseInt(endStr, 10) : total - 1;
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        headers['Content-Length'] = total;
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
      }
    });

    const tryListen = (port) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Server] Port ${port} is in use, attempting ${port + 1}...`);
          tryListen(port + 1);
        } else {
          console.warn(`[Server] Error listening on port ${port}, falling back to port 0:`, err.message);
          server.listen(0, '127.0.0.1', () => {
            resolve({ server, port: server.address().port });
          });
        }
      });
      server.listen(port, '127.0.0.1', () => {
        resolve({ server, port });
      });
    };

    tryListen(PREFERRED_PORT);
  });
}


// ─── Window state persistence ─────────────────────────────────────────────────
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { width: 1400, height: 900 };
  }
}

function saveWindowState(win) {
  try {
    const bounds = win.getBounds();
    const maximized = win.isMaximized();
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...bounds, maximized }));
  } catch {}
}

// ─── Main window ──────────────────────────────────────────────────────────────
let mainWindow = null;
let serverPort = null;

async function createWindow() {
  const state = loadWindowState();
  const iconPath = process.platform !== 'darwin' ? getAppIconPath() : undefined;

  // On macOS development mode, set dock icon if unpacked
  if (process.platform === 'darwin' && app.dock && !app.isPackaged) {
    const dockIcon = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(dockIcon)) {
      try { app.dock.setIcon(dockIcon); } catch {}
    }
  }

  mainWindow = new BrowserWindow({
    width:    state.width  || 1400,
    height:   state.height || 900,
    x:        state.x,
    y:        state.y,
    minWidth:  860,
    minHeight: 560,
    icon:      iconPath,
    title:     'Sibcut Video Editor',
    backgroundColor: '#121214',   // matches the app's dark background – no white flash
    autoHideMenuBar: false,
    show: false,                   // show only when ready to avoid a blank flicker
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // Allow the origin to use SharedArrayBuffer (already enforced by headers)
      // and the MediaPipe WASM models to fetch from the same origin.
    },
  });

  // Restore maximized state
  if (state.maximized) mainWindow.maximize();

  // Block external cloud SDK calls so everything stays strictly local
  mainWindow.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://js.puter.com/*', 'https://*.puter.com/*'] },
    (details, callback) => callback({ cancel: true })
  );

  // Open external links in the default browser, not inside Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (e, url) => {
    // Only allow navigation within our local server origin
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Show the window once the page has rendered (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isSmokeTest) {
      console.log('[SMOKE-TEST] Window rendered and displayed successfully.');
      setTimeout(() => {
        console.log('[SMOKE-TEST] App launched successfully, exiting with code 0');
        app.exit(0);
      }, 2000);
      return;
    }
    // Warm up native Vosk background service 1.5s after window presentation
    setTimeout(ensureVoskInit, 1500);
  });

  // Persist window bounds on close / resize / move
  const persistState = () => saveWindowState(mainWindow);
  mainWindow.on('resize', persistState);
  mainWindow.on('move',   persistState);
  mainWindow.on('close',  persistState);

  mainWindow.on('closed', () => { mainWindow = null; });

  await mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const sendMenu = (action, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:action', action, data);
    }
  };

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenu('new-project'),
        },
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenu('open-project'),
        },
        { type: 'separator' },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenu('save-project'),
        },
        {
          label: 'Save Project As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenu('save-project-as'),
        },
        {
          label: 'Export Video...',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendMenu('export-video'),
        },
        {
          label: 'Export Project Bundle (.zip)...',
          click: () => sendMenu('export-bundle'),
        },
        { type: 'separator' },
        {
          label: 'Open Projects Folder in Explorer',
          click: () => sendMenu('open-projects-folder'),
        },
        {
          label: 'Change Projects Folder...',
          click: () => sendMenu('change-projects-folder'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdates(mainWindow, true),
        },
        { type: 'separator' },
        {
          label: 'About Sibcut Video Editor',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:action', 'about');
            } else {
              dialog.showMessageBox({
                type: 'info',
                title: 'About Sibcut Video Editor',
                message: 'Sibcut Video Editor',
                detail: `Version: v${app.getVersion()}\nA professional video editing application.\n\nCreated by Sina Sinaei\nContact: sina9100t@gmail.com\n\nBased on the Everything project by HeyPuter.\nhttps://github.com/HeyPuter/everything\n\n© 2026 Sina Sinaei`,
                buttons: ['OK'],
              });
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Enable hardware acceleration (default) + high-quality video decoding
  app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');

  // Initialize updater IPC handlers
  setupUpdaterIPC();

  // Initialize native project storage IPC handlers
  setupProjectsIPC(ipcMain, app, () => mainWindow);

  // Initialize Vosk offline speech recognition IPC handlers with lazy backing
  setupVoskIPC(ipcMain, lazyVoskService);

  const { port } = await startServer();
  serverPort = port;

  buildMenu();
  await createWindow();

  // Quietly check for updates 4 seconds after launch (skipped in smoke tests)
  if (!isSmokeTest) {
    setTimeout(() => {
      checkForUpdates(mainWindow, false);
    }, 4000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it is conventional to keep the app running until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});
