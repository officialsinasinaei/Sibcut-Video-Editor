# 0001. Packaging Isolation and Persistent Portable Startup

## Context
The portable distribution `Sibcut-Video-Editor-Portable.exe` suffered from 10–25 second launch delays on Windows because the self-extracting NSIS wrapper was unpacking a bloated 910 MB payload into a randomized `%TEMP%` directory on every launch. Furthermore, over 25 web-only dependencies were declared under `dependencies` rather than `devDependencies`, causing `electron-builder` to bundle redundant `node_modules` into `app.asar` (which swelled to 551 MB). Synchronous native DLL initialization in the Electron main process further blocked initial window paint.

## Decision
1. **Persistent Portable Unpack Directory (`unpackDirName`)**: Set `portable.unpackDirName` to `SibcutVideoEditor` and configure `portable.splashImage` with a branded bitmap. This transforms every launch after the first into an instant Warm Launch (<1 second).
2. **Production Bundle Isolation**: Move all Vite-bundled web packages (`@fontsource/*`, `onnxruntime-web`, `@mediapipe/tasks-vision`, `lucide`, `mediabunny`, and font packages) to `devDependencies`. Only native/Electron main runtime dependencies (`koffi`, `yauzl`) remain in `dependencies`.
3. **Deferred Native Initialization**: Defer `voskService.init(app)` until after the browser window is shown, keeping first paint completely unblocked.
4. **WASM & Asset Deduplication**: Prune duplicate WASM runtime binaries from `public/assets/` to ensure single-copy packaging.
5. **Single Instance Guard**: Enforce `app.requestSingleInstanceLock()` to prevent concurrent process collisions against the persistent unpack directory.

## Consequences
- Warm launch of `Sibcut-Video-Editor-Portable.exe` drops from 10–25s to under 1 second.
- `app.asar` shrinks by ~500 MB across all distribution targets (Installer, Portable, AppImage, DMG).
- First paint latency is reduced across all platforms because native DLL loading is moved off the critical startup path.
