<!--
================================================================================
AGENT SKILL & RUNBOOK: GITHUB RELEASE, GIT WORKFLOW & REPOSITORY MAINTENANCE
Target Project: Sibcut Video Editor
Repository: https://github.com/officialsinasinaei/Sibcut-Video-Editor
================================================================================
-->

# Sibcut Video Editor — Git Workflow & Release Guide (Agent Skill & Manual)

This document is the official, comprehensive runbook and AI agent skill for managing Git, synchronizing repository history, and executing production releases for **Sibcut Video Editor**.

Any future AI coding assistant, DevOps engineer, or open-source maintainer working on this codebase **must** read and follow the procedures and constraints defined in this document.

---

## Table of Contents

1. [Quick Reference: The 5 Release Commands](#1-quick-reference-the-5-release-commands)
2. [Release Preparation & Pre-Flight Checks](#2-release-preparation--pre-flight-checks)
3. [Git Push Strategy & Handling Large Binary Files](#3-git-push-strategy--handling-large-binary-files)
4. [GitHub Actions CI/CD Architecture](#4-github-actions-cicd-architecture)
5. [Daily Git Synchronization & Branching](#5-daily-git-synchronization--branching)
6. [Strict Rules: DO's and DON'Ts](#6-strict-rules-dos-and-donts)
7. [Troubleshooting & Emergency Playbook](#7-troubleshooting--emergency-playbook)

---

## 1. Quick Reference: The 5 Release Commands

When releasing a new version (for example, `v1.0.1`):

```bash
# 1. Stage all your verified changes
git add .

# 2. Commit with conventional release message
git commit -m "release: v1.0.1"

# 3. Create an annotated or lightweight semantic version tag
git tag v1.0.1

# 4. Push your code to main
git push origin main

# 5. Push the tag to trigger the automated GitHub Actions release build
git push origin v1.0.1
```

Once pushed, GitHub Actions automatically compiles, packages, hashes, and publishes:
- **Windows**: `Sibcut-Video-Editor-Setup.exe` (NSIS) and `Sibcut-Video-Editor-Portable.exe`
- **macOS Apple Silicon**: `Sibcut-Video-Editor-macOS-arm64.dmg` and `Sibcut-Video-Editor-macOS-arm64.zip`
- **macOS Intel**: `Sibcut-Video-Editor-macOS-x64.dmg` and `Sibcut-Video-Editor-macOS-x64.zip`
- **Linux**: `Sibcut-Video-Editor-Linux-x64.AppImage` and `Sibcut-Video-Editor-Linux-x64.deb`
- **Checksums**: Master `SHA256SUMS.txt` verified across all binaries

---

## 2. Release Preparation & Pre-Flight Checks

Never push a release tag without performing these three pre-flight steps:

### Step 2.1: Synchronize the Version Across 3 Files
The version string **must** match identically across all three files:

1. **`package.json`**:
   ```json
   "version": "1.0.1",
   ```
2. **`src/lib/version.js`**:
   ```javascript
   export const APP_VERSION = '1.0.1';
   ```
3. **`CHANGELOG.md`**:
   Add a new entry following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):
   ```markdown
   ## [1.0.1] - 2026-11-05
   
   ### Added
   - Description of new user-facing features.
   
   ### Fixed
   - Description of bug fixes.
   ```

### Step 2.2: Run Local Validation Scripts
Run these verification scripts from the project root:

```bash
# 1. Verify open-source licenses of all 69 runtime dependencies
npm run check:licenses

# 2. Verify branding, titles, metadata, and attribution integrity
node tools/verify-rebrand.cjs

# 3. Verify Vite bundles and WebCodecs worker build without errors
npm run build:electron
```
> [!IMPORTANT]
> If any check fails, **stop and fix the problem**. Never push or tag a build with license violations or broken bundles.

---

## 3. Git Push Strategy & Handling Large Binary Files

### 3.1 Repository Architecture Context
Sibcut Video Editor is a self-contained desktop application. It intentionally bundles:
- Pre-compiled ONNX WebAssembly SIMD runtimes (`public/assets/ort-wasm-simd-threaded.*.wasm`) (~29 MB each)
- Offline background matting neural network (`public/models/rvm_mobilenetv3.onnx`) (~15 MB)
- Native offline Vosk speech recognition DLLs for Windows (`native/win-x86_64/libvosk.dll`) (~26 MB)

To prevent repository bloat, macOS (`libvosk.dylib`) and Linux (`libvosk.so`) native libraries are **not stored in Git**. Instead, they are hydrated at build time via `npm run fetch:vosk` (`tools/fetch-native-vosk.mjs`) with cache-first SHA-256 verification.

Because the repository history contains ~60–100 MB of compressed binaries, standard Git pushes over HTTPS can fail on slow or filtered connections with:
- `error: RPC failed; curl 55 Send failure: Connection was aborted`
- `error: RPC failed; HTTP 408 curl 22 The requested URL returned error: 408`

### 3.2 The Golden Rule for Git HTTP Buffers
Many online guides mistakenly tell users to set `http.postBuffer 524288000` (500 MB).  
**DO NOT DO THIS.**

When `http.postBuffer` is set very large:
- Git buffers the entire multi-megabyte payload into memory and transmits it in a **single monolithic POST request**.
- If the upload takes longer than GitHub's proxy timeout (~60–90 seconds), GitHub abruptly terminates the connection with `HTTP 408 Request Timeout` or `curl 55 Send failure`.

**Correct Git Network Configuration:**
```bash
# Keep postBuffer at default (or unset custom large values)
git config --unset http.postBuffer
git config --unset http.maxRequestBuffer

# Ensure low-speed limits don't abort legitimate uploads
git config http.lowSpeedLimit 1000
git config http.lowSpeedTime 300
```
This enables **HTTP chunked transfer streaming**, keeping the TCP socket active and preventing proxy timeouts.

### 3.3 Seeding or Pushing to a New Remote
If pushing full repository history to a new or empty remote:
- Do not push all 20+ commits in a single massive pack if upload bandwidth is limited.
- Push intermediate commits in smaller batches:
  ```bash
  git push origin <intermediate-commit-hash>:refs/heads/seed
  git push origin <larger-commit-hash>:refs/heads/seed
  git push origin main
  git push origin --delete seed
  ```
- Once commits are received by GitHub, subsequent delta pushes only transmit a few kilobytes.

---

## 4. GitHub Actions CI/CD Architecture

The repository uses two workflows located in `.github/workflows/`:

### 4.1 Continuous Integration: `.github/workflows/ci.yml`
- **Trigger**: Every push or Pull Request targeting `main`.
- **Jobs**:
  - `lint-and-validate`: Runs `npm run check:licenses`, `npm run check:packaging`, and `npm run build` on `ubuntu-latest`.
  - `build-electron-check`: Matrix test compiling the bundle and executing the headless `--smoke-test` across `windows-latest`, `macos-latest`, and `ubuntu-latest` (under `xvfb-run`).
- **Permissions**: Least-privilege `contents: read`.

### 4.2 Release Pipeline: `.github/workflows/release.yml`
- **Trigger**: Pushing any tag matching `v*` (e.g. `v1.0.0`) **OR** manually via `workflow_dispatch` in the GitHub UI.
- **Permissions**: `contents: write` (required to publish release binaries and upload assets).
- **Matrix Architecture & Strict Release Gate**:
  1. `validate-version`: Ubuntu runner validates that the tag name (e.g. `v1.0.1`) exactly matches `"version"` in `package.json`. If they differ, the workflow immediately aborts to prevent mismatched releases.
  2. `build-windows`: `windows-latest` runner packages `Setup.exe` and `Portable.exe`, runs an automated `--smoke-test`, and stages verified binaries.
  3. `build-macos-arm64`: `macos-latest` runner packages Apple Silicon `arm64.dmg` and `zip`, mounts the DMG via `hdiutil attach`, executes the full `--smoke-test` on the mounted app bundle, and unmounts.
  4. `build-macos-x64`: `macos-latest` runner packages Intel `x64.dmg` and `zip`, mounts the DMG, and verifies Mach-O x86_64 architecture and bundle integrity.
  5. `build-linux`: `ubuntu-latest` runner packages `.AppImage` and `.deb`, executes an automated headless `--smoke-test` under `xvfb-run`, and stages verified binaries.
  6. `publish`: Runs **only after all 4 platform build & smoke-test jobs succeed**. Downloads all artifacts with `merge-multiple: true`, calculates and validates master `SHA256SUMS.txt`, and publishes via `softprops/action-gh-release@v2`.

### 4.3 Critical Rules for Electron-Builder in CI
> [!CAUTION]
> Always pass `--publish never` to `electron-builder` in CI scripts:
> ```bash
> npx electron-builder --win --publish never
> npx electron-builder --mac --arm64 --publish never
> npx electron-builder --mac --x64 --publish never
> npx electron-builder --linux --x64 --publish never
> ```
> In CI, `electron-builder` automatically tries to publish to GitHub if it detects a Git tag. If credentials are not explicitly supplied to its internal publisher, it will crash **after** building the files. Let our dedicated `publish` job handle release publication.

> [!WARNING]
> **NEVER use `macos-13` as a runner label.**  
> GitHub officially retired the legacy Intel `macos-13` runner fleet. Jobs specifying `macos-13` will hang indefinitely in the queue with *"Waiting for a runner to pick up this job..."*. Always use `macos-latest` (Apple Silicon `arm64`).

### 4.4 macOS Gatekeeper Quarantine Runbook
On modern macOS (Ventura 13+, Sonoma 14+, Sequoia 15+), files downloaded from a web browser receive the `com.apple.quarantine` extended attribute. Without an Apple Developer ID Application certificate (\$99/yr) and an Apple Notarization ticket, Gatekeeper refuses to execute the application and displays a misleading warning: *"Sibcut Video Editor is damaged and can't be opened. You should move it to the Bin."*

#### Immediate User Resolution:
To clear the quarantine flag, run in Terminal:
```bash
xattr -cr "/Applications/Sibcut Video Editor.app"
```

#### Apple Developer ID Signing (Turnkey in CI):
When Apple Developer Program credentials become available, simply set these GitHub Repository Secrets:
- `CSC_LINK`: Base64-encoded `.p12` Developer ID Application certificate.
- `CSC_KEY_PASSWORD`: Password for the `.p12` certificate.
- `APPLE_ID`: Your Apple Developer email.
- `APPLE_APP_SPECIFIC_PASSWORD`: Generated app-specific password from appleid.apple.com.
- `APPLE_TEAM_ID`: 10-character Apple Developer Team ID.

The CI workflow `.github/workflows/release.yml` will automatically discover these secrets and invoke Apple notarytool notarization and ticket stapling with zero script modifications.

### 4.5 Automated Headless Smoke Testing Runbook
The `--smoke-test` command-line switch enables CI virtual machines (and local developers) to verify complete application startup health deterministically:

```bash
# 1. Compile worker and web assets
npm run build:electron

# 2. Run local headless smoke test
npx electron . --smoke-test
```

**Lifecycle Guarantees:**
- Electron main process boots the localhost HTTP server, initializes IPC channels, and creates the window.
- The window waits for `'ready-to-show'`, logs `[SMOKE-TEST] App launched successfully, exiting with code 0`, and calls `app.exit(0)` after 2000ms.
- Any unhandled exception or unhandled promise rejection immediately terminates the process with code 1.
- In CI (`.github/workflows/release.yml`), all 4 platform smoke tests must pass with exit code 0 or release publication is completely blocked.

### 4.6 macOS Ad-Hoc Identity & Empty Secret Sanitization Runbook
When building open-source releases on GitHub Actions without active Apple Developer Program credentials:
- **The Empty Secret Gotcha**: In GitHub Actions, if `secrets.CSC_LINK` is not configured, `${{ secrets.CSC_LINK }}` evaluates to an empty string (`""`). Passing `CSC_LINK: ""` causes `app-builder-lib` to treat `""` as non-null, resolve `path.resolve(currentDir, "")` to the workspace root directory, and crash with `InvalidConfigurationError: <repo-root> not a file`.
- **The Default Identity Search Gotcha**: When `CSC_LINK` is unset, `@electron/osx-sign` defaults to searching the runner keychain for `Developer ID Application:`. On GitHub virtual runners, no developer certificate exists, causing `osx-sign` to throw `No identity found for signing`.
- **The Solution**: In `.github/workflows/release.yml`, we sanitize the environment before invoking electron-builder:
  ```bash
  EXTRA_BUILDER_ARGS="-c.npmRebuild=false"
  if [ -z "${CSC_LINK:-}" ]; then
    echo "No CSC_LINK certificate secret configured. Setting mac.identity=null to skip code signing."
    unset CSC_LINK
    unset CSC_KEY_PASSWORD
    unset APPLE_ID
    unset APPLE_APP_SPECIFIC_PASSWORD
    unset APPLE_TEAM_ID
    EXTRA_BUILDER_ARGS="-c.mac.identity=null -c.npmRebuild=false"
  fi
  npx electron-builder --mac --arm64 --publish never $EXTRA_BUILDER_ARGS
  ```
  Passing `-c.mac.identity=null` instructs electron-builder to skip code signing cleanly, allowing ad-hoc open-source DMG and ZIP packaging.

### 4.7 Cross-Architecture Intel (x64) Packaging on Apple Silicon Runners
- **Runner Reality**: GitHub Actions `macos-latest` runs on Apple Silicon (`arm64`). Legacy `macos-13` Intel runners are retired.
- **Dependency Omission**: Running standard `npm ci` on an `arm64` host deliberately skips optional dependencies targeting other CPU architectures (such as `@koromix/koffi-darwin-x64`).
- **The Rebuild Trap**: When cross-packaging for `--x64`, `electron-builder` attempts to run `@electron/rebuild --arch x64`, which fails trying to compile native modules across CPU architectures.
- **The Solution**:
  1. Force install the prebuilt target architecture package:
     ```bash
     npm install --no-save --force @koromix/koffi-darwin-x64@3.3.4
     ```
  2. Pass `-c.npmRebuild=false` to electron-builder to reuse the official precompiled native `.node` binary and skip redundant recompilation.

### 4.8 Linux AppImage Headless Smoke Testing & FUSE Bypass
- **The FUSE Barrier**: AppImages require the kernel FUSE filesystem (`libfuse2`) to mount. Ubuntu 24.04 runner environments lack FUSE 2 by default, causing AppImages to fail on launch.
- **The Helper Trap**: Running `find release/linux-unpacked -maxdepth 1 -type f -executable | head -n 1` picks `chrome-sandbox` (an internal SUID helper), which immediately crashes with `SIGSEGV` (exit code 139) when run without setuid root.
- **The Solution**:
  1. The unpacked test must explicitly execute `"release/linux-unpacked/Sibcut Video Editor"`.
  2. The AppImage test must extract the squashfs payload cleanly using `--appimage-extract` into a temporary directory and execute the resulting `./squashfs-root/"Sibcut Video Editor" --smoke-test --no-sandbox` under `xvfb-run`. This verifies the packaged binary payload with 100% determinism and zero kernel FUSE dependencies.

### 4.9 Packaged Binary Dynamic Library Resolution (ASAR Unpack Priority)
- **The ASAR Limitation**: Operating system dynamic linkers (`LoadLibrary` on Windows, `dlopen` on macOS and Linux) **cannot read or execute shared libraries (`.dll`, `.dylib`, `.so`) directly from inside virtual ASAR archives**.
- **Candidate Path Priority**: In `vosk-service.cjs`, candidate directory search must prioritize `app.asar.unpacked` over `app.asar`, and must reject any candidate directory containing `app.asar` unless it contains `app.asar.unpacked`:
  ```javascript
  const isAsar = __dirname.includes('app.asar');
  const unpackedBase = isAsar
    ? __dirname.replace(/app\.asar.*$/, 'app.asar.unpacked')
    : path.join(__dirname, '..', 'app.asar.unpacked');

  const candidateDirs = [
    path.join(unpackedBase, cfg.platformDir),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', cfg.platformDir),
    path.join(execDir, 'resources', 'app.asar.unpacked', cfg.platformDir),
    ...(!isAsar ? [path.join(__dirname, cfg.platformDir)] : []),
    path.join(process.resourcesPath || '', cfg.platformDir),
    path.join(execDir, cfg.platformDir),
  ];
  ```

---

## 5. Daily Git Synchronization & Branching

### 5.1 Remote Conventions
- **`origin`**: The official public repository:  
  `https://github.com/officialsinasinaei/Sibcut-Video-Editor.git`
- **Default Branch**: `main`

### 5.2 Daily Synchronization
Always pull before making changes:
```bash
git checkout main
git pull origin main
```

### 5.3 Feature Branches & Pull Requests
For non-trivial features or refactoring:
```bash
git checkout -b feature/audio-ducking
# ... make changes ...
git add .
git commit -m "feat(audio): add audio ducking controls to inspector"
git push origin feature/audio-ducking
```
Open a Pull Request on GitHub. Once CI passes, merge into `main`.

---

## 6. Strict Rules: DO's and DON'Ts

### For All Developers and AI Agents

| Category | DO | DO NOT |
|---|---|---|
| **Branding & Logo** | Keep approved icon assets in `assets/branding/` and `build/`. Use exact casing: **`Sibcut Video Editor`**. | **DO NOT modify, redraw, reposition, crop, center, change proportions, or re-generate the mascot/logo.** |
| **Licensing** | Maintain **GPL-3.0** for Sibcut. Retain **MIT** attribution for HeyPuter Everything. Verify third-party licenses with `npm run check:licenses`. | **DO NOT** remove license headers, relicense without verification, or claim HeyPuter officially endorses Sibcut. |
| **Security** | Keep secrets in GitHub repository secrets only. Scan before pushing. | **DO NOT** commit `.env`, `.pem`, `.pfx`, `.key`, API keys, tokens, or local user paths (`C:\Users\...`). |
| **Git History** | Reconcile branches with clean merges or fast-forwards. | **DO NOT** force-push (`--force`) to `main` or overwrite remote commits. |
| **Dependencies** | Keep dependencies offline-first and minimal. Use `npm ci`. | **DO NOT** introduce required cloud/SaaS telemetry, remote trackers, or mandatory cloud logins. |
| **Packaging** | Preserve backwards compatibility for `.vsproj` project files and OPFS local storage. | **DO NOT** change `appId` (`com.sinasinaei.sibcutvideoeditor`) or userData paths unnecessarily. |

---

## 7. Troubleshooting & Emergency Playbook

### Scenario A: GitHub Actions Release failed or stalled
1. Inspect the run logs at:  
   `https://github.com/officialsinasinaei/Sibcut-Video-Editor/actions`
2. Check which runner failed:
   - If a runner says *"Waiting for a runner to pick up this job"*, check runner labels in `.github/workflows/release.yml`. Ensure no retired runners (like `macos-13`) are specified.
   - If `electron-builder` failed with authentication or publish errors, ensure `--publish never` is present on the packaging command.
   - If version validation failed, verify that the pushed tag matches `"version"` in `package.json`.

### Scenario B: Re-triggering a Release
If you need to re-run the release after fixing a workflow or code bug:
1. Fix the issue on `main` and push:
   ```bash
   git add .
   git commit -m "fix(release): resolve packaging issue"
   git push origin main
   ```
2. Move the release tag to the new commit and push:
   ```bash
   git tag -f v1.0.X
   git push origin v1.0.X --force
   ```
3. Alternatively, trigger directly from the GitHub UI:
   - Go to **Actions** → **Release** → **Run workflow**.
   - Enter `v1.0.X` and click **Run workflow**.

### Scenario C: Git push hangs or times out on Windows
1. Verify postBuffer is not set:
   ```bash
   git config --unset http.postBuffer
   ```
2. Verify objects are packed:
   ```bash
   git gc
   ```
3. Test connectivity:
   ```bash
   git ls-remote origin
   ```

### Scenario D: macOS build fails with `<workspace-dir> not a file` or `No identity found for signing`
- **Root Cause**: `CSC_LINK` was provided as an empty string in the GitHub Actions workflow environment. `app-builder-lib` resolves `""` to the workspace directory and crashes because a directory is not a `.p12` file. Alternatively, `@electron/osx-sign` tried to find a `Developer ID Application:` certificate in the runner's empty keychain.
- **Fix**: Sanitize the environment before packaging:
  ```bash
  EXTRA_BUILDER_ARGS="-c.npmRebuild=false"
  if [ -z "${CSC_LINK:-}" ]; then
    unset CSC_LINK
    unset CSC_KEY_PASSWORD
    unset APPLE_ID
    unset APPLE_APP_SPECIFIC_PASSWORD
    unset APPLE_TEAM_ID
    EXTRA_BUILDER_ARGS="-c.mac.identity=null -c.npmRebuild=false"
  fi
  npx electron-builder --mac --arm64 --publish never $EXTRA_BUILDER_ARGS
  ```

### Scenario E: macOS Intel (x64) build fails on Apple Silicon runner
- **Root Cause**: Running `npm ci` on `macos-latest` (arm64) automatically omits optional dependencies for other CPU architectures (`@koromix/koffi-darwin-x64`). `@electron/rebuild` fails trying to cross-compile for x64 on arm64.
- **Fix**: Force install the prebuilt x64 addon package and disable rebuild:
  ```bash
  npm install --no-save --force @koromix/koffi-darwin-x64@3.3.4
  npx electron-builder --mac --x64 --publish never -c.npmRebuild=false -c.mac.identity=null
  ```

### Scenario F: Linux smoke test crashes with SIGSEGV (exit code 139)
- **Root Cause**: The test script selected `chrome-sandbox` (the internal Chromium SUID helper) instead of `"Sibcut Video Editor"`. Alternatively, the AppImage failed to mount because the runner lacks kernel FUSE permissions.
- **Fix**: Explicitly execute the actual app binary and extract the AppImage with `--appimage-extract`:
  ```bash
  # 1. Test unpacked binary directly
  xvfb-run --auto-servernum "release/linux-unpacked/Sibcut Video Editor" --smoke-test --no-sandbox

  # 2. Test extracted AppImage bundle without FUSE kernel dependency
  "$APPIMAGE" --appimage-extract
  xvfb-run --auto-servernum ./squashfs-root/"Sibcut Video Editor" --smoke-test --no-sandbox
  ```

### Scenario G: Packaged Electron binary fails loading native `.dll`, `.dylib`, or `.so` libraries
- **Root Cause**: Native libraries cannot be loaded directly from inside virtual ASAR archives by OS dynamic linkers (`LoadLibrary` / `dlopen`).
- **Fix**: Ensure `vosk-service.cjs` prioritizes `app.asar.unpacked` over `app.asar`, and verify `package.json` includes `**/native/**` in `asarUnpack`.
