# 0004. Cross-Platform Release Verification and macOS Quarantine

## Context
When distributing desktop releases across multiple operating systems, developers maintaining the project on a single platform (e.g. Windows) lack local hardware to verify macOS and Linux packages. 

On macOS (Ventura 13+, Sonoma 14+, and Sequoia 15+), binaries downloaded through a web browser receive the `com.apple.quarantine` extended attribute. Without an Apple Developer ID Application certificate and an Apple Notarization ticket, Apple Gatekeeper refuses to execute the application and displays a misleading warning: *"Sibcut Video Editor is damaged and can't be opened. You should move it to the Bin."* Furthermore, packaging solely for Apple Silicon (`arm64`) prevents Intel Mac users from launching the application, and unhandled native Windows DLL lookups in `vosk-service.cjs` risk crashing native speech-to-text initialization on Unix platforms.

## Decision
1. **Hybrid Code-Signing Strategy**:
   - Default to hardened runtime and ad-hoc code signing in `electron-builder`.
   - Provide clear, prominent Gatekeeper clearance instructions (`xattr -cr "/Applications/Sibcut Video Editor.app"`) in GitHub Release notes, README, and distribution tables.
   - Wire GitHub Actions secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) into the macOS build environment so commercial Developer ID signing and Apple Notarization activate automatically whenever credentials are provided.
2. **Dual macOS Architecture Packaging**:
   - Build and publish discrete `Sibcut-Video-Editor-macOS-arm64.dmg` (Apple Silicon M1–M4) and `Sibcut-Video-Editor-macOS-x64.dmg` (Intel Macs) alongside matching `.zip` bundles, avoiding fat-binary native module merge conflicts and preserving lean ~110 MB downloads.
3. **Deterministic `--smoke-test` Target**:
   - Introduce a `--smoke-test` command-line switch in `electron-main.cjs`. When invoked, Electron boots the full internal HTTP server, loads application routes, registers IPC handlers, displays the window, logs `[SMOKE-TEST] App launched successfully, exiting with code 0`, and exits cleanly via `app.exit(0)` after 2 seconds. Any unhandled exception or lifecycle fault terminates the process with code 1.
4. **Automated CI macOS Virtual Test Bench**:
   - In GitHub Actions `.github/workflows/release.yml`, run a post-packaging smoke test on `macos-latest`: mount the generated DMG (`hdiutil attach`), execute the packaged `.app` binary with `--smoke-test --no-sandbox`, assert exit code 0, and unmount (`hdiutil detach`).
   - Run automated headless smoke tests on Linux (`xvfb-run`) and Windows before publication.
5. **Strict Release Gate**:
   - Make the `publish` job depend strictly on successful completion of all platform build and smoke-test jobs (`[build-windows, build-macos-arm64, build-macos-x64, build-linux]`), preventing broken or non-launching binaries from ever being published.
6. **Native Capability Guard**:
   - Guard `vosk-service.cjs` against non-Windows environments: skip Windows DLL preloading on macOS/Linux, report capability status cleanly over IPC, and display an informative badge in the UI without crashing the application.

## Consequences
- Windows-only developers can deploy cross-platform releases with guaranteed startup verification across macOS and Linux.
- Intel and Apple Silicon Mac users receive native, conflict-free binary packages.
- Mac users are provided with clear Gatekeeper quarantine instructions for open-source builds, while the release pipeline remains fully ready for Apple Developer ID credentials.
- Defective releases are prevented at the CI gate prior to publication.
