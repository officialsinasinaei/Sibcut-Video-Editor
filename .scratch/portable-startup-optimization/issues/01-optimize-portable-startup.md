# Issue 01: Optimize Portable Startup and Release Bundles

Status: resolved
Type: task

## Description
Eliminate the 10–25s loading bottleneck of `Sibcut-Video-Editor-Portable.exe` without altering layout or functional code by:
1. Configuring persistent unpack directory (`unpackDirName: "SibcutVideoEditor"`) and native splash screen.
2. Production Bundle Isolation: segregating web dependencies into `devDependencies` to prune ~366 MB from `app.asar`.
3. Deferring native Vosk FFI initialization to post-window presentation with on-demand fallback.
4. Implementing `app.requestSingleInstanceLock()` with synchronous exit.
5. Deduplicating WASM binaries from `public/assets/`.

## Resolution
Implemented in commit `bd931c6` and refined in follow-up. All automated tests pass and the portable package has been verified.
