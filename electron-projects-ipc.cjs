'use strict';

/**
 * Video Studio – Native Project Storage IPC Manager
 *
 * Manages persistent project files in <exe_dir>/Projects/ (or custom directory),
 * native dialogs, Windows Explorer integration, and direct file system operations.
 */

const fs = require('fs');
const path = require('path');
const { shell, dialog } = require('electron');

let appInstance = null;
let mainWindowGetter = null;
let activeProjectsDir = null;

/**
 * Determine the base directory of the portable application.
 */
function getPortableDir(app) {
  return process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname));
}

/**
 * Test whether a directory can be written to.
 */
function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Path to user settings JSON file inside portable userData directory.
 */
function getSettingsFilePath(app) {
  return path.join(app.getPath('userData'), 'projects-settings.json');
}

/**
 * Load settings from userData.
 */
function loadSettings(app) {
  try {
    const file = getSettingsFilePath(app);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}
  return {};
}

/**
 * Save settings to userData.
 */
function saveSettings(app, data) {
  try {
    const file = getSettingsFilePath(app);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Projects IPC] Failed to save settings:', err.message);
  }
}

/**
 * Resolve the active projects directory:
 * 1. User-customized directory from settings (if still writable)
 * 2. Primary: <exe_dir>/Projects
 * 3. Fallback: %USERPROFILE%/Documents/Video Studio/Projects
 */
function resolveProjectsDir(app) {
  const settings = loadSettings(app);
  if (settings.customProjectsDir && isWritable(settings.customProjectsDir)) {
    return path.resolve(settings.customProjectsDir);
  }

  const portableBase = getPortableDir(app);
  const primaryDir = path.join(portableBase, 'Projects');
  if (isWritable(primaryDir)) {
    return primaryDir;
  }

  const fallbackDir = path.join(app.getPath('documents'), 'Video Studio', 'Projects');
  fs.mkdirSync(fallbackDir, { recursive: true });
  return fallbackDir;
}

function getActiveProjectsDir() {
  if (!activeProjectsDir && appInstance) {
    activeProjectsDir = resolveProjectsDir(appInstance);
  }
  return activeProjectsDir;
}

function setActiveProjectsDir(dir) {
  activeProjectsDir = path.resolve(dir);
  fs.mkdirSync(activeProjectsDir, { recursive: true });
  if (appInstance) {
    const settings = loadSettings(appInstance);
    settings.customProjectsDir = activeProjectsDir;
    saveSettings(appInstance, settings);
  }
}

/**
 * Safely resolve a path relative to the active projects dir, or absolute path.
 */
function resolvePath(relPath, absPath) {
  if (absPath) {
    return path.resolve(absPath);
  }
  const root = getActiveProjectsDir();
  return path.resolve(root, relPath || '');
}

/**
 * Setup all IPC handlers for project storage.
 */
function setupProjectsIPC(ipcMain, app, getMainWindow) {
  appInstance = app;
  mainWindowGetter = getMainWindow;
  activeProjectsDir = resolveProjectsDir(app);

  ipcMain.handle('projects:get-dir', async () => {
    return getActiveProjectsDir();
  });

  ipcMain.handle('projects:set-dir', async () => {
    const win = mainWindowGetter ? mainWindowGetter() : null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Select Projects Directory',
      defaultPath: getActiveProjectsDir(),
      properties: ['openDirectory', 'createDirectory'],
    });

    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true };
    }

    const selected = res.filePaths[0];
    if (!isWritable(selected)) {
      dialog.showErrorBox('Directory Not Writable', 'The selected directory cannot be written to. Please choose another location.');
      return { error: 'Directory not writable' };
    }

    setActiveProjectsDir(selected);
    return { dir: selected };
  });

  ipcMain.handle('projects:open-in-explorer', async (event, targetPath) => {
    const target = targetPath ? resolvePath(null, targetPath) : getActiveProjectsDir();
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        shell.openPath(target);
      } else {
        shell.showItemInFolder(target);
      }
      return true;
    } else {
      shell.openPath(getActiveProjectsDir());
      return false;
    }
  });

  ipcMain.handle('projects:dialog-save-as', async (event, defaultName) => {
    const win = mainWindowGetter ? mainWindowGetter() : null;
    const defaultPath = path.join(getActiveProjectsDir(), defaultName || 'Project.vsproj');
    return await dialog.showSaveDialog(win, {
      title: 'Save Project As',
      defaultPath,
      filters: [
        { name: 'Sibcut Video Editor Project (*.vsproj)', extensions: ['vsproj'] },
        { name: 'Sibcut Video Editor Bundle (*.video-studio.zip, *.zip)', extensions: ['zip'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
    });
  });

  ipcMain.handle('projects:dialog-open', async () => {
    const win = mainWindowGetter ? mainWindowGetter() : null;
    return await dialog.showOpenDialog(win, {
      title: 'Open Project File',
      defaultPath: getActiveProjectsDir(),
      filters: [
        { name: 'Sibcut Video Editor Projects & Bundles (*.vsproj, *.zip)', extensions: ['vsproj', 'zip'] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
  });

  // Direct file system operations within Projects directory or absolute paths
  ipcMain.handle('projects:fs-read-json', async (event, { relPath, absPath }) => {
    const target = resolvePath(relPath, absPath);
    if (!fs.existsSync(target)) return null;
    try {
      const content = fs.readFileSync(target, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  });

  ipcMain.handle('projects:fs-write-json', async (event, { relPath, absPath, data }) => {
    const target = resolvePath(relPath, absPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('projects:fs-read-binary', async (event, { relPath, absPath }) => {
    const target = resolvePath(relPath, absPath);
    if (!fs.existsSync(target)) return null;
    try {
      const buf = fs.readFileSync(target);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch {
      return null;
    }
  });

  ipcMain.handle('projects:fs-write-binary', async (event, { relPath, absPath, buffer }) => {
    const target = resolvePath(relPath, absPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    fs.writeFileSync(target, buf);
    return true;
  });

  ipcMain.handle('projects:fs-remove', async (event, { relPath, absPath }) => {
    const target = resolvePath(relPath, absPath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
    return true;
  });

  ipcMain.handle('projects:fs-list', async (event, { relPath, absPath }) => {
    const target = resolvePath(relPath, absPath);
    if (!fs.existsSync(target)) return [];
    try {
      const entries = fs.readdirSync(target, { withFileTypes: true });
      return entries.map((e) => {
        let size = 0;
        let modified = 0;
        try {
          const s = fs.statSync(path.join(target, e.name));
          size = s.size;
          modified = s.mtimeMs;
        } catch {}
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size,
          modified,
        };
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle('projects:fs-exists', async (event, { relPath, absPath }) => {
    const target = resolvePath(relPath, absPath);
    return fs.existsSync(target);
  });

  ipcMain.handle('projects:fs-rename', async (event, { oldRelPath, newRelPath, oldAbsPath, newAbsPath }) => {
    const oldTarget = resolvePath(oldRelPath, oldAbsPath);
    const newTarget = resolvePath(newRelPath, newAbsPath);
    if (fs.existsSync(oldTarget)) {
      fs.mkdirSync(path.dirname(newTarget), { recursive: true });
      fs.renameSync(oldTarget, newTarget);
      return true;
    }
    return false;
  });
}

module.exports = {
  isWritable,
  getPortableDir,
  getActiveProjectsDir,
  setActiveProjectsDir,
  setupProjectsIPC,
};
