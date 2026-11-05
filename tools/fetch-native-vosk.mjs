#!/usr/bin/env node
'use strict';

/**
 * Build-Time Native Vosk Hydration Tool
 *
 * Fetches, cryptographically verifies, and unpacks precompiled Vosk C shared libraries
 * (libvosk.dylib for macOS and libvosk.so for Linux) from official Alphacephei release archives.
 *
 * Employs local cache-first verification to avoid redundant network transfers and ensure
 * deterministic, offline-capable builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yauzl = require('yauzl');

export const VOSK_PLATFORM_SPECS = {
  darwin: {
    name: 'macOS (Universal2)',
    filename: 'libvosk.dylib',
    targetDir: 'native/darwin',
    url: 'https://github.com/alphacep/vosk-api/releases/download/v0.3.42/vosk-osx-0.3.42.zip',
    zipSha256: '65395f196c9d0583d79949142b25560acaf9c295f36284e18433097f3adb0ea1',
    fileSha256: '82fdfba0dde392a7dbba70f9c1a17f6e3da27a50444a9f53939508525a1e6fdf',
    entryMatcher: (name) => name.endsWith('libvosk.dylib'),
  },
  linux: {
    name: 'Linux (x86_64)',
    filename: 'libvosk.so',
    targetDir: 'native/linux-x64',
    url: 'https://github.com/alphacep/vosk-api/releases/download/v0.3.45/vosk-linux-x86_64-0.3.45.zip',
    zipSha256: 'bbdc8ed85c43979f6443142889770ea95cbfbc56cffb5c5dcd73afa875c5fbb2',
    fileSha256: '85c4654de3acdeb99abab86eeb2a6e603927d37089597c0fcc33d8638dc2ccaf',
    entryMatcher: (name) => name.endsWith('libvosk.so'),
  },
};

/**
 * Compute SHA-256 hash of a file on disk
 */
export function computeFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Verify whether a file's SHA-256 matches the expected hash
 */
export function verifyFileSha256(filePath, expectedHash) {
  if (!fs.existsSync(filePath) || !expectedHash) return false;
  return computeFileSha256(filePath) === expectedHash;
}

/**
 * Download a remote URL to a local destination with HTTP 3xx redirect handling
 */
export function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    function get(currentUrl, redirectCount = 0) {
      if (redirectCount > 5) {
        return reject(new Error('Too many HTTP redirects while downloading ' + url));
      }

      https
        .get(currentUrl, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location, redirectCount + 1);
          }
          if (res.statusCode !== 200) {
            return reject(
              new Error(`Failed to download ${currentUrl}: HTTP ${res.statusCode}`)
            );
          }

          const fileStream = fs.createWriteStream(destPath);
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close(resolve);
          });
          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => reject(err));
          });
        })
        .on('error', reject);
    }

    get(url);
  });
}

/**
 * Extract a single matching entry from a zip archive using yauzl
 */
export function extractEntryFromZip(zipPath, entryMatcher, outputPath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      let extracted = false;
      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        if (!extracted && entryMatcher(entry.fileName)) {
          extracted = true;
          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr) return reject(streamErr);
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            const writeStream = fs.createWriteStream(outputPath);
            readStream.pipe(writeStream);
            writeStream.on('finish', () => {
              writeStream.close(() => {
                zipfile.close();
                resolve(outputPath);
              });
            });
            writeStream.on('error', reject);
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        if (!extracted) {
          reject(new Error(`Entry matching spec not found in ${zipPath}`));
        }
      });

      zipfile.on('error', reject);
    });
  });
}

/**
 * Ensure platform binary exists, checking cache first and fetching only if missing or invalid
 */
export async function ensurePlatformBinary(spec, rootDir = process.cwd()) {
  const targetDir = spec.targetDir ? path.resolve(rootDir, spec.targetDir) : rootDir;
  const targetFile = path.join(targetDir, spec.filename);

  // 1. Check local cache first
  if (fs.existsSync(targetFile)) {
    if (spec.fileSha256) {
      if (verifyFileSha256(targetFile, spec.fileSha256)) {
        return { cached: true, path: targetFile };
      }
    } else if (fs.statSync(targetFile).size > 0) {
      // Non-empty local file with no explicit fileSha256 requirement
      return { cached: true, path: targetFile };
    }
  }

  // 2. Fetch and hydrate from remote archive
  fs.mkdirSync(targetDir, { recursive: true });
  const tempZip = path.join(targetDir, `.temp-${Date.now()}-${spec.filename}.zip`);

  try {
    console.log(`[fetch-vosk] Downloading ${spec.name} binary from ${spec.url}...`);
    await downloadFile(spec.url, tempZip);

    // Cryptographic validation of downloaded archive
    if (spec.zipSha256) {
      if (!verifyFileSha256(tempZip, spec.zipSha256)) {
        throw new Error(
          `Cryptographic checksum mismatch for ${spec.filename} archive! Expected ${spec.zipSha256}`
        );
      }
    }

    console.log(`[fetch-vosk] Extracting ${spec.filename} to ${targetFile}...`);
    const matcher = spec.entryMatcher || ((name) => name.endsWith(spec.filename));
    await extractEntryFromZip(tempZip, matcher, targetFile);

    return { downloaded: true, path: targetFile };
  } finally {
    if (fs.existsSync(tempZip)) {
      try {
        fs.unlinkSync(tempZip);
      } catch {}
    }
  }
}

/**
 * Main execution function
 */
export async function run(args = process.argv.slice(2)) {
  const rootDir = path.resolve(fileURLToPath(import.meta.url), '..', '..');
  const targetPlatformArg = args
    .find((a) => a.startsWith('--platform='))
    ?.split('=')[1];
  const allPlatforms = args.includes('--all') || targetPlatformArg === 'all';

  let targets = [];
  if (allPlatforms) {
    targets = Object.keys(VOSK_PLATFORM_SPECS);
  } else if (targetPlatformArg) {
    if (targetPlatformArg === 'win32') {
      console.log('[fetch-vosk] Windows binary already bundled in native/win-x86_64. OK.');
      return;
    }
    if (!VOSK_PLATFORM_SPECS[targetPlatformArg]) {
      throw new Error(`Unsupported platform target: ${targetPlatformArg}`);
    }
    targets = [targetPlatformArg];
  } else {
    // Current host platform
    const host = process.platform;
    if (host === 'win32') {
      console.log('[fetch-vosk] Windows binary already bundled in native/win-x86_64. OK.');
      return;
    }
    if (VOSK_PLATFORM_SPECS[host]) {
      targets = [host];
    } else {
      console.log(`[fetch-vosk] Host platform ${host} has no native Vosk binary spec. Skipping.`);
      return;
    }
  }

  for (const plat of targets) {
    const spec = VOSK_PLATFORM_SPECS[plat];
    const res = await ensurePlatformBinary(spec, rootDir);
    if (res.cached) {
      console.log(`[fetch-vosk] ${spec.name} binary cached at ${res.path}. OK.`);
    } else {
      console.log(`[fetch-vosk] Successfully hydrated ${spec.name} to ${res.path}.`);
    }
  }
}

// Direct invocation check
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().catch((err) => {
    console.error('[fetch-vosk-error]', err);
    process.exit(1);
  });
}
