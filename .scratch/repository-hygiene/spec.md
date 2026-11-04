# Specification: Repository Hygiene & Model Asset Deduplication

## Objective
Audit and remove superfluous, duplicate, and obsolete development artifacts from the GitHub repository to match professional engineering standards, while strictly safeguarding all functional video editor logic, UI layouts, test suites, and build pipelines.

## Findings Summary
1. **Root Loose Duplicate Icons**:
   - `icon.png` (469 KB) — Exact duplicate of `assets/branding/master/app-icon-master.png`. Unreferenced in source.
   - `icon-128.png` (13 KB) — Exact duplicate of `assets/branding/app-icons/linux/128x128.png`. Unreferenced in source.
2. **Duplicate 15 MB AI Vision Model**:
   - `public/models/rvm_mobilenetv3.onnx` (14.28 MB) — Exact binary duplicate of `src/media/models/rvm_mobilenetv3.onnx`.
   - Causes double-packaging in `dist/` (`dist/assets/rvm_mobilenetv3-*.onnx` and `dist/models/rvm_mobilenetv3.onnx`), wasting 15 MB in the ASAR archive.
3. **Obsolete Screenshot Scripts with Hardcoded Local User Paths**:
   - `tools/take-screenshots.cjs`
   - `tools/take-effect-keyframe-screenshots.cjs`
   - `tools/take-farsi-screenshots.cjs`
   - All contain hardcoded paths like `C:\Users\<user>\...` and are not part of CI or testing.
4. **Obsolete Asset Generation Tools**:
   - `tools/generate-category-previews.ps1` — Relies on non-existent `imagesfororganizing` directory.
   - `tools/make-ico.cjs` — Legacy ICO generator superseded by the approved icon assets.
5. **Git-Ignored Critical Verification Tool**:
   - `tools/verify-rebrand.cjs` is currently ignored by `.gitignore` rule `tools/verify-*.cjs`, leaving a required release verification script uncommitted.
6. **Non-Runtime Branding Previews Packaged in Production**:
   - `assets/branding/previews/` and `assets/branding/source/original-logo.jpg` are bundled into the ASAR due to `"assets/branding/**"` in `package.json`.
