import { describe, it, expect } from 'vitest';

describe('Electron Smoke-Test Argument & Lifecycle Configuration', () => {
  it('detects --smoke-test flag in process argv or environment', () => {
    const isSmokeTestArg = (argv, env) =>
      argv.includes('--smoke-test') || env.ELECTRON_SMOKE_TEST === '1';

    expect(isSmokeTestArg(['electron', '.', '--smoke-test'], {})).toBe(true);
    expect(isSmokeTestArg(['electron', '.'], { ELECTRON_SMOKE_TEST: '1' })).toBe(true);
    expect(isSmokeTestArg(['electron', '.'], {})).toBe(false);
  });

  it('defines hardened runtime entitlements for macOS packaging', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '..');
    const plistPath = path.join(root, 'build', 'entitlements.mac.plist');

    expect(fs.existsSync(plistPath)).toBe(true);
    const content = fs.readFileSync(plistPath, 'utf8');
    expect(content).toContain('com.apple.security.cs.allow-jit');
    expect(content).toContain('com.apple.security.cs.allow-unsigned-executable-memory');
    expect(content).toContain('com.apple.security.network.client');
  });

  it('validates package.json mac packaging targets and entitlements configuration', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

    expect(pkg.build?.mac?.hardenedRuntime).toBe(true);
    expect(pkg.build?.mac?.entitlements).toBe('build/entitlements.mac.plist');
    expect(pkg.build?.mac?.entitlementsInherit).toBe('build/entitlements.mac.plist');
    expect(pkg.scripts['electron:pack:mac:arm64']).toBeDefined();
    expect(pkg.scripts['electron:pack:mac:x64']).toBeDefined();
  });

  it('validates release.yml workflow guards against empty code-signing secrets and FUSE requirements', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(import.meta.dirname, '..');
    const releaseYamlPath = path.join(root, '.github', 'workflows', 'release.yml');

    expect(fs.existsSync(releaseYamlPath)).toBe(true);
    const content = fs.readFileSync(releaseYamlPath, 'utf8');

    // macOS empty secret guard
    expect(content).toContain('unset CSC_LINK');
    expect(content).toContain('unset CSC_KEY_PASSWORD');
    expect(content).toContain('MOUNT_LINE=$(hdiutil attach "$DMG_PATH" -nobrowse | grep "/Volumes")');

    // Linux FUSE & AppImage extract guard
    expect(content).toContain('UNPACKED_BIN="release/linux-unpacked/Sibcut Video Editor"');
    expect(content).toContain('--appimage-extract');
    expect(content).toContain('libfuse2');
  });
});
