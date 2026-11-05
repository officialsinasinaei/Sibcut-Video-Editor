# Specification: Cross-Platform Release Verification and macOS Quarantine

## Objective
Establish an enterprise-grade automated release verification pipeline, resolve macOS Gatekeeper quarantine UX for end users, provide dual-architecture macOS packages (Apple Silicon and Intel), and guard platform-specific native capabilities (Vosk offline speech recognition) against runtime crashes on non-Windows platforms.

## Requirements
1. **Deterministic `--smoke-test` Target in `electron-main.cjs`**:
   - Parse `process.argv` for `--smoke-test`.
   - When set, execute the entire startup sequence (single-instance lock, localhost HTTP server binding, IPC setup, window creation).
   - Listen for `ready-to-show` and wait for initial paint.
   - Output `[SMOKE-TEST] App launched successfully, exiting with code 0` and call `app.exit(0)` after 2000ms.
   - Attach global error handlers (`uncaughtException`, `unhandledRejection`) that log the error and terminate via `app.exit(1)` immediately.
2. **Native Capability Guard in `vosk-service.cjs`**:
   - Explicitly detect `process.platform !== 'win32'`.
   - If running on non-Windows platforms and native libraries are missing, cleanly set `isSupported = false`, log a friendly informational message, and return false without attempting Windows-specific `kernel32.dll` / `SetDllDirectoryA` or MinGW DLL loads.
   - Ensure `isNativeSupported()` returns false cleanly so IPC calls can report capability status without crashing.
3. **UI Informative State on Non-Windows**:
   - In the captions / transcription modal (`src/ui/captions/`), query `window.electronAPI.voskIsSupported()` or platform check.
   - If not supported on the host platform, display an informative banner/notice: *"Offline AI speech-to-text is currently supported on Windows. macOS and Linux support is coming in a future update."*
   - Ensure the user can still edit existing subtitle tracks, import SRT files, stylize captions, and perform all other editing tasks without hindrance.
4. **Dual macOS Architecture Packaging in `package.json`**:
   - Configure `package.json` under `build.mac`:
     - Hardened runtime enabled (`hardenedRuntime: true`).
     - Gatekeeper / notarization options configured.
     - Targets: `dmg` and `zip` for both `arm64` and `x64`.
     - Target artifact naming: `Sibcut-Video-Editor-macOS-${arch}.${ext}`.
5. **Automated CI Matrix & Smoke Test in `.github/workflows/release.yml`**:
   - Split macOS builds into `build-macos-arm64` and `build-macos-x64`.
   - On `macos-latest` runner, execute an automated smoke test:
     - Mount the generated `.dmg` with `hdiutil attach`.
     - Launch the packaged `.app` with `--smoke-test --no-sandbox`.
     - Verify exit code 0.
     - Unmount with `hdiutil detach`.
   - On `ubuntu-latest` (Linux runner), launch the AppImage with `xvfb-run --auto-servernum ./release/*.AppImage --smoke-test --no-sandbox`.
   - On `windows-latest`, launch the unpacked or portable binary with `--smoke-test`.
   - Enforce strict 2-stage publish gate: `publish` requires `[build-windows, build-macos-arm64, build-macos-x64, build-linux]`.
6. **Documentation & Release Notes**:
   - Update `RELEASE-AND-GIT-WORKFLOW.md` with:
     - The macOS Gatekeeper quarantine explanation and `xattr -cr` command.
     - Download table with architecture badges (`arm64` Apple Silicon vs `x64` Intel).
     - Smoke test verification runbook.
   - Update the GitHub release description template in `release.yml` with the one-line Mac install command.
