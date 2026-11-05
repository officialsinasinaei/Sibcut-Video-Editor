import { describe, it, expect, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const voskService = require('../vosk-service.cjs');

describe('Vosk Speech Recognition Service & Worker', () => {
  it('initializes native Vosk library with Koffi', () => {
    const ok = voskService.initNativeLibrary();
    expect(ok).toBe(true);
  });

  it('handles cross-platform native library discovery for win32, darwin, and linux', () => {
    expect(typeof voskService.isPlatformSupported).toBe('function');
    expect(typeof voskService.isNativeSupported).toBe('function');
    expect(typeof voskService.getNativeLibraryDir).toBe('function');

    expect(voskService.isPlatformSupported('win32')).toBe(true);
    expect(voskService.isPlatformSupported('darwin')).toBe(true);
    expect(voskService.isPlatformSupported('linux')).toBe(true);
    expect(voskService.isPlatformSupported('sunos')).toBe(false);

    // Native binaries: win32 is checked into repo, darwin and linux are hydrated via tools/fetch-native-vosk.mjs
    expect(voskService.isNativeSupported('win32')).toBe(true);
    expect(voskService.isNativeSupported('sunos')).toBe(false);
    expect(voskService.isNativeSupported('darwin')).toBe(Boolean(voskService.getNativeLibraryDir('darwin')));
    expect(voskService.isNativeSupported('linux')).toBe(Boolean(voskService.getNativeLibraryDir('linux')));

    expect(voskService.getNativeLibraryDir('win32')).toContain('win-x86_64');
    if (voskService.getNativeLibraryDir('darwin')) {
      expect(voskService.getNativeLibraryDir('darwin')).toContain('darwin');
    }
    if (voskService.getNativeLibraryDir('linux')) {
      expect(voskService.getNativeLibraryDir('linux')).toContain('linux-x64');
    }
  });

  it('scans models directory correctly', () => {
    voskService.init({
      getPath: () => 'D:\\apps\\Sibcut Video Editor\\data',
    });
    const models = voskService.listInstalledModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    const enModel = models.find((m) => m.id.includes('en-us'));
    expect(enModel).toBeDefined();
    expect(enModel.langText).toBe('English (US)');
  });

  it('transcribes audio asynchronously via worker without blocking event loop', async () => {
    voskService.init({
      getPath: () => 'D:\\apps\\Sibcut Video Editor\\data',
    });
    const models = voskService.listInstalledModels();
    const model = models[0];

    // 0.5s of 16kHz 16-bit silence
    const silence = Buffer.alloc(16000);
    const progressList = [];

    let mainLoopTicks = 0;
    const timer = setInterval(() => { mainLoopTicks++; }, 20);

    const result = await voskService.transcribeAudio(
      model.path,
      silence,
      16000,
      (f) => progressList.push(f)
    );

    clearInterval(timer);

    expect(result).toHaveProperty('words');
    expect(result).toHaveProperty('text');
    expect(Array.isArray(result.words)).toBe(true);
    expect(progressList.length).toBeGreaterThan(0);
    expect(mainLoopTicks).toBeGreaterThan(0);
  });

  it('cancels active transcription on request', async () => {
    voskService.init({
      getPath: () => 'D:\\apps\\Sibcut Video Editor\\data',
    });
    const models = voskService.listInstalledModels();
    const model = models[0];

    // 10s of audio
    const dummyAudio = Buffer.alloc(16000 * 20);

    const promise = voskService.transcribeAudio(model.path, dummyAudio, 16000);
    // Cancel immediately after starting
    setTimeout(() => {
      voskService.cancelTranscription();
    }, 50);

    await expect(promise).rejects.toThrow();
  });
});
