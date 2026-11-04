import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  checkDependencies,
  checkDuplicateAssets,
  checkAsarBudget,
  runAllChecks,
} from '../tools/check-packaging.mjs';

describe('Packaging & Bundle Isolation Guardrails', () => {
  describe('checkDependencies', () => {
    it('passes when dependencies contain only allowed runtime modules', () => {
      const validPkg = {
        dependencies: {
          koffi: '^3.3.4',
          yauzl: '^3.4.0',
        },
      };
      expect(() => checkDependencies(validPkg)).not.toThrow();
    });

    it('rejects web packages placed under dependencies', () => {
      const invalidPkg = {
        dependencies: {
          koffi: '^3.3.4',
          yauzl: '^3.4.0',
          'onnxruntime-web': '^1.31.1',
        },
      };
      expect(() => checkDependencies(invalidPkg)).toThrow(/Production Bundle Isolation/);
    });

    it('rejects font packages placed under dependencies', () => {
      const invalidPkg = {
        dependencies: {
          koffi: '^3.3.4',
          yauzl: '^3.4.0',
          '@fontsource/inter': '^5.3.0',
        },
      };
      expect(() => checkDependencies(invalidPkg)).toThrow(/move to devDependencies/);
    });
  });

  describe('checkDuplicateAssets', () => {
    it('passes when public has no redundant duplicates in public/assets', () => {
      const root = path.resolve(import.meta.dirname, '..');
      const publicDir = path.join(root, 'public');
      expect(() => checkDuplicateAssets(publicDir)).not.toThrow();
    });

    it('throws when duplicates exist in public and public/assets', () => {
      const tempDir = path.join(import.meta.dirname, '.temp-dup-test');
      const tempAssets = path.join(tempDir, 'assets');
      try {
        fs.mkdirSync(tempAssets, { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'dup.wasm'), 'root');
        fs.writeFileSync(path.join(tempAssets, 'dup.wasm'), 'nested');

        expect(() => checkDuplicateAssets(tempDir)).toThrow(/Asset Deduplication violation/);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('checkAsarBudget', () => {
    it('passes when asar size is within budget', () => {
      // 100 MB file passes 200 MB budget
      const statFn = () => ({ size: 100 * 1024 * 1024 });
      expect(() => checkAsarBudget('fake/app.asar', 200 * 1024 * 1024, statFn)).not.toThrow();
    });

    it('throws when asar exceeds budget', () => {
      // 250 MB file fails 200 MB budget
      const statFn = () => ({ size: 250 * 1024 * 1024 });
      expect(() => checkAsarBudget('fake/app.asar', 200 * 1024 * 1024, statFn)).toThrow(
        /exceeds budget ceiling/
      );
    });

    it('silently ignores missing asar file if not built yet', () => {
      expect(() => checkAsarBudget('non-existent-path/app.asar', 200 * 1024 * 1024)).not.toThrow();
    });
  });

  describe('runAllChecks on current workspace', () => {
    it('passes all checks against repo root', () => {
      const root = path.resolve(import.meta.dirname, '..');
      const results = runAllChecks({ root });
      expect(results.success).toBe(true);
      expect(typeof results.checkedAsar).toBe('boolean');
    });
  });
});
