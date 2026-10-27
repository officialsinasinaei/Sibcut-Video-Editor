'use strict';

const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ARTIFACT_DIR = path.join('C:', 'Users', 'AMAJ PC', '.gemini', 'antigravity', 'brain', '3ce5eb6e-5bdb-4fed-bde2-a4140e98ac80');

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
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
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

function timeoutPromise(ms, label) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms));
}

async function run() {
  console.log('[1/6] Starting test server...');
  const { server, port } = await startServer();
  console.log(`[1/6] Server running on http://127.0.0.1:${port}`);

  const globalTimer = setTimeout(() => {
    console.error('GLOBAL TIMEOUT REACHED! Forcing exit...');
    process.exit(1);
  }, 40000);

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
    },
  });

  try {
    console.log('[2/6] Loading app in Electron window...');
    await Promise.race([
      win.loadURL(`http://127.0.0.1:${port}`),
      timeoutPromise(10000, 'loadURL')
    ]);

    // Wait for the workspace to mount
    console.log('[3/6] Waiting for workspace mount...');
    await Promise.race([
      win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          let attempts = 0;
          const check = () => {
            attempts++;
            const newBanner = document.querySelector('button.new-banner');
            if (newBanner) newBanner.click();
            if (document.querySelector('.editor-body .workspace')) {
              resolve(true);
            } else if (attempts < 60) {
              setTimeout(check, 100);
            } else {
              resolve(false);
            }
          };
          check();
        })
      `),
      timeoutPromise(8000, 'workspace mount')
    ]);

    // Add a Farsi text clip with Vazirmatn font & select it
    console.log('[4/6] Adding Farsi text clip with Vazirmatn and updating store...');
    await Promise.race([
      win.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          try {
            if (window.__editor?.ctx?.commands) {
              window.__editor.ctx.commands.run('addText');
            }
            await new Promise(r => setTimeout(r, 600));

            const store = window.__editor?.ctx?.store;
            if (store) {
              store.update('Set Farsi text', (p) => {
                const clips = p.tracks.flatMap(t => t.clips || []);
                const textClip = clips.find(c => c.type === 'text');
                if (textClip) {
                  textClip.text = 'سلام و درود به همه کاربران گرامی';
                  textClip.style.font = 'Vazirmatn';
                  textClip.style.size = 72;
                  textClip.style.direction = 'rtl';
                  textClip.style.align = 'center';
                }
              });
              const clips = store.project.tracks.flatMap(t => t.clips || []);
              const textClip = clips.find(c => c.type === 'text');
              if (textClip) store.select([textClip.id]);
            }
            await new Promise(r => setTimeout(r, 600));
            resolve(true);
          } catch (e) {
            console.error(e);
            resolve(false);
          }
        })
      `),
      timeoutPromise(5000, 'add and update text clip')
    ]);

    // Let the DOM and canvas settle
    await new Promise(r => setTimeout(r, 1200));

    // Capture screenshot 1: Farsi text in editor with Vazirmatn font & Text Inspector
    console.log('[5/6] Capturing screenshot 1 (Editor with Farsi text & Text Inspector)...');
    const img1 = await win.capturePage();
    const path1 = path.join(ARTIFACT_DIR, 'screenshot_farsi_editor.png');
    fs.writeFileSync(path1, img1.toPNG());
    console.log(`[5/6] Screenshot 1 saved to: ${path1}`);

    // Set animation: 'letters-rise' and seek slightly to capture in-flight letters
    console.log('[5/6] Setting animation and capturing screenshot 2...');
    await Promise.race([
      win.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          try {
            const store = window.__editor?.ctx?.store;
            if (store) {
              store.update('Set animation', (p) => {
                const clips = p.tracks.flatMap(t => t.clips || []);
                const textClip = clips.find(c => c.type === 'text');
                if (textClip) {
                  textClip.anim = { in: 'letters-rise', inDuration: 2000000 };
                  textClip.style.font = 'Lalezar';
                  textClip.style.size = 64;
                  textClip.text = 'متن متحرک فارسی با انیمیشن حروف';
                }
              });
              const clips = store.project.tracks.flatMap(t => t.clips || []);
              const textClip = clips.find(c => c.type === 'text');
              if (textClip) {
                store.select([textClip.id]);
                store.seek(textClip.start + 500000);
              }
            }
            await new Promise(r => setTimeout(r, 800));
            resolve(true);
          } catch (e) {
            console.error(e);
            resolve(false);
          }
        })
      `),
      timeoutPromise(5000, 'set animation')
    ]);

    await new Promise(r => setTimeout(r, 1000));
    const img2 = await win.capturePage();
    const path2 = path.join(ARTIFACT_DIR, 'screenshot_farsi_animation_rise.png');
    fs.writeFileSync(path2, img2.toPNG());
    console.log(`[5/6] Screenshot 2 saved to: ${path2}`);

    // Render a high-resolution sample card showcasing all 10 Farsi fonts
    console.log('[6/6] Generating sample canvas for all 10 Farsi fonts...');
    const sampleResults = await Promise.race([
      win.webContents.executeJavaScript(`
        new Promise(async (resolve) => {
          try {
            const fonts = [
              'Vazirmatn',
              'Sahel',
              'Shabnam',
              'Samim',
              'Tanha',
              'Parastoo',
              'Gandom',
              'Estedad',
              'Lalezar',
              'Amiri'
            ];
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 800;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Title
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 32px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.direction = 'rtl';
            ctx.fillText('۱۰ قلم فارسی برتر در استودیو ویدیو (Video Studio Fonts)', 640, 50);

            if (document.fonts?.ready) {
              await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
            }

            fonts.forEach((fontName, idx) => {
              const y = 110 + idx * 65;
              ctx.fillStyle = '#64748b';
              ctx.font = '16px monospace';
              ctx.textAlign = 'left';
              ctx.direction = 'ltr';
              ctx.fillText((idx + 1) + '. ' + fontName, 40, y);

              ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#fef08a';
              ctx.font = '28px ' + fontName + ', Vazirmatn, sans-serif';
              ctx.textAlign = 'right';
              ctx.direction = 'rtl';
              ctx.fillText('سلام و درود! نگارش زیبای فارسی با اتصالات حروف و اعداد ۱۲۳۴۵', 1240, y);
            });

            resolve(canvas.toDataURL('image/png'));
          } catch (e) {
            console.error(e);
            resolve(null);
          }
        })
      `),
      timeoutPromise(6000, 'font sample canvas')
    ]);

    if (sampleResults) {
      const base64Data = sampleResults.replace(/^data:image\/png;base64,/, '');
      const path3 = path.join(ARTIFACT_DIR, 'screenshot_farsi_fonts_sample.png');
      fs.writeFileSync(path3, Buffer.from(base64Data, 'base64'));
      console.log(`[6/6] Screenshot 3 (10 Farsi Fonts Sample) saved to: ${path3}`);
    }

    console.log('ALL SCREENSHOTS CAPTURED AND SAVED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    clearTimeout(globalTimer);
    try { win.destroy(); } catch (_) {}
    try { server.close(); } catch (_) {}
    app.quit();
  }
}

app.whenReady().then(run);
