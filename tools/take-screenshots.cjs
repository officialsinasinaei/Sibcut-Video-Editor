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
    },
  });

  try {
    await win.loadURL(`http://127.0.0.1:${port}`);
    console.log('App loaded in BrowserWindow.');

    // Wait for the app to initialize
    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        let attempts = 0;
        const check = () => {
          attempts++;
          const newBanner = document.querySelector('button.new-banner');
          if (newBanner) {
            newBanner.click();
          }
          if (document.querySelector('.editor-body .workspace')) {
            resolve();
          } else if (attempts < 100) {
            setTimeout(check, 100);
          } else {
            resolve();
          }
        };
        check();
      })
    `);
    console.log('Editor workspace is mounted.');

    // Add a text clip to the timeline so we have a clip to select
    await win.webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        if (window.__editor?.ctx?.commands) {
          window.__editor.ctx.commands.run('addText');
        }
        await new Promise(r => setTimeout(r, 800));
        if (window.__editor?.ctx?.store) {
          window.__editor.ctx.store.clearSelection();
        }
        resolve();
      })
    `);

    // Let the DOM settle
    await new Promise(r => setTimeout(r, 600));

    // Capture measurements BEFORE selection
    const boundsBefore = await win.webContents.executeJavaScript(`
      (() => {
        const workspace = document.querySelector('.workspace');
        const upper = document.querySelector('.upper');
        const timeline = document.querySelector('.timeline-panel');
        const inspector = document.querySelector('.inspector');
        const getR = el => el ? { top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width } : null;
        return {
          workspace: getR(workspace),
          upper: getR(upper),
          timeline: getR(timeline),
          inspector: getR(inspector),
          cssUpper: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--upper'),
          cssLeftW: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--left-w'),
          cssRightW: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--right-w'),
        };
      })()
    `);
    console.log('Bounds before selection:', JSON.stringify(boundsBefore, null, 2));

    // Take screenshot 1: Before selection
    const imgBefore = await win.capturePage();
    const pathBefore = path.join(ARTIFACT_DIR, 'screenshot_before_selection.png');
    fs.writeFileSync(pathBefore, imgBefore.toPNG());
    console.log(`Saved screenshot before selection to: ${pathBefore}`);

    // Now select a clip on the timeline!
    await win.webContents.executeJavaScript(`
      new Promise(async (resolve) => {
        if (window.__editor?.ctx?.store) {
          const clips = window.__editor.ctx.store.project.tracks.flatMap(t => t.clips || []);
          if (clips.length > 0) {
            window.__editor.ctx.store.select(clips[0].id);
          }
        }
        await new Promise(r => setTimeout(r, 800));
        resolve();
      })
    `);

    // Let DOM settle after selection
    await new Promise(r => setTimeout(r, 600));

    // Capture measurements AFTER selection
    const boundsAfter = await win.webContents.executeJavaScript(`
      (() => {
        const workspace = document.querySelector('.workspace');
        const upper = document.querySelector('.upper');
        const timeline = document.querySelector('.timeline-panel');
        const inspector = document.querySelector('.inspector');
        const getR = el => el ? { top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width } : null;
        return {
          workspace: getR(workspace),
          upper: getR(upper),
          timeline: getR(timeline),
          inspector: getR(inspector),
          cssUpper: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--upper'),
          cssLeftW: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--left-w'),
          cssRightW: getComputedStyle(document.querySelector('.editor')).getPropertyValue('--right-w'),
        };
      })()
    `);
    console.log('Bounds after selection:', JSON.stringify(boundsAfter, null, 2));

    // Take screenshot 2: After selection
    const imgAfter = await win.capturePage();
    const pathAfter = path.join(ARTIFACT_DIR, 'screenshot_after_selection.png');
    fs.writeFileSync(pathAfter, imgAfter.toPNG());
    console.log(`Saved screenshot after selection to: ${pathAfter}`);

    // Verify stability
    const diffTop = Math.abs(boundsBefore.timeline.top - boundsAfter.timeline.top);
    const diffHeight = Math.abs(boundsBefore.timeline.height - boundsAfter.timeline.height);
    const diffUpperH = Math.abs(boundsBefore.upper.height - boundsAfter.upper.height);
    const diffWsH = Math.abs(boundsBefore.workspace.height - boundsAfter.workspace.height);

    console.log('\\n--- LAYOUT STABILITY VERIFICATION ---');
    console.log(`Timeline Top Diff:      ${diffTop.toFixed(2)} px (Expected: 0)`);
    console.log(`Timeline Height Diff:   ${diffHeight.toFixed(2)} px (Expected: 0)`);
    console.log(`Upper Panel Height Diff:${diffUpperH.toFixed(2)} px (Expected: 0)`);
    console.log(`Workspace Height Diff:  ${diffWsH.toFixed(2)} px (Expected: 0)`);

    if (diffTop > 1 || diffHeight > 1 || diffUpperH > 1 || diffWsH > 1) {
      console.error('FAILED: Layout shifted when selecting on timeline!');
      process.exit(1);
    } else {
      console.log('SUCCESS: ZERO LAYOUT SHIFT DETECTED! Layout is perfectly stable.');
    }
  } catch (err) {
    console.error('Error during screenshot test:', err);
    process.exit(1);
  } finally {
    win.destroy();
    server.close();
    app.quit();
  }
}

app.whenReady().then(run);
