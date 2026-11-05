# Issue 01: Cross-Platform Native Vosk Speech Engine

Status: resolved
Type: task

## Description
Implement the build-time native Vosk hydration tool with SHA-256 verification, platform-agnostic library resolution in `vosk-service.cjs` and `vosk-worker.cjs`, per-platform packaging isolation in `package.json`, and CI smoke test verification across Windows, macOS, and Linux.

## Tasks
- [x] 1. Create `tools/fetch-native-vosk.mjs` with cache-first verification, downloading and extracting `libvosk.dylib` (macOS universal2) and `libvosk.so` (Linux x64).
- [x] 2. Refactor `vosk-service.cjs` and `vosk-worker.cjs` to resolve native libraries across `win32`, `darwin`, and `linux` without Windows-only API calls on Unix.
- [x] 3. Update `package.json` with per-platform native binary packaging isolation and `fetch:vosk` npm script.
- [x] 4. Update `electron-main.cjs` `--smoke-test` to verify native Vosk engine initialization on the host runner.
- [x] 5. Update `.github/workflows/ci.yml` and `.github/workflows/release.yml` with the hydration step.
- [x] 6. Write unit tests for the hydration script and cross-platform loader, and verify all test suites pass.
