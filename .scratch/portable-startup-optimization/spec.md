# Spec: Optimize Startup Speed for Sibcut Portable and Releases

## Problem
`Sibcut-Video-Editor-Portable.exe` suffered from 10–25 second launch times due to:
1. Decompressing a 910 MB payload into a randomized `%TEMP%` directory on every launch without caching.
2. An oversized `app.asar` (551 MB) packed with redundant `node_modules` from web-only dependencies placed in `"dependencies"`.
3. Duplicated 30 MB WASM binaries in `public/assets/`.
4. Lack of a visual splash bitmap during NSIS decompression.
5. Synchronous native C DLL loading (`voskService.init(app)`) during `app.whenReady()`.

## Non-Goals
- Modifying UI components, layouts, CSS styling, or functional video editing logic.

## Implementation Steps
1. **Dependency Segregation**: Move web-only packages from `dependencies` to `devDependencies` in `package.json`, keeping only `koffi` and `yauzl` as runtime dependencies.
2. **Asset Deduplication**: Remove duplicated `ort-wasm-simd-threaded.*` files from `public/assets/`.
3. **Build & Portable Configuration**:
   - Set `portable.unpackDirName` to `SibcutVideoEditor`.
   - Set `portable.useZip` to `true`.
   - Set `build.compression` to `"normal"`.
   - Configure `portable.splashImage` to `build/splash.bmp`.
   - Refine `build.files` to include only distribution runtime assets.
   - Add `electron:pack:portable:zip` convenience script.
4. **Splash Screen Generation**:
   - Create `build/splash.bmp` (480x280 dark theme `#121214` bitmap with app icon).
5. **Main Process Startup Optimization**:
   - Implement `app.requestSingleInstanceLock()`.
   - Defer `voskService.init(app)` to post-window presentation (1.5s idle timer) with on-demand fallback.
6. **Verification & Testing**:
   - Run tests (`npm test`).
   - Pack the portable build and measure `app.asar` and extraction size.
