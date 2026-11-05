# 0005. Cross-Platform Native Speech Engine Hydration

## Context
Sibcut Video Editor provides offline AI speech-to-text via the native Vosk C library and Koffi FFI. While Windows was fully supported with precompiled DLLs in `native/win-x86_64`, macOS and Linux lacked native Vosk binaries. 

Directly committing precompiled `libvosk.dylib` (macOS universal2) and `libvosk.so` (Linux x64) to the Git repository would inject an additional ~80 MB of binary weight into Git history, exacerbating Git push timeouts and slowing repository clones on bandwidth-constrained connections. Furthermore, on macOS, Hardened Runtime requires dynamic library validation exceptions and code signing to load third-party FFI libraries without terminating the process with `SIGKILL`. Packaging all platform libraries into every installer also introduces ~20 MB of redundant cross-platform bloat.

## Decision
1. **Build-Time Native Vosk Hydration**:
   - Introduce `tools/fetch-native-vosk.mjs` to fetch official precompiled Vosk release binaries from Alphacephei (`vosk-osx-0.3.42.zip` containing universal2 `libvosk.dylib` and `vosk-linux-x86_64-0.3.45.zip` containing `libvosk.so`).
   - Implement local cache-first verification: compute SHA-256 hashes of on-disk binaries in `native/<platform>/` and immediately bypass network requests when valid binaries exist.
2. **Platform-Agnostic Library Resolution**:
   - Refactor `vosk-service.cjs` and `vosk-worker.cjs` to dynamically resolve canonical library paths by platform:
     - `win32`: `native/win-x86_64/libvosk.dll` (with MinGW helper DLLs).
     - `darwin`: `native/darwin/libvosk.dylib` (universal2 supporting Apple Silicon arm64 & Intel x64).
     - `linux`: `native/linux-x64/libvosk.so`.
   - Eliminate Windows-specific `kernel32.dll` and `SetDllDirectoryA` calls on Unix systems.
3. **Packaging Isolation & Hardened Runtime**:
   - Filter `package.json` distribution targets so Windows installers only package `win-x86_64`, macOS packages only bundle `darwin`, and Linux packages only bundle `linux-x64`.
   - Maintain `com.apple.security.cs.disable-library-validation: true` in `build/entitlements.mac.plist` and `asarUnpack: ["**/native/**"]` in `package.json`.
4. **Automated CI Native Engine Smoke Testing**:
   - Wire `node tools/fetch-native-vosk.mjs` into `npm run build:electron` and GitHub Actions workflows (`ci.yml` and `release.yml`).
   - Extend the `--smoke-test` target in `electron-main.cjs` to assert successful native library initialization (`isNativeSupported() === true`) on real Windows, macOS, and Linux runners prior to publishing.

## Consequences
- Offline speech-to-text captions work with 100% feature parity across Windows, macOS (M1–M4 and Intel), and Linux.
- The Git repository avoids ~80 MB of binary history bloat while builds remain self-hydrating and reproducible.
- Each platform's distribution artifact stays lean by omitting foreign operating system binaries.
- Automated CI testing guarantees native FFI engine viability across all three platforms before any release is published.
