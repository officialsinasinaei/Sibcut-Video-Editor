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
