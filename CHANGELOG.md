# Changelog

All notable changes to **Sibcut Video Editor** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.5] - 2026-11-10

### Added & Improved
- **Pixel-Perfect Video Background Removal (Matting) Overhaul**:
  - **5×5 Guided Matte Refinement & Continuous Sub-Pixel Alpha**: Replaced binary step thresholding with an edge-preserving joint bilateral guided filter in `LAYER_FS` that upsamples the `512×288` RobustVideoMatting (RVM) matte against full-resolution `1080p`/`4K` video frames, preserving fine hair strands without staircase aliasing or dark bites in bright hair highlights.
  - **Neural Foreground Decontamination (`fgr`)**: Unpremultiplied RVM foreground RGB (`fgr`) and alpha (`pha`) are now packed directly into `RGBA8` WebGL2 textures (`e.rgba`) without 2D canvas premultiplication loss, combined with inward/outward gradient unmixing and a **Foreground decontamination** inspector slider (`decontaminate`, default `90`) to eliminate white halos and colored background bleed (`-92.7%` halo reduction across full video).
  - **Off-Main-Thread Web Worker Inference (`segmenter-worker.js`)**: Moved ONNX Runtime Web WASM SIMD inference and recurrent state (`r1..r4`) into a dedicated Web Worker with zero-copy `ArrayBuffer` transfers, keeping live preview compositing non-blocking (`~4 ms` main-thread render time) and expanding `MatteCache.frameHistory` to 150 frames (`0.015 ms` cache hits on scrub and loop).
  - **Live Playback Frame-to-Matte Synchronization**: Captures a matched full-resolution source frame snapshot (`e.sourceSnap`) alongside each inferred matte so live playback never renders a newer video frame against a stale matte, eliminating white-wall ghost cutouts during fast motion.
  - **Automatic Scene-Cut Reset**: Computes subsampled frame luma delta during planar RGB packing (`packRgbPlanes`) and automatically resets RVM recurrent state (`r1..r4`) and temporal smoothing across hard scene cuts within a single clip.

### Fixed
- **ONNX Runtime Web Dynamic Import Path in Packaged Builds**: Fixed `TypeError: Failed to fetch dynamically imported module: .../assets/ort-wasm-simd-threaded.jsep.mjs` by resolving `ort.env.wasm.wasmPaths` against `new URL('./', location.href).href` in both main thread and worker contexts.
- **Selective Color Grading Isolation**: Prevented `u_fgDecontaminate` from trimming the person mask when `colorTarget` is active without `cutout`.

### Documented
- Recorded Architecture Decision Record `docs/adr/0006-video-matting-pipeline-and-foreground-decontamination.md` and updated `GLOSSARY.md` with **Foreground Decontamination** and **Guided Matte Refinement**.

## [1.0.4] - 2026-11-05
### Added
- **Cross-Platform Native Vosk Speech Recognition Hydration**:
  - Offline speech-to-text and caption generation now runs natively on macOS (Apple Silicon arm64 and Intel x64), Linux (x86_64), and Windows (x86_64).
  - Added build-time native hydration script (tools/fetch-native-vosk.mjs) with SHA-256 integrity validation and local caching, preventing Git repository binary bloat while maintaining full release automation.
  - Implemented per-platform packaging isolation in package.json to ensure each OS distribution only bundles its own native runtime (.dylib for macOS, .so for Linux, .dll for Windows).
  - Cross-platform dynamic library discovery and Worker thread communication in vosk-service.cjs and vosk-worker.cjs.
- **macOS Gatekeeper Compliance & Hardened Runtime**:
  - Added Hardened Runtime entitlements (build/entitlements.mac.plist) with JIT and unsigned executable memory permissions to comply with macOS Gatekeeper.
  - Configured separate Apple Silicon (arm64) and Intel (x64) release packaging targets.
- **Automated Cross-Platform Smoke Testing & Release Gates**:
  - Introduced deterministic headless --smoke-test in electron-main.cjs verifying window rendering, IPC servers, and native speech recognition engine initialization.
  - Hardened GitHub Actions CI and Release pipelines to run smoke tests on real virtual runners before any release artifacts can be published.

### Documented
- Recorded Architecture Decision Records ADR-0004 (Cross-Platform Release Verification & macOS Quarantine) and ADR-0005 (Cross-Platform Native Speech Engine Hydration).
- Updated repository runbook RELEASE-AND-GIT-WORKFLOW.md and domain glossary GLOSSARY.md.

## [1.0.3] - 2026-11-04

### Added
- **Playhead Edge Auto-Scroll**: Implemented smooth, progressive auto-scrolling when scrubbing or dragging the playhead, time ruler, or chapter markers against the visible timeline viewport edges.
  - Continuous per-tick time updates allow users to scrub forward or backward across multi-minute timelines without needing manual scrollbar manipulation.
  - Progressive velocity acceleration scales dynamically from 8px/tick (precision positioning) to 36px/tick (fast navigation) based on pointer penetration depth over a 36px threshold zone.
  - Strict boundary clamping guards the start at `00:00:00:00` and stops cleanly at timeline extent without overshoot or scrolling on non-overflowing viewports.
  - Comprehensive safety teardown handles `pointerup`, `pointercancel`, and window `blur` events across playhead scrubbing, marker dragging, clip dragging, and edge trimming.

## [1.0.2] - 2026-11-04

### Changed & Performance Improvements
- **Portable Launch & Package Optimization**: Configured persistent unpack caching (`unpackDirName: "SibcutVideoEditor"`) and Deflate archive extraction (`useZip: true`), slashing portable warm launch times from 10–25s to <1s.
- **Cold Launch Splash Screen**: Added a 480×280 24-bit dark branded splash screen (`build/splash.bmp`) for instant visual feedback during cold launch decompression.
- **Production Bundle Isolation**: Segregated 25+ web dependencies into `devDependencies`, eliminating raw `node_modules` duplicates from `app.asar` and shrinking the ASAR payload from 551 MB down to ~170 MB.
- **Deferred Native FFI Initialization**: Deferred native Vosk C-library FFI loading to 1.5s post-window presentation via dynamic Proxy adapter, unblocking first paint by 200–500ms.
- **Single-Instance Guard**: Enforced `app.requestSingleInstanceLock()` with synchronous exit to prevent concurrent process collisions in portable unpack directories.
- **Model Asset Deduplication**: Deduplicated ONNX background matting model (`rvm_mobilenetv3.onnx`), eliminating duplicate 15 MB payload in `dist/` and `app.asar`.
- **Repository Hygiene**: Pruned 91 MB of duplicate WASM runtimes from `public/assets/`, removed loose root icons, and isolated Electron packaging from design comparison previews.
- **Packaging Guardrails & CI**: Introduced `tools/check-packaging.mjs` with automated unit tests to enforce bundle isolation and a 200 MB ASAR budget ceiling on every build.

## [1.0.1] - 2026-11-03

### Fixed
- **Vosk Speech Recognition Worker Offloading**: Offloaded CPU-heavy Kaldi C/C++ speech recognition decoding from the Electron main process thread into a dedicated background `worker_threads` Worker (`vosk-worker.cjs`). Eliminates Windows "(Not Responding)" ghost windows, application freezing, and whiteout crashes when transcribing with large language models (such as `vosk-model-en-us-0.22-lgraph`).
- **Captions UI Auto-Scroll & Viewport Visibility**: Fixed an issue where the caption generation progress indicator expanded below the fold at the bottom of the captions panel without scrolling into view. The panel now smoothly auto-scrolls into view (`scrollIntoView`) on start and across each step change.
- **Live Progress & Cancellation Support**: Enhanced caption generation progress bar with live step percentages `(1%..99%)`, overall completion percentage readout, and an active interactive Cancel button wired to abort background worker transcription instantly.
- **Model Path & Junction Discovery**: Enhanced offline model scanning to properly detect Windows directory junctions and symlinks across multiple drive locations.

## [1.0.0] - 2026-11-01

### Overview
Initial public release of **Sibcut Video Editor**, a modern, multi-track, offline-first desktop video editor built with Electron, WebCodecs, WebAssembly, and native offline intelligence.

### Added
- **Multi-Track Timeline**: Complete non-linear editing timeline supporting video, audio, text, images, adjustment layers, and effects.
- **Precision Trimming & Splitting**: Frame-accurate blade/split tool, slip/slide edits, ripple delete, and snap-to-grid/clip magnetic snapping.
- **Keyframe Automation**: Keyframeable curve lanes for motion, opacity, scale, rotation, and effect parameters with bezier easing curves.
- **Offline Speech-to-Text & Automatic Captions**: Integrated Vosk speech recognition engine with in-app model manager for offline automatic subtitle/caption generation.
- **Persian / Farsi & RTL Typography**: First-class Right-to-Left (RTL) text shaping with 10 bundled Persian/Arabic fonts, custom font styling, and bidirectional animation.
- **Background Removal / Matting**: Robust offline AI green-screen-free background segmentation powered by WebAssembly SIMD ONNX MobileNetV3.
- **Visual Effects & Transitions**: Over 50 built-in transitions, cinematic LUT color filters, body effects, glitch, light leaks, and camera blurs.
- **Audio Processing & Mixing**: Multi-band EQ, compressor, noise gate, reverb, audio waveform generation, speed ramps, and pitch preservation.
- **Local Project Storage**: Fully private, local project storage with automatic thumbnail generation and backup. Zero cloud dependency.
- **Extensions Architecture**: Native Extensions system with SDK (`extension-sdk.js`) for custom HTML/CSS/JS overlays, lower thirds, and kinetic typography.
- **Professional About & Licenses Dialog**: In-app native modal crediting creator Sina Sinaei, upstream attribution to HeyPuter Everything, and full open-source license browser.
- **Multi-Platform Release Packaging**:
  - Windows: Setup installer (`Sibcut-Video-Editor-Setup.exe`) and standalone portable executable (`Sibcut-Video-Editor-Portable.exe`).
  - macOS: Apple Silicon (`arm64`) and Intel (`x64`) DMG packages and ZIP archives.
  - Linux: Standalone AppImage (`x64`) and Debian package (`.deb`).

### Platform & Architecture Availability
| Platform | Architecture | Distribution Formats | Status |
|---|---|---|---|
| **Windows** | x64 | NSIS Installer (`.exe`), Portable (`.exe`) | Supported & Verified |
| **macOS** | arm64, x64 | Drag-and-Drop Disk Image (`.dmg`), Archive (`.zip`) | Supported |
| **Linux** | x64 | Standalone AppImage (`.AppImage`), Debian Package (`.deb`) | Supported |

### Known Limitations
- Vosk speech recognition currently bundles native x64 Windows DLLs; speech recognition on Linux and macOS will require user-provided Vosk shared libraries or will operate with subtitle file imports.
- Code signing: Builds released via community GitHub Actions are currently unsigned. On Windows, SmartScreen may display an unknown publisher alert. On macOS, Gatekeeper prompt may require approving the app in System Settings.

### Upstream Attribution
Sibcut Video Editor is based upon the open-source **Everything** project created by **HeyPuter** ([https://github.com/HeyPuter/everything](https://github.com/HeyPuter/everything)), distributed under the MIT License.
