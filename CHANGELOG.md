# Changelog

All notable changes to **Sibcut Video Editor** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
