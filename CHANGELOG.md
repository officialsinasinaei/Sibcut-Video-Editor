# Changelog

All notable changes to **Sibcut Video Editor** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
