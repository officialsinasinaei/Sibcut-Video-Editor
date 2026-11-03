# Contributing to Sibcut Video Editor

Thank you for your interest in contributing to **Sibcut Video Editor**! We welcome community contributions to make Sibcut the best offline, cross-platform video editing tool for creators worldwide.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat everyone with respect and empathy.

---

## Prerequisites

Before setting up Sibcut Video Editor locally, ensure you have:

- **Node.js**: `v22.12.0` or later
- **npm**: `v10` or later
- **Git**: Latest version
- **Platform Build Tools**:
  - **Windows**: Visual C++ Build Tools (if compiling native modules)
  - **Linux**: `build-essential`, `libasound2-dev`
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/officialsinasinaei/Sibcut-Video-Editor.git
cd Sibcut-Video-Editor
```

### 2. Install Dependencies

Install all dependencies strictly using the lockfile:

```bash
npm ci
```

### 3. Run in Development Mode

To start the Vite dev server and launch the desktop Electron application:

```bash
npm run electron:dev
```

Alternatively, to run the web interface in a browser (some desktop-only features like native Vosk and local filesystem IPC will run with browser fallbacks):

```bash
npm run dev
```

---

## Running Tests & Checks

Before submitting any code, verify that all license checks and automated tests pass:

```bash
# Verify open-source licenses of all runtime packages
npm run check:licenses

# Run the automated test suite with Vitest
npm test
```

---

## Building Locally

To test local packaging on your operating system:

### Windows
```bash
# Build both NSIS Setup and Portable executables
npm run electron:pack

# Build only the Portable executable
npm run electron:pack:portable

# Build only the NSIS Setup installer
npm run electron:pack:installer
```
Outputs will be placed in the `release/` directory.

### macOS
```bash
npm run electron:pack:mac
```

### Linux
```bash
npm run electron:pack:linux
```

---

## Coding Conventions

- **Language & Standards**: Modern JavaScript (ES Modules for web, CommonJS `.cjs` where required by Electron main process).
- **Naming & Branding**:
  - The official name is **Sibcut Video Editor** (exact casing). Never use "SibCut", "Sibcut Editor", or "Sibcut Video".
  - Do not modify, crop, or distort the approved mascot and logo assets in `assets/branding/`.
- **Privacy & Offline First**:
  - All projects, media, caches, and exports must remain strictly on the user's local machine. Do not introduce remote cloud telemetry or mandatory remote accounts.
- **Backwards Compatibility**:
  - Existing user projects (`.vsproj`) and project storage must load without corruption or breaking changes.
- **Formatting**:
  - 2-space indentation, UTF-8 charset, LF line endings, no trailing whitespace (enforced via `.editorconfig`).

---

## Release & Deployment Guide

For the complete runbook on tagging, pushing, large-binary network configuration, and GitHub Actions release builds, see [**RELEASE-AND-GIT-WORKFLOW.md**](./RELEASE-AND-GIT-WORKFLOW.md).

---

## Pull Request Guidelines

1. **Create a Topic Branch**:
   ```bash
   git checkout -b feature/my-new-feature
   ```
2. **Commit Messages**:
   Use clear, conventional commit messages:
   - `feat: add audio ducking controls to inspector`
   - `fix: resolve frame drift on 60fps clip export`
   - `docs: update Linux AppImage installation instructions`
3. **Verify Locally**:
   Run `npm run check:licenses` and `npm test` before pushing.
4. **Submit PR**:
   Open a pull request against the `main` branch of `officialsinasinaei/Sibcut-Video-Editor`. Describe the change, mention any related issues, and include test steps.
