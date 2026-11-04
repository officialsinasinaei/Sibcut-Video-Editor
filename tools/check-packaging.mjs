#!/usr/bin/env node
'use strict';

/**
 * Packaging & Production Bundle Isolation Guardrail
 *
 * Enforces:
 * 1. Production Bundle Isolation:
 *    Only verified Electron/Node runtime packages (koffi, yauzl) may exist in `dependencies`.
 *    All web-only dependencies (fonts, onnxruntime-web, mediapipe, UI icons) must live in
 *    `devDependencies` so they are not duplicated into `app.asar`.
 *
 * 2. Asset Deduplication:
 *    No duplicate asset files between `public/` and `public/assets/`.
 *
 * 3. ASAR Size Budget:
 *    `app.asar` must not exceed the budget ceiling (200 MB).
 */

import fs from 'node:fs';
import path from 'node:path';

export const ALLOWED_RUNTIME_DEPENDENCIES = new Set(['koffi', 'yauzl']);
export const ASAR_MAX_BYTES = 200 * 1024 * 1024; // 200 MB budget ceiling

export function checkDependencies(pkg) {
  const deps = Object.keys(pkg.dependencies || {});
  const illegal = deps.filter((dep) => !ALLOWED_RUNTIME_DEPENDENCIES.has(dep));

  if (illegal.length > 0) {
    throw new Error(
      `Production Bundle Isolation violation: Found ${illegal.length} web/build package(s) in "dependencies":\n` +
        illegal.map((pkgName) => `  - ${pkgName}`).join('\n') +
        `\n\nAll web packages and fonts must move to devDependencies to prevent ASAR bloat.`
    );
  }
}

export function checkDuplicateAssets(publicDir) {
  if (!fs.existsSync(publicDir)) return;

  const publicAssetsDir = path.join(publicDir, 'assets');
  if (!fs.existsSync(publicAssetsDir)) return;

  function getAllFiles(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        files = files.concat(getAllFiles(full));
      } else if (item.isFile()) {
        files.push(item.name);
      }
    }
    return files;
  }

  const rootFiles = new Set(
    fs
      .readdirSync(publicDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
  );

  const assetFiles = getAllFiles(publicAssetsDir);
  const duplicates = assetFiles.filter((name) => rootFiles.has(name));

  if (duplicates.length > 0) {
    throw new Error(
      `Asset Deduplication violation: ${duplicates.length} duplicate asset(s) exist in both public/ and public/assets/:\n` +
        duplicates.map((f) => `  - ${f}`).join('\n')
    );
  }
}

export function checkAsarBudget(
  asarPath,
  maxBytes = ASAR_MAX_BYTES,
  statFn = (p) => (fs.existsSync(p) ? fs.statSync(p) : null)
) {
  const stat = statFn(asarPath);
  if (!stat) return null; // File does not exist yet (pre-build phase), skip budget assertion

  if (stat.size > maxBytes) {
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(2);
    throw new Error(
      `ASAR budget violation: ${asarPath} size (${sizeMB} MB) exceeds budget ceiling (${maxMB} MB). Check for unisolated dependencies or duplicate runtime assets.`
    );
  }
  return stat.size;
}

export function runAllChecks(options = {}) {
  const root = options.root || path.resolve(import.meta.dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  const publicDir = path.join(root, 'public');
  const asarPath = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  checkDependencies(pkg);
  checkDuplicateAssets(publicDir);
  const asarSize = checkAsarBudget(asarPath, options.maxBytes || ASAR_MAX_BYTES);

  return {
    success: true,
    checkedAsar: asarSize !== null,
    asarSize,
  };
}

// Direct CLI execution
const isCLI =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(import.meta.filename).toLowerCase();

if (isCLI) {
  try {
    const res = runAllChecks();
    console.log('[check-packaging] Production Bundle Isolation: OK');
    console.log('[check-packaging] Asset Deduplication: OK');
    if (res.checkedAsar) {
      const mb = (res.asarSize / (1024 * 1024)).toFixed(2);
      console.log(`[check-packaging] ASAR size budget: OK (${mb} MB <= ${(ASAR_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB)`);
    } else {
      console.log('[check-packaging] ASAR size budget: skipped (app.asar not built yet)');
    }
    console.log('[check-packaging] All packaging checks passed.');
    process.exit(0);
  } catch (err) {
    console.error(`\n[check-packaging] FAILED: ${err.message}\n`);
    process.exit(1);
  }
}
