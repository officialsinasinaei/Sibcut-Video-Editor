import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  VOSK_PLATFORM_SPECS,
  verifyFileSha256,
  ensurePlatformBinary,
} from '../tools/fetch-native-vosk.mjs';

describe('Vosk Native Hydration & Cache-First Guard', () => {
  it('defines valid release specs for darwin and linux', () => {
    expect(VOSK_PLATFORM_SPECS.darwin).toBeDefined();
    expect(VOSK_PLATFORM_SPECS.darwin.filename).toBe('libvosk.dylib');
    expect(VOSK_PLATFORM_SPECS.darwin.zipSha256).toBe(
      '65395f196c9d0583d79949142b25560acaf9c295f36284e18433097f3adb0ea1'
    );
    expect(VOSK_PLATFORM_SPECS.darwin.fileSha256).toBe(
      '82fdfba0dde392a7dbba70f9c1a17f6e3da27a50444a9f53939508525a1e6fdf'
    );

    expect(VOSK_PLATFORM_SPECS.linux).toBeDefined();
    expect(VOSK_PLATFORM_SPECS.linux.filename).toBe('libvosk.so');
    expect(VOSK_PLATFORM_SPECS.linux.zipSha256).toBe(
      'bbdc8ed85c43979f6443142889770ea95cbfbc56cffb5c5dcd73afa875c5fbb2'
    );
    expect(VOSK_PLATFORM_SPECS.linux.fileSha256).toBe(
      '85c4654de3acdeb99abab86eeb2a6e603927d37089597c0fcc33d8638dc2ccaf'
    );
  });

  it('verifies SHA-256 file hashes accurately', () => {
    const tmp = path.join(import.meta.dirname, '.temp-hash-test.txt');
    try {
      const content = 'Sibcut Video Editor Vosk Hash Test';
      const expected = crypto.createHash('sha256').update(content).digest('hex');
      fs.writeFileSync(tmp, content, 'utf8');

      expect(verifyFileSha256(tmp, expected)).toBe(true);
      expect(verifyFileSha256(tmp, '0000000000000000000000000000000000000000000000000000000000000000')).toBe(false);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  it('skips downloading when valid binary already exists on disk (cache-first)', async () => {
    const tmpDir = path.join(import.meta.dirname, '.temp-vosk-cache');
    const targetFile = path.join(tmpDir, 'libvosk.fake');
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(targetFile, 'existing valid binary');
      const hash = crypto.createHash('sha256').update('existing valid binary').digest('hex');

      const mockSpec = {
        name: 'test',
        filename: 'libvosk.fake',
        fileSha256: hash,
        url: 'https://example.com/fake.zip',
      };

      const result = await ensurePlatformBinary(mockSpec, tmpDir);
      expect(result.cached).toBe(true);
      expect(result.path).toBe(targetFile);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
