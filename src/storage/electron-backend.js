/**
 * Electron Disk Storage Backend
 *
 * Persists Video Studio projects in clean, human-readable folders on the local disk:
 *   Projects/
 *     index.json
 *     My Vacation Vlog/
 *       project.vsproj
 *       cover.jpg
 *       media/
 *     Tech Tutorial/
 *       project.vsproj
 *       cover.jpg
 *       media/
 *     luts/
 *       index.json
 *       <hash>.cube
 *
 * Implements the standard storage backend interface:
 *   readJSON(path) -> object | null
 *   writeJSON(path, value)
 *   readBlob(path) -> Blob | null
 *   writeBlob(path, blob)
 *   remove(path)
 *   list(dir) -> [{ name, isDir, modified, size }]
 */

export function sanitizeFolderName(name) {
  let cleaned = String(name || 'Untitled')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
  if (!cleaned) cleaned = 'Untitled';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleaned)) {
    cleaned += '_project';
  }
  return cleaned;
}

export function electronBackend() {
  const api = typeof window !== 'undefined' ? window.projectStorageAPI : null;
  if (!api) {
    throw new Error('projectStorageAPI is not available in renderer');
  }

  // Cache: projectId -> folderName
  const folderCache = new Map();
  let activeProjectId = null;
  let activeProjectFolder = null;

  async function resolveFolder(projectId) {
    if (!projectId) return null;
    if (folderCache.has(projectId)) {
      return folderCache.get(projectId);
    }

    // Try reading index.json to check for pre-mapped folder property or candidate project name
    const index = await api.readJSON('index.json').catch(() => null);
    if (Array.isArray(index)) {
      const entry = index.find((p) => p.id === projectId);
      if (entry?.folder) {
        folderCache.set(projectId, entry.folder);
        return entry.folder;
      }
      if (entry?.name) {
        const candidate = sanitizeFolderName(entry.name);
        const vsproj = await api.readJSON(`${candidate}/project.vsproj`).catch(() => null);
        if (vsproj && vsproj.id === projectId) {
          folderCache.set(projectId, candidate);
          return candidate;
        }
      }
    }

    // Scan Projects directory for any subfolder with project.vsproj matching projectId
    const reservedDirs = new Set(['media', 'luts', 'data', 'node_modules']);
    const rootItems = await api.list('').catch(() => []);
    for (const item of rootItems) {
      if (item.isDir && !item.name.startsWith('.') && !reservedDirs.has(item.name.toLowerCase())) {
        const vsproj = await api.readJSON(`${item.name}/project.vsproj`).catch(() => null);
        if (vsproj && vsproj.id === projectId) {
          folderCache.set(projectId, item.name);
          return item.name;
        }
      }
    }

    // Fallback: check legacy projects/<id>.json in root
    const legacyExists = await api.exists(`projects/${projectId}.json`).catch(() => false);
    if (legacyExists) {
      return `projects/${projectId}.json`;
    }

    return null;
  }

  async function getOrCreateFolder(project) {
    const id = project.id;
    const existing = await resolveFolder(id);
    const desired = sanitizeFolderName(project.name);

    if (existing && !existing.startsWith('projects/')) {
      // Check if project was renamed and we can safely rename the folder
      if (existing !== desired) {
        const desiredExists = await api.exists(desired).catch(() => false);
        if (!desiredExists) {
          try {
            await api.rename(existing, desired);
            folderCache.set(id, desired);
            if (activeProjectId === id) activeProjectFolder = desired;
            return desired;
          } catch (e) {
            console.warn('[electronBackend] Could not rename project folder:', e);
          }
        }
      }
      return existing;
    }

    // Create a new folder, handling collisions if desired folder exists
    let targetFolder = desired;
    let counter = 2;
    while (await api.exists(targetFolder).catch(() => false)) {
      const existingDoc = await api.readJSON(`${targetFolder}/project.vsproj`).catch(() => null);
      if (existingDoc && existingDoc.id === id) {
        folderCache.set(id, targetFolder);
        return targetFolder;
      }
      targetFolder = `${desired} (${counter})`;
      counter++;
    }

    folderCache.set(id, targetFolder);
    if (activeProjectId === id) activeProjectFolder = targetFolder;
    return targetFolder;
  }

  const backend = {
    kind: 'electron-disk',

    setActiveProject(id) {
      activeProjectId = id;
      if (id && folderCache.has(id)) {
        activeProjectFolder = folderCache.get(id);
      } else {
        activeProjectFolder = null;
        if (id) {
          resolveFolder(id).then((f) => {
            if (activeProjectId === id && f && !f.startsWith('projects/')) {
              activeProjectFolder = f;
            }
          });
        }
      }
    },

    getActiveProjectFolder() {
      return activeProjectFolder;
    },

    async readJSON(relPath) {
      try {
        if (relPath === 'index.json') {
          return await api.readJSON('index.json');
        }

        if (relPath.startsWith('projects/') && relPath.endsWith('.json')) {
          const id = relPath.slice('projects/'.length, -'.json'.length);
          const folder = await resolveFolder(id);
          if (folder) {
            if (folder.startsWith('projects/')) {
              return await api.readJSON(folder);
            }
            return await api.readJSON(`${folder}/project.vsproj`);
          }
          return null;
        }

        return await api.readJSON(relPath);
      } catch (err) {
        console.warn(`[electronBackend] readJSON error for ${relPath}:`, err);
        return null;
      }
    },

    async writeJSON(relPath, value) {
      if (relPath === 'index.json') {
        await api.writeJSON('index.json', value);
        return;
      }

      if (relPath.startsWith('projects/') && relPath.endsWith('.json')) {
        const project = value;
        const folder = await getOrCreateFolder(project);
        if (folder.startsWith('projects/')) {
          await api.writeJSON(folder, project);
        } else {
          await api.writeJSON(`${folder}/project.vsproj`, project);
        }
        return;
      }

      await api.writeJSON(relPath, value);
    },

    async readBlob(relPath) {
      try {
        if (relPath.startsWith('covers/') && relPath.endsWith('.jpg')) {
          const id = relPath.slice('covers/'.length, -'.jpg'.length);
          const folder = await resolveFolder(id);
          let buf = null;
          if (folder && !folder.startsWith('projects/')) {
            buf = await api.readBinary(`${folder}/cover.jpg`);
          }
          if (!buf) {
            buf = await api.readBinary(`covers/${id}.jpg`);
          }
          return buf ? new Blob([buf], { type: 'image/jpeg' }) : null;
        }

        if (relPath.startsWith('media/')) {
          const filename = relPath.slice('media/'.length);
          let buf = null;

          if (!activeProjectFolder && activeProjectId) {
            activeProjectFolder = await resolveFolder(activeProjectId);
          }

          // 1. Check in active project folder if available
          if (activeProjectFolder) {
            buf = await api.readBinary(`${activeProjectFolder}/media/${filename}`);
          }
          // 2. Check in Projects/media/
          if (!buf) {
            buf = await api.readBinary(`media/${filename}`);
          }
          // 3. Search across all project folders
          if (!buf) {
            const reservedDirs = new Set(['media', 'luts', 'data', 'node_modules']);
            const rootItems = await api.list('').catch(() => []);
            for (const item of rootItems) {
              if (item.isDir && !item.name.startsWith('.') && !reservedDirs.has(item.name.toLowerCase())) {
                buf = await api.readBinary(`${item.name}/media/${filename}`);
                if (buf) break;
              }
            }
          }

          if (buf) {
            const ext = filename.split('.').pop()?.toLowerCase();
            const mime =
              ext === 'mp4'
                ? 'video/mp4'
                : ext === 'webm'
                  ? 'video/webm'
                  : ext === 'mov'
                    ? 'video/quicktime'
                    : ext === 'mkv'
                      ? 'video/x-matroska'
                      : ext === 'avi'
                        ? 'video/x-msvideo'
                        : ext === 'mp3'
                          ? 'audio/mpeg'
                          : ext === 'wav'
                            ? 'audio/wav'
                            : ext === 'ogg'
                              ? 'audio/ogg'
                              : ext === 'm4a'
                                ? 'audio/mp4'
                                : ext === 'aac'
                                  ? 'audio/aac'
                                  : ext === 'flac'
                                    ? 'audio/flac'
                                    : ext === 'png'
                                      ? 'image/png'
                                      : ext === 'jpg' || ext === 'jpeg'
                                        ? 'image/jpeg'
                                        : ext === 'webp'
                                          ? 'image/webp'
                                          : ext === 'gif'
                                            ? 'image/gif'
                                            : ext === 'svg'
                                              ? 'image/svg+xml'
                                              : 'application/octet-stream';
            return new Blob([buf], { type: mime });
          }
          return null;
        }

        // Generic blob read (e.g. luts, fonts)
        const buf = await api.readBinary(relPath);
        return buf ? new Blob([buf]) : null;
      } catch (err) {
        console.warn(`[electronBackend] readBlob error for ${relPath}:`, err);
        return null;
      }
    },

    async writeBlob(relPath, blob) {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      if (relPath.startsWith('covers/') && relPath.endsWith('.jpg')) {
        const id = relPath.slice('covers/'.length, -'.jpg'.length);
        const folder = await resolveFolder(id);
        if (folder && !folder.startsWith('projects/')) {
          await api.writeBinary(`${folder}/cover.jpg`, uint8);
        } else {
          await api.writeBinary(`covers/${id}.jpg`, uint8);
        }
        return;
      }

      if (relPath.startsWith('media/')) {
        const filename = relPath.slice('media/'.length);
        if (!activeProjectFolder && activeProjectId) {
          activeProjectFolder = await resolveFolder(activeProjectId);
        }
        // Write to active project folder's media subfolder if present
        if (activeProjectFolder) {
          await api.writeBinary(`${activeProjectFolder}/media/${filename}`, uint8);
        }
        // Also write to common media folder so it is accessible cross-project
        await api.writeBinary(`media/${filename}`, uint8);
        return;
      }

      await api.writeBinary(relPath, uint8);
    },

    async remove(relPath) {
      try {
        if (relPath.startsWith('projects/') && relPath.endsWith('.json')) {
          const id = relPath.slice('projects/'.length, -'.json'.length);
          const folder = await resolveFolder(id);
          if (folder) {
            await api.remove(folder);
            folderCache.delete(id);
          }
          await api.remove(`projects/${id}.json`).catch(() => {});
          return;
        }

        if (relPath.startsWith('covers/')) {
          const id = relPath.slice('covers/'.length, -'.jpg'.length);
          const folder = await resolveFolder(id);
          if (folder && !folder.startsWith('projects/')) {
            await api.remove(`${folder}/cover.jpg`).catch(() => {});
          }
          await api.remove(relPath).catch(() => {});
          return;
        }

        await api.remove(relPath);
      } catch (err) {
        console.warn(`[electronBackend] remove error for ${relPath}:`, err);
      }
    },

    async list(relDir) {
      try {
        const reservedDirs = new Set(['media', 'luts', 'data', 'node_modules']);
        if (relDir === 'projects') {
          const out = [];
          const seen = new Set();
          const rootItems = await api.list('').catch(() => []);
          for (const item of rootItems) {
            if (item.isDir && !item.name.startsWith('.') && !reservedDirs.has(item.name.toLowerCase())) {
              const vsproj = await api.readJSON(`${item.name}/project.vsproj`).catch(() => null);
              if (vsproj && vsproj.id) {
                folderCache.set(vsproj.id, item.name);
                seen.add(vsproj.id);
                out.push({
                  name: `${vsproj.id}.json`,
                  isDir: false,
                  modified: item.modified || Date.now(),
                  size: item.size || 0,
                });
              }
            }
          }
          // Legacy projects/ folder check
          const legacy = await api.list('projects').catch(() => []);
          for (const l of legacy) {
            if (!l.isDir && l.name.endsWith('.json')) {
              const id = l.name.slice(0, -'.json'.length);
              if (!seen.has(id)) {
                out.push(l);
              }
            }
          }
          return out;
        }

        if (relDir === 'media') {
          const map = new Map();
          const common = await api.list('media').catch(() => []);
          for (const f of common) {
            if (!f.isDir) map.set(f.name, f);
          }
          const rootItems = await api.list('').catch(() => []);
          for (const item of rootItems) {
            if (item.isDir && !item.name.startsWith('.') && !reservedDirs.has(item.name.toLowerCase())) {
              const sub = await api.list(`${item.name}/media`).catch(() => []);
              for (const f of sub) {
                if (!f.isDir && !map.has(f.name)) map.set(f.name, f);
              }
            }
          }
          return [...map.values()];
        }

        return await api.list(relDir);
      } catch (err) {
        console.warn(`[electronBackend] list error for ${relDir}:`, err);
        return [];
      }
    },
  };

  return backend;
}
