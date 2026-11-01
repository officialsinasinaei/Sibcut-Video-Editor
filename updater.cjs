'use strict';

/**
 * In-App Update Checker for Video Studio (Option A)
 * 
 * Features:
 * - Checks GitHub Releases API (officialsinasinaei/Cupcut-Video-Editor)
 * - Compares semantic versioning cleanly (e.g. v1.0.1 > v1.0.0)
 * - Beautiful custom updater window with release notes and live progress bar
 * - 1-Click download directly into user's Downloads folder
 * - 1-Click launch of the new portable version + auto-exit current app
 * - "Help -> Check for Updates..." manual trigger with feedback
 * - Silent background check on startup (non-intrusive)
 */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO_OWNER = 'officialsinasinaei';
const REPO_NAME = 'Cupcut-Video-Editor';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const GITHUB_RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`;

let updaterWin = null;
let currentReleaseInfo = null;

/**
 * Compare two semver strings: e.g. "v1.0.1" and "1.0.0"
 * Returns true if remote is strictly greater than local.
 */
function isNewerVersion(remoteTag, localVersion) {
  if (!remoteTag || !localVersion) return false;
  const parse = (v) => v.toString().replace(/^v/i, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const r = parse(remoteTag);
  const l = parse(localVersion);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv > lv) return true;
    if (rv < lv) return false;
  }
  return false;
}

/**
 * Format bytes to readable string (MB)
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Fetch JSON from HTTPS with redirects and User-Agent
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': `VideoStudio-App/${app.getVersion()}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    https.get(url, options, (res) => {
      // Handle redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode === 404) {
        return reject(new Error('No releases found yet on GitHub.'));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GitHub API returned status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Download a file with redirect support and progress callback
 */
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'VideoStudio-App' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status: ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let transferredBytes = 0;
      const file = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        transferredBytes += chunk.length;
        file.write(chunk);
        if (onProgress) {
          const percent = totalBytes > 0 ? (transferredBytes / totalBytes) * 100 : 0;
          onProgress({
            percent,
            transferred: formatBytes(transferredBytes),
            total: formatBytes(totalBytes),
          });
        }
      });

      res.on('end', () => {
        file.end(() => resolve(destPath));
      });

      res.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    });

    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function getUpdaterIconPath() {
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
  return undefined;
}

/**
 * Open the custom Updater Window
 */
function showUpdateWindow(parentWindow, releaseData) {
  if (updaterWin) {
    updaterWin.focus();
    return;
  }

  currentReleaseInfo = releaseData;

  updaterWin = new BrowserWindow({
    width: 540,
    height: 480,
    parent: parentWindow || undefined,
    modal: Boolean(parentWindow),
    resizable: false,
    frame: false,
    transparent: true,
    show: false,
    icon: process.platform !== 'darwin' ? getUpdaterIconPath() : undefined,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  updaterWin.loadFile(path.join(__dirname, 'updater-ui.html'));

  updaterWin.once('ready-to-show', () => {
    updaterWin.show();
    updaterWin.webContents.send('update-info', releaseData);
  });

  updaterWin.on('closed', () => {
    updaterWin = null;
  });
}

/**
 * Main Check Function
 */
async function checkForUpdates(parentWindow, isManual = false) {
  const currentVersion = app.getVersion();

  try {
    const release = await fetchJSON(GITHUB_API_URL);
    const latestVersion = release.tag_name || release.name;

    if (isNewerVersion(latestVersion, currentVersion)) {
      // Find .exe asset or portable bundle
      const assets = release.assets || [];
      const exeAsset = assets.find((a) => a.name.toLowerCase().endsWith('.exe')) || assets[0];

      const releaseData = {
        currentVersion,
        latestVersion,
        releaseNotes: release.body || '',
        releaseUrl: release.html_url || GITHUB_RELEASES_URL,
        assetUrl: exeAsset?.browser_download_url || release.html_url,
        assetName: exeAsset?.name || `VideoStudio-Portable-${latestVersion}.exe`,
        assetSize: exeAsset ? formatBytes(exeAsset.size) : '',
      };

      showUpdateWindow(parentWindow, releaseData);
    } else {
      if (isManual) {
        dialog.showMessageBox(parentWindow, {
          type: 'info',
          title: 'Up to Date',
          message: 'Sibcut Video Editor is up to date!',
          detail: `You are running the latest version (v${currentVersion}).`,
          buttons: ['OK'],
        });
      }
    }
  } catch (err) {
    console.warn('[Updater] Check failed:', err.message);
    if (isManual) {
      dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: 'Check for Updates',
        message: 'Could not connect to update server.',
        detail: `Error: ${err.message}\n\nYou can manually check for releases on GitHub.`,
        buttons: ['Open GitHub', 'Cancel'],
      }).then(({ response }) => {
        if (response === 0) shell.openExternal(GITHUB_RELEASES_URL);
      });
    }
  }
}

// ─── Setup IPC Handlers ───────────────────────────────────────────────────────
function setupUpdaterIPC() {
  ipcMain.on('updater-close', () => {
    if (updaterWin) updaterWin.close();
  });

  ipcMain.on('updater-open-url', (_e, url) => {
    if (url) shell.openExternal(url);
  });

  ipcMain.on('updater-show-in-folder', (_e, filePath) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    }
  });

  ipcMain.on('updater-launch-file', (_e, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return;
    try {
      // Launch the new version detached and terminate the current one
      spawn(filePath, [], { detached: true, stdio: 'ignore' }).unref();
      setTimeout(() => app.quit(), 200);
    } catch (err) {
      shell.openPath(filePath);
    }
  });

  ipcMain.on('updater-start-download', async (event) => {
    if (!currentReleaseInfo || !currentReleaseInfo.assetUrl) {
      event.sender.send('download-error', 'No download URL available.');
      return;
    }

    // Default download location: user's Downloads directory
    const downloadsFolder = app.getPath('downloads');
    const safeName = currentReleaseInfo.assetName || `VideoStudio-Portable-${currentReleaseInfo.latestVersion}.exe`;
    const targetFile = path.join(downloadsFolder, safeName);

    try {
      await downloadFile(currentReleaseInfo.assetUrl, targetFile, (progress) => {
        event.sender.send('download-progress', progress);
      });

      event.sender.send('download-complete', { filePath: targetFile });
    } catch (err) {
      event.sender.send('download-error', err.message);
    }
  });
}

module.exports = {
  checkForUpdates,
  setupUpdaterIPC,
};
