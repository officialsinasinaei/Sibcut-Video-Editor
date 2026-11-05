# Specification: Cross-Platform Native Vosk Speech Engine

## Objective
Enable offline Vosk speech recognition captions on macOS (Apple Silicon arm64 & Intel x64) and Linux (x64) with full functional parity to Windows, implementing build-time cryptographic asset hydration, per-platform package isolation, and automated CI smoke test verification.

## Requirements
1. **Hydration Script `tools/fetch-native-vosk.mjs`**:
   - Downloads official precompiled releases from Alphacephei:
     - macOS universal2: `vosk-osx-0.3.42.zip` -> extracts `libvosk.dylib` to `native/darwin/libvosk.dylib`.
     - Linux x64: `vosk-linux-x86_64-0.3.45.zip` -> extracts `libvosk.so` to `native/linux-x64/libvosk.so`.
   - Validates on-disk files first against cryptographic SHA-256 hashes: if valid, skip downloading.
   - Supports CLI flags: `--platform=<win32|darwin|linux|all>` (default: current platform or all if requested).
   - Wire into `package.json` prebuild / build scripts (`npm run fetch:vosk`).
2. **Platform-Agnostic Library Resolution**:
   - In `vosk-service.cjs` and `vosk-worker.cjs`:
     - Detect platform:
       - `win32`: look for `libvosk.dll` in `native/win-x86_64`.
       - `darwin`: look for `libvosk.dylib` in `native/darwin`.
       - `linux`: look for `libvosk.so` in `native/linux-x64`.
     - Defer/omit Windows `kernel32.dll` and `SetDllDirectoryA` calls on Unix.
     - Mirror dynamic libraries to persistent `userData/vosk-native` if applicable.
     - `isPlatformSupported()` and `isNativeSupported()` return true on `darwin` and `linux` when `libvosk` is present.
3. **Packaging Isolation**:
   - In `package.json`:
     - `win.extraFiles`: include only `native/win-x86_64/**`.
     - `mac.extraFiles`: include only `native/darwin/**`.
     - `linux.extraFiles`: include only `native/linux-x64/**`.
     - Exclude foreign platform native binaries from the global `build.files` array.
4. **CI & Smoke-Test Integration**:
   - In `electron-main.cjs`:
     - In `--smoke-test`, verify `lazyVoskService.isNativeSupported()`. If native libraries are present on the host runner, assert native initialization succeeds and log `[SMOKE-TEST] Native speech recognition engine verified for platform: <platform>`.
   - In `.github/workflows/ci.yml` and `release.yml`:
     - Execute `node tools/fetch-native-vosk.mjs` on macOS and Linux runners prior to packaging and testing.
5. **Testing**:
   - Unit tests for `tools/fetch-native-vosk.mjs` and platform library resolution in `vosk-service.test.js`.
