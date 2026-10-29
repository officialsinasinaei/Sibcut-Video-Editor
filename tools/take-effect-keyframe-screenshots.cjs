'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { setupProjectsIPC } = require('../electron-projects-ipc.cjs');

setupProjectsIPC(ipcMain, app);

const DIST = path.join(__dirname, '..', 'dist');
const ARTIFACT_DIRS = [
  path.join('C:', 'Users', 'AMAJ PC', '.gemini', 'antigravity', 'brain', '5ae8fed8-dccf-4b4f-922b-7a3b44595d56', 'screenshots'),
  path.join('C:', 'Users', 'AMAJ PC', '.gemini', 'antigravity', 'brain', '4131ccfe-1c6c-405c-92b9-f7de5ffa7473'),
];
for (const dir of ARTIFACT_DIRS) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function saveArtifact(filename, buffer) {
  for (const dir of ARTIFACT_DIRS) {
    fs.writeFileSync(path.join(dir, filename), buffer);
  }
}

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
  '.woff2': 'font/woff2',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

      let reqPath = decodeURIComponent(req.url.split('?')[0]);
      if (reqPath === '/' || !reqPath) reqPath = '/index.html';
      const file = path.normalize(path.join(DIST, reqPath));
      if (!file.startsWith(DIST)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      fs.stat(file, (err, stats) => {
        if (err || !stats.isFile()) {
          const fallback = path.join(DIST, 'index.html');
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          fs.createReadStream(fallback).pipe(res);
          return;
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

async function run() {
  const { server, port } = await startServer();
  console.log(`Test server running on http://127.0.0.1:${port}`);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      preload: path.join(__dirname, '..', 'preload.cjs'),
    },
  });

  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  try {
    await win.loadURL(`http://127.0.0.1:${port}`);
    console.log('App loaded in BrowserWindow.');

    // Wait for the app to initialize workspace
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        let clicked = false;
        const interval = setInterval(() => {
          const newBanner = document.querySelector('button.new-banner');
          if (newBanner && !clicked) {
            clicked = true;
            console.log('Found new-banner, clicking once...');
            newBanner.click();
          }
          if (document.querySelector('.editor-body .workspace') && window.__editor?.ctx?.store) {
            clearInterval(interval);
            console.log('Workspace mounted!');
            resolve();
          }
        }, 100);
      })
    `);
    console.log('Editor workspace is mounted.');

    // Wait for editor to settle
    await new Promise(r => setTimeout(r, 1000));

    // 1. Setup project with an Effect clip and a Media clip with attached effects, then select effect clip
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const { store, timeline, inspector } = window.__editor.ctx;
        store.update('Setup effect keyframing test project', (p) => {
          let effTrack = p.tracks.find(t => t.kind === 'effect');
          if (!effTrack) {
            effTrack = { id: 'track-eff-1', kind: 'effect', name: 'Effects', clips: [] };
            p.tracks.unshift(effTrack);
          }
          const effClip = {
            id: 'clip-eff-1',
            type: 'effect',
            effect: 'zoom-pulse',
            name: 'Zoom pulse',
            start: 0,
            duration: 4000000,
            params: { speed: 50, strength: 60 },
            keyframes: {
              'params.speed': [
                { t: 1000000, v: 30, ease: 'easeInOut' },
                { t: 3000000, v: 85, ease: 'linear' }
              ],
              'params.strength': [
                { t: 1000000, v: 40, ease: 'linear' },
                { t: 2500000, v: 90, ease: 'linear' }
              ]
            }
          };
          effTrack.clips = [effClip];

          let videoTrack = p.tracks.find(t => t.kind === 'video');
          if (!videoTrack) {
            videoTrack = { id: 'track-vid-1', kind: 'video', name: 'Video', clips: [] };
            p.tracks.push(videoTrack);
          }
          const vClip = {
            id: 'clip-video-1',
            type: 'video',
            name: 'Media with FX',
            start: 0,
            duration: 4000000,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            opacity: 1,
            effects: [
              { id: 'blur', params: { strength: 50 } },
              { id: 'shake', params: { speed: 45, strength: 70 } }
            ],
            keyframes: {
              'fx0.strength': [
                { t: 1000000, v: 20, ease: 'linear' },
                { t: 3000000, v: 80, ease: 'easeInOut' }
              ],
              'fx1.speed': [
                { t: 1500000, v: 30, ease: 'linear' },
                { t: 2500000, v: 75, ease: 'linear' }
              ]
            }
          };
          videoTrack.clips = [vClip];
        });

        // Now select effect clip and seek to 1s
        store.select('clip-eff-1');
        store.seek(1000000);
        inspector?.showTab?.('effect');
        timeline.render(true);
        setTimeout(resolve, 800);
      })
    `);

    // Allow compositor to present the new selection
    await new Promise(r => setTimeout(r, 1200));

    // Take Screenshot 1: Effect Clip Keyframe Slider & Timeline Dots
    const img1 = await win.capturePage();
    saveArtifact('effect_clip_keyframe_slider.png', img1.toPNG());
    console.log('Saved screenshot 1');

    // 2. Open Keyframe Panel (timeline.toggleKeyframePanel)
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const { timeline } = window.__editor.ctx;
        timeline.toggleKeyframePanel();
        setTimeout(resolve, 1000);
      })
    `);

    // Take Screenshot 2: Keyframe Curve / Lane Panel with Effect Parameters
    const img2 = await win.capturePage();
    saveArtifact('effect_keyframe_curve_panel.png', img2.toPNG());
    console.log('Saved screenshot 2');

    // 3. Close keyframe panel, select Media clip with attached effects and open Clip Effects inspector
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const { store, inspector, timeline } = window.__editor.ctx;
        timeline.toggleKeyframePanel();
        store.select('clip-video-1');
        store.seek(1000000);
        inspector?.showTab?.('clipfx');
        timeline.render(true);
        setTimeout(resolve, 600);
      })
    `);

    // Take Screenshot 3: Clip Effects Stack with Keyframe Sliders
    const img3 = await win.capturePage();
    saveArtifact('clip_effects_keyframe_sliders.png', img3.toPNG());
    console.log('Saved screenshot 3');

    console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
    process.exit(1);
  } finally {
    win.destroy();
    server.close();
    app.quit();
  }
}

app.whenReady().then(run);
