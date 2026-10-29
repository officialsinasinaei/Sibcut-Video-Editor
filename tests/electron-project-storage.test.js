import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanitizeFolderName, electronBackend } from '../src/storage/electron-backend.js';
import { normalizeAsset } from '../src/model/project.js';
import { Library } from '../src/storage/library.js';
import { migrateFromOpfsIfNeeded } from '../src/storage/migration.js';

describe('sanitizeFolderName', () => {
  it('cleans invalid Windows characters', () => {
    expect(sanitizeFolderName('My/Project:Test*?Name<1>|"Hi"')).toBe('My Project Test Name 1 Hi');
  });

  it('handles reserved Windows device names', () => {
    expect(sanitizeFolderName('CON')).toBe('CON_project');
    expect(sanitizeFolderName('prn')).toBe('prn_project');
    expect(sanitizeFolderName('aux')).toBe('aux_project');
    expect(sanitizeFolderName('NUL')).toBe('NUL_project');
    expect(sanitizeFolderName('COM1')).toBe('COM1_project');
    expect(sanitizeFolderName('lpt9')).toBe('lpt9_project');
  });

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFolderName('Project Alpha...')).toBe('Project Alpha');
    expect(sanitizeFolderName('   Trimmed Project   ')).toBe('Trimmed Project');
  });

  it('defaults empty or whitespace-only names to Untitled', () => {
    expect(sanitizeFolderName('')).toBe('Untitled');
    expect(sanitizeFolderName('   ')).toBe('Untitled');
    expect(sanitizeFolderName('...')).toBe('Untitled');
  });
});

describe('normalizeAsset localPath preservation', () => {
  it('preserves localPath for linked media', () => {
    const raw = {
      id: 'a1',
      kind: 'video',
      name: 'clip.mp4',
      hash: 'h123',
      ext: 'mp4',
      localPath: 'C:\\Videos\\my-clip.mp4',
    };
    const norm = normalizeAsset(raw);
    expect(norm.localPath).toBe('C:\\Videos\\my-clip.mp4');
  });

  it('omits localPath when not a non-empty string', () => {
    const raw = {
      id: 'a2',
      kind: 'video',
      name: 'clip.mp4',
      hash: 'h123',
      ext: 'mp4',
      localPath: null,
    };
    const norm = normalizeAsset(raw);
    expect(norm.localPath).toBeUndefined();
  });
});

describe('electronBackend storage operations', () => {
  let mockFs;
  let mockApi;

  beforeEach(() => {
    mockFs = new Map();

    mockApi = {
      isElectron: true,
      async readJSON(relPath) {
        if (!mockFs.has(relPath)) return null;
        return JSON.parse(mockFs.get(relPath));
      },
      async writeJSON(relPath, data) {
        mockFs.set(relPath, JSON.stringify(data));
      },
      async readBinary(relPath) {
        if (!mockFs.has(relPath)) return null;
        return mockFs.get(relPath);
      },
      async writeBinary(relPath, buf) {
        mockFs.set(relPath, buf);
      },
      async remove(relPath) {
        for (const k of [...mockFs.keys()]) {
          if (k === relPath || k.startsWith(relPath + '/')) {
            mockFs.delete(k);
          }
        }
      },
      async list(relDir) {
        const prefix = relDir ? (relDir.endsWith('/') ? relDir : relDir + '/') : '';
        const dirs = new Set();
        const files = [];

        for (const k of mockFs.keys()) {
          if (!k.startsWith(prefix)) continue;
          const remainder = k.slice(prefix.length);
          const parts = remainder.split('/');
          if (parts.length > 1) {
            dirs.add(parts[0]);
          } else if (parts.length === 1 && parts[0]) {
            files.push({ name: parts[0], isDir: false, modified: Date.now(), size: 100 });
          }
        }

        const dirList = [...dirs].map((d) => ({ name: d, isDir: true, modified: Date.now(), size: 0 }));
        return [...dirList, ...files];
      },
      async exists(relPath) {
        if (mockFs.has(relPath)) return true;
        for (const k of mockFs.keys()) {
          if (k.startsWith(relPath + '/')) return true;
        }
        return false;
      },
      async rename(oldRel, newRel) {
        for (const k of [...mockFs.keys()]) {
          if (k === oldRel) {
            mockFs.set(newRel, mockFs.get(k));
            mockFs.delete(k);
          } else if (k.startsWith(oldRel + '/')) {
            const nextKey = newRel + k.slice(oldRel.length);
            mockFs.set(nextKey, mockFs.get(k));
            mockFs.delete(k);
          }
        }
      },
    };

    window.projectStorageAPI = mockApi;
  });

  it('saves project document in its own project folder with project.vsproj', async () => {
    const backend = electronBackend();
    const project = { id: 'p_101', name: 'Summer Vacation' };

    await backend.writeJSON('projects/p_101.json', project);

    // Verify written to disk under Projects/Summer Vacation/project.vsproj
    const saved = await mockApi.readJSON('Summer Vacation/project.vsproj');
    expect(saved).toEqual(project);

    // Reading back via standard storage interface returns the project document
    const read = await backend.readJSON('projects/p_101.json');
    expect(read).toEqual(project);
  });

  it('handles name collisions by appending counter suffix', async () => {
    const backend = electronBackend();
    const project1 = { id: 'p_1', name: 'My Vlog' };
    const project2 = { id: 'p_2', name: 'My Vlog' };

    await backend.writeJSON('projects/p_1.json', project1);
    await backend.writeJSON('projects/p_2.json', project2);

    expect(await mockApi.readJSON('My Vlog/project.vsproj')).toEqual(project1);
    expect(await mockApi.readJSON('My Vlog (2)/project.vsproj')).toEqual(project2);

    expect(await backend.readJSON('projects/p_1.json')).toEqual(project1);
    expect(await backend.readJSON('projects/p_2.json')).toEqual(project2);
  });

  it('renames project folder when project name changes', async () => {
    const backend = electronBackend();
    const project = { id: 'p_rename', name: 'Draft 1' };
    await backend.writeJSON('projects/p_rename.json', project);

    expect(await mockApi.exists('Draft 1/project.vsproj')).toBe(true);

    project.name = 'Final Cut';
    await backend.writeJSON('projects/p_rename.json', project);

    expect(await mockApi.exists('Draft 1/project.vsproj')).toBe(false);
    expect(await mockApi.exists('Final Cut/project.vsproj')).toBe(true);
    expect(await backend.readJSON('projects/p_rename.json')).toEqual(project);
  });

  it('saves cover in project folder and removes project folder on delete', async () => {
    const backend = electronBackend();
    const project = { id: 'p_cover', name: 'Tutorial' };
    await backend.writeJSON('projects/p_cover.json', project);

    const coverBytes = new Uint8Array([1, 2, 3, 4]);
    const coverBlob = new Blob([coverBytes], { type: 'image/jpeg' });
    await backend.writeBlob('covers/p_cover.jpg', coverBlob);

    expect(await mockApi.exists('Tutorial/cover.jpg')).toBe(true);

    const readCover = await backend.readBlob('covers/p_cover.jpg');
    expect(readCover).not.toBeNull();
    expect(readCover.type).toBe('image/jpeg');

    // Deleting project removes project folder
    await backend.remove('projects/p_cover.json');
    expect(await mockApi.exists('Tutorial/project.vsproj')).toBe(false);
    expect(await mockApi.exists('Tutorial/cover.jpg')).toBe(false);
  });

  it('lists all projects by scanning project directories', async () => {
    const backend = electronBackend();
    await backend.writeJSON('projects/p_a.json', { id: 'p_a', name: 'Project A' });
    await backend.writeJSON('projects/p_b.json', { id: 'p_b', name: 'Project B' });

    const list = await backend.list('projects');
    expect(list.map((x) => x.name).sort()).toEqual(['p_a.json', 'p_b.json']);
  });

  it('saves and resolves in-app generated media in active project folder and common media', async () => {
    const backend = electronBackend();
    backend.setActiveProject('p_active');
    await backend.writeJSON('projects/p_active.json', { id: 'p_active', name: 'Active Project' });
    backend.setActiveProject('p_active'); // updates active folder

    const audioBytes = new Uint8Array([10, 20, 30]);
    const blob = new Blob([audioBytes], { type: 'audio/wav' });
    await backend.writeBlob('media/voiceover123.wav', blob);

    // Stored in active project media folder and common media folder
    expect(await mockApi.exists('Active Project/media/voiceover123.wav')).toBe(true);
    expect(await mockApi.exists('media/voiceover123.wav')).toBe(true);

    const readBlob = await backend.readBlob('media/voiceover123.wav');
    expect(readBlob).not.toBeNull();
    expect(readBlob.type).toBe('audio/wav');
  });

  it('skips reserved folders like media and luts when listing projects', async () => {
    const backend = electronBackend();
    await backend.writeJSON('projects/p_real.json', { id: 'p_real', name: 'Real Project' });
    // Create reserved directories with files
    mockFs.set('media/voice.wav', 'fake-audio');
    mockFs.set('luts/grade.cube', 'fake-lut');

    const list = await backend.list('projects');
    expect(list.map((x) => x.name)).toEqual(['p_real.json']);
  });

  it('resolves project folder quickly using index.json candidate name', async () => {
    const backend = electronBackend();
    const project = { id: 'p_fast', name: 'Fast Vlog' };
    await backend.writeJSON('projects/p_fast.json', project);
    await backend.writeJSON('index.json', [{ id: 'p_fast', name: 'Fast Vlog' }]);

    const newBackend = electronBackend();
    const read = await newBackend.readJSON('projects/p_fast.json');
    expect(read).toEqual(project);
  });
});

describe('linked media in Library', () => {
  it('returns /api/local-media stream URL when asset has localPath in Electron', async () => {
    window.projectStorageAPI = { isElectron: true };
    const library = new Library({
      kind: 'electron-disk',
      async readBlob() {
        return null;
      },
    });

    const asset = {
      id: 'a1',
      hash: 'h_test',
      ext: 'mp4',
      localPath: 'C:\\Videos\\demo.mp4',
    };

    const url = await library.mediaURL(asset);
    expect(url).toBe(`/api/local-media?path=${encodeURIComponent('C:\\Videos\\demo.mp4')}`);
  });

  it('does not mark linked media with localPath as missing when file exists on disk', async () => {
    window.projectStorageAPI = {
      isElectron: true,
      exists: vi.fn(async (rel, opts) => opts?.absPath === 'D:\\Videos\\intro.mp4'),
    };
    const library = new Library({
      kind: 'electron-disk',
      async list() {
        return [];
      },
    });

    const assetWithLocal = {
      id: 'a1',
      hash: 'h1',
      ext: 'mp4',
      localPath: 'D:\\Videos\\intro.mp4',
    };

    const missing = await library.missingMedia([assetWithLocal]);
    expect(missing).toEqual([]);
    expect(window.projectStorageAPI.exists).toHaveBeenCalledWith(null, { absPath: 'D:\\Videos\\intro.mp4' });
  });

  it('correctly marks linked media as missing when local file does not exist on disk', async () => {
    window.projectStorageAPI = {
      isElectron: true,
      exists: vi.fn(async () => false),
    };
    const library = new Library({
      kind: 'electron-disk',
      async list() {
        return [];
      },
    });

    const missingAsset = {
      id: 'a2',
      hash: 'h2',
      ext: 'mp4',
      name: 'unplugged-drive-video.mp4',
      localPath: 'E:\\Videos\\unplugged.mp4',
    };

    const missing = await library.missingMedia([missingAsset]);
    expect(missing).toEqual([missingAsset]);
    expect(window.projectStorageAPI.exists).toHaveBeenCalledWith(null, { absPath: 'E:\\Videos\\unplugged.mp4' });
  });
});

describe('OPFS migration', () => {
  it('migrates OPFS projects to local disk once and sets migration marker', async () => {
    const mockDiskFs = new Map();
    const diskBackend = {
      kind: 'electron-disk',
      async readJSON(path) {
        return mockDiskFs.has(path) ? JSON.parse(mockDiskFs.get(path)) : null;
      },
      async writeJSON(path, val) {
        mockDiskFs.set(path, JSON.stringify(val));
      },
      async writeBlob(path, val) {
        mockDiskFs.set(path, val);
      },
    };

    const savedProjects = [];
    const library = {
      async saveProject(p) {
        savedProjects.push(p);
      },
      async saveCover() {},
    };

    // First run with no OPFS available/empty
    const count = await migrateFromOpfsIfNeeded(library, diskBackend);
    expect(count).toBe(0);
    expect(mockDiskFs.has('.migrated_opfs')).toBe(true);

    // Second run should return 0 immediately because .migrated_opfs is set
    const count2 = await migrateFromOpfsIfNeeded(library, diskBackend);
    expect(count2).toBe(0);
  });
});
