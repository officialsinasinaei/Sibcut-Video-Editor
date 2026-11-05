<div align="center">

<img src="./assets/branding/master/app-icon-master.png" alt="Sibcut Video Editor" width="140" height="140" />

# Sibcut Video Editor

**A professional, multi-track, offline-first desktop video editor.**  
Crafted with taste, precision, and privacy — ready for you to create right away.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Platform: Windows | macOS | Linux](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#supported-platforms)
[![GitHub release](https://img.shields.io/github/v/release/officialsinasinaei/Sibcut-Video-Editor?include_prereleases&style=flat-square)](https://github.com/officialsinasinaei/Sibcut-Video-Editor/releases)

[Features](#key-features) • [Downloads](#downloads) • [Installation](#installation-instructions) • [Development](#development-setup) • [Attribution & Licenses](#attribution--licensing)

</div>

---

## Overview

**Sibcut Video Editor** is an open-source, non-linear video editing application running natively on your desktop. It provides full-featured timeline editing, multi-track audio/video composition, keyframing, offline AI speech-to-text captions, background removal, visual effects, and full Right-to-Left (Persian/Arabic) typography support.

Sibcut is designed with an **offline-first and privacy-focused architecture**: all your video footage, audio recordings, project files, and generated media remain strictly on your local computer. No cloud subscription, mandatory online accounts, or remote data processing required.

---

## Key Features

- **Multi-Track Non-Linear Editing**:
  - Independent, layered video, audio, image, text, and effect tracks.
  - Frame-accurate trimming, splitting, ripple deletion, and magnetic snapping.
  - Video transform controls: position, scale, rotation, opacity, and blend modes.

- **Keyframe Automation & Easing Curves**:
  - Automate motion, opacity, scale, rotation, and effect sliders over time.
  - Interactive curve lanes with smooth bezier easing curves.

- **Offline Automatic Captions & Speech-to-Text**:
  - Built-in speech recognition powered by the offline Vosk speech engine.
  - In-app model manager to download, import, and switch language models.
  - Automatic subtitle alignment and customizable caption typography.

- **First-Class Persian / Arabic (RTL) Typography**:
  - Bi-directional text shaping engine with zero reversed or disconnected characters.
  - 10 bundled Persian and Arabic display fonts (Vazirmatn, Estedad, Lalezar, Gandom, Sahel, Samim, Shabnam, Parastoo, Tanha, Amiri).

- **Offline Background Matting & Removal**:
  - Green-screen-free AI background isolation powered by client-side WebAssembly SIMD ONNX models (`MobileNetV3`).

- **Color Grading, Filters & Transitions**:
  - Over 50 transitions (3D, zoom, slide, glitch, light leaks, blurs).
  - Cinematic LUT color filters, split toning, and vintage film emulations.

- **Audio Processing & Mixing**:
  - Multi-band equalizer, dynamic compressor, noise gate, and reverb.
  - High-precision waveform display, volume keyframing, and audio speed ramps.

- **Extensions & Developer SDK**:
  - Extensible UI module system supporting HTML/CSS/JS kinetic typography, animated lower-thirds, and custom graphics via `extension-sdk.js`.

- **Pure Local Storage**:
  - Native `.vsproj` project management saved directly on your disk.

---

## Supported Platforms

| Operating System | Architecture | Supported Formats |
|---|---|---|
| **Windows** | x64 | NSIS Setup (`.exe`), Standalone Portable (`.exe`) |
| **macOS** | Apple Silicon (`arm64`), Intel (`x64`) | Disk Image (`.dmg`), Archive (`.zip`) |
| **Linux** | x64 | AppImage (`.AppImage`), Debian / Ubuntu (`.deb`) |

---

## Downloads

Download the latest official build for your platform from the Releases page:

👉 **[Download Sibcut Video Editor (Latest Release)](https://github.com/officialsinasinaei/Sibcut-Video-Editor/releases/latest)**

*If a release has not yet been published or is currently compiling, downloadable binaries will appear on the [Releases page](https://github.com/officialsinasinaei/Sibcut-Video-Editor/releases) upon tag publication.*

---

## Installation Instructions

### Windows

#### Option A: Recommended Installer (`Sibcut-Video-Editor-Setup.exe`)
1. Download `Sibcut-Video-Editor-Setup.exe`.
2. Double-click to launch the installer.
3. Follow the setup wizard to choose your install folder and create Start Menu/Desktop shortcuts.
4. Launch **Sibcut Video Editor** from your Start Menu or Desktop.

> **Note on Windows SmartScreen**: As an independent open-source project without a costly enterprise EV code-signing certificate, Windows SmartScreen may show an "Unknown Publisher" prompt on initial launch. Click **More info** → **Run anyway** to start.

#### Option B: Standalone Portable (`Sibcut-Video-Editor-Portable.exe`)
1. Download `Sibcut-Video-Editor-Portable.exe`.
2. Place it in any folder (or on a USB flash drive).
3. Double-click to run immediately without installation.
4. Portable settings and local projects are saved alongside the executable in a `data/` folder.

---

### macOS

#### Disk Image (`Sibcut-Video-Editor-macOS-arm64.dmg` / `x64.dmg`)
1. Download the `.dmg` file matching your Mac's processor:
   - **Apple Silicon (M1/M2/M3/M4)**: `Sibcut-Video-Editor-macOS-arm64.dmg`
   - **Intel**: `Sibcut-Video-Editor-macOS-x64.dmg`
2. Open the `.dmg` file.
3. Drag **Sibcut Video Editor** into your **Applications** folder.
4. Open the application from Launchpad or Finder.

> **macOS Gatekeeper First-Launch Note (Open-Source Build)**:  
> Because community builds are not notarized through an Apple Developer ID (\$99/yr), modern macOS Gatekeeper may show a prompt saying *"Sibcut Video Editor is damaged and can't be opened. You should move it to the Bin."*  
> This is Apple's quarantine flag on files downloaded from web browsers, not actual damage. To open the app:
> 1. Open **Terminal** on your Mac.
> 2. Run:
>    ```bash
>    xattr -cr "/Applications/Sibcut Video Editor.app"
>    ```
> 3. Alternatively, you can go to **System Settings** → **Privacy & Security** and click **Open Anyway**.

---

### Linux

#### Option A: AppImage (`Sibcut-Video-Editor-Linux-x64.AppImage`)
The AppImage requires no installation and runs on most modern Linux distributions (Ubuntu, Debian, Fedora, Arch, Linux Mint, etc.):
```bash
# Make the file executable
chmod +x Sibcut-Video-Editor-Linux-x64.AppImage

# Launch the editor
./Sibcut-Video-Editor-Linux-x64.AppImage
```

#### Option B: Debian / Ubuntu Package (`Sibcut-Video-Editor-Linux-x64.deb`)
```bash
sudo dpkg -i Sibcut-Video-Editor-Linux-x64.deb
sudo apt-get install -f # Fix any missing system dependencies if prompted
```

---

## Verifying Downloads (Checksums)

Every official release includes a verified `SHA256SUMS.txt` file. You can verify the integrity of your downloaded files:

**Windows (PowerShell):**
```powershell
Get-FileHash -Algorithm SHA256 .\Sibcut-Video-Editor-Setup.exe
```

**macOS / Linux:**
```bash
sha256sum Sibcut-Video-Editor-Linux-x64.AppImage
# Or verify against the release checksum file:
sha256sum --check SHA256SUMS.txt
```

---

## Development Setup

To build and run Sibcut Video Editor from source:

### Prerequisites
- [Node.js](https://nodejs.org/) `>= 22.12.0`
- [npm](https://www.npmjs.com/) `>= 10.0.0`
- [Git](https://git-scm.com/)

### Clone and Install
```bash
git clone https://github.com/officialsinasinaei/Sibcut-Video-Editor.git
cd Sibcut-Video-Editor
npm ci
```

### Run Locally in Development Mode
```bash
# Start Vite and Electron simultaneously
npm run electron:dev
```

### Build Desktop Packages Locally
```bash
# Windows
npm run electron:pack:installer  # NSIS installer
npm run electron:pack:portable   # Standalone portable

# macOS
npm run electron:pack:mac

# Linux
npm run electron:pack:linux
```

All compiled packages will be placed in the `release/` directory.

### Running Tests
```bash
# Verify open-source license compliance across dependencies
npm run check:licenses

# Run unit and integration tests
npm test
```

---

## Technology Stack

- **Application Shell**: [Electron](https://www.electronjs.org/) (Node.js runtime + Chromium)
- **Frontend & Bundling**: [Vite](https://vitejs.dev/) with vanilla ES modules
- **Media Decoding & Demuxing**: [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) & [mediabunny](https://github.com)
- **Neural Networks & Matting**: [ONNX Runtime Web](https://onnxruntime.ai/) with WASM SIMD acceleration & MediaPipe
- **Speech Recognition Engine**: [Vosk API](https://alphacephei.com/vosk/) via [koffi](https://koffi.dev/) fast C FFI
- **Typography & Font Shaping**: HarfBuzz / OpenType bidirectional shaping engines

---

## Attribution & Licensing

### Upstream Project Attribution
**Sibcut Video Editor** is based on the open-source **Everything** project created by **HeyPuter**:
- **Upstream Repository**: [https://github.com/HeyPuter/everything](https://github.com/HeyPuter/everything)
- **Upstream License**: [MIT License](https://github.com/HeyPuter/everything/blob/main/LICENSE)

*Sibcut Video Editor is an independent project and is not affiliated with, sponsored by, or endorsed by HeyPuter.*

### Application License
Sibcut Video Editor is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.  
See the [`LICENSE`](./LICENSE) file for the complete license terms.

### Third-Party Licenses
Full third-party license notices, copyright texts, and font acknowledgements are detailed in [`THIRD-PARTY-LICENSES.md`](./THIRD-PARTY-LICENSES.md) and [`OPEN-SOURCE-NOTICES.md`](./OPEN-SOURCE-NOTICES.md).

---

## Creator & Community

- **Creator & Maintainer**: **Sina Sinaei**
- **Contact Email**: [sina9100t@gmail.com](mailto:sina9100t@gmail.com)
- **Repository**: [https://github.com/officialsinasinaei/Sibcut-Video-Editor](https://github.com/officialsinasinaei/Sibcut-Video-Editor)
- **Issue Tracker**: [https://github.com/officialsinasinaei/Sibcut-Video-Editor/issues](https://github.com/officialsinasinaei/Sibcut-Video-Editor/issues)
- **Contributing**: Please review [`CONTRIBUTING.md`](./CONTRIBUTING.md) before submitting pull requests.
- **Release Runbook & Git Workflow**: Maintainers and agents should follow [`RELEASE-AND-GIT-WORKFLOW.md`](./RELEASE-AND-GIT-WORKFLOW.md).
- **Security Vulnerabilities**: Please review [`SECURITY.md`](./SECURITY.md) to report security concerns responsibly.
