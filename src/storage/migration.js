/**
 * Auto-migration from Origin Private File System (OPFS) to persistent local disk storage.
 * Runs once on startup when Electron backend is active.
 */
import { opfsBackend, opfsAvailable } from './backends.js';

export async function migrateFromOpfsIfNeeded(library, electronBackend) {
  if (!electronBackend || electronBackend.kind !== 'electron-disk') {
    return 0;
  }

  try {
    const marker = await electronBackend.readJSON('.migrated_opfs');
    if (marker) {
      return 0; // Already migrated
    }

    if (!opfsAvailable()) {
      await electronBackend.writeJSON('.migrated_opfs', { date: Date.now(), count: 0 });
      return 0;
    }

    const opfs = opfsBackend('video-studio');
    const opfsProjects = await opfs.list('projects').catch(() => []);
    const jsonFiles = opfsProjects.filter((f) => !f.isDir && f.name.endsWith('.json'));

    if (jsonFiles.length === 0) {
      await electronBackend.writeJSON('.migrated_opfs', { date: Date.now(), count: 0 });
      return 0;
    }

    console.log(`[Migration] Found ${jsonFiles.length} projects in OPFS, migrating to local disk...`);
    let migratedCount = 0;

    // Migrate projects & covers
    for (const f of jsonFiles) {
      const id = f.name.slice(0, -'.json'.length);
      try {
        const raw = await opfs.readJSON(`projects/${f.name}`);
        if (raw) {
          await library.saveProject(raw);
          const cover = await opfs.readBlob(`covers/${id}.jpg`).catch(() => null);
          if (cover) {
            await library.saveCover(id, cover).catch(() => {});
          }
          migratedCount++;
        }
      } catch (err) {
        console.warn(`[Migration] Failed migrating project ${id}:`, err);
      }
    }

    // Migrate media files
    try {
      const opfsMedia = await opfs.list('media').catch(() => []);
      for (const m of opfsMedia) {
        if (!m.isDir) {
          const blob = await opfs.readBlob(`media/${m.name}`).catch(() => null);
          if (blob) {
            await electronBackend.writeBlob(`media/${m.name}`, blob).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[Migration] Error migrating media:', err);
    }

    // Migrate LUTs
    try {
      const opfsLuts = await opfs.readJSON('luts/index.json').catch(() => null);
      if (Array.isArray(opfsLuts) && opfsLuts.length) {
        await electronBackend.writeJSON('luts/index.json', opfsLuts).catch(() => {});
        for (const l of opfsLuts) {
          const cube = await opfs.readBlob(`luts/${l.id}.cube`).catch(() => null);
          if (cube) {
            await electronBackend.writeBlob(`luts/${l.id}.cube`, cube).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[Migration] Error migrating LUTs:', err);
    }

    await electronBackend.writeJSON('.migrated_opfs', { date: Date.now(), count: migratedCount });
    console.log(`[Migration] Successfully migrated ${migratedCount} projects from OPFS!`);
    return migratedCount;
  } catch (err) {
    console.warn('[Migration] Migration check error:', err);
    return 0;
  }
}
