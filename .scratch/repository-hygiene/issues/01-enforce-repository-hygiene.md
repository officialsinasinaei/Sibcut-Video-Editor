# Issue 01: Enforce Repository Hygiene and Model Asset Deduplication

Status: resolved
Type: task

## Description
Perform an audit of all tracked and untracked files in the repository. Identify unnecessary, redundant, or orphaned files that do not belong in a professional open-source desktop video editor repository. Grill the user to confirm decisions on each category of findings before modifying or deleting any files.

## Identified Target Areas & Resolution
1. **Root Loose Duplicate Icons**: Removed `icon.png` (469 KB) and `icon-128.png` (13 KB).
2. **Model Asset Deduplication**: Deleted redundant `public/models/rvm_mobilenetv3.onnx` (14.28 MB) and `public/models/` folder. Canonical model remains in `src/media/models/rvm_mobilenetv3.onnx` imported via `?url`, eliminating double-bundling in `dist/` and `app.asar`.
3. **Scratch Screenshot Scripts**: Deleted `tools/take-screenshots.cjs`, `tools/take-effect-keyframe-screenshots.cjs`, and `tools/take-farsi-screenshots.cjs` (removed hardcoded local paths).
4. **Dead Helper Scripts**: Deleted `tools/generate-category-previews.ps1` and `tools/make-ico.cjs`.
5. **Release Tooling & Gitignore**: Whitelisted `!tools/verify-rebrand.cjs` in `.gitignore`, tracked `tools/verify-rebrand.cjs`, and removed stale ignore rules.
6. **Package Branding Isolation**: Narrowed `package.json` `build.files` to runtime icon assets (`assets/branding/app-icons/**`, `assets/branding/master/app-icon-master.png`, `assets/branding/tray/**`), keeping comparison previews in Git only.
