# 0002. Repository Hygiene and Model Deduplication

## Context
An audit of the repository identified redundant binaries, scratch development tools, and package leaks that degraded repository hygiene without contributing to application functionality:
1. Root-level loose icons (`icon.png` and `icon-128.png`) duplicated existing branding assets in `assets/branding/`.
2. A 14.28 MB ONNX neural network model (`rvm_mobilenetv3.onnx`) was stored in both `public/models/` and `src/media/models/`. Because `public/` assets are copied verbatim into `dist/` by Vite while `src/media/models/` is processed through the bundler, the exact same 15 MB model was packaged twice in `dist/` and `app.asar`.
3. Development screenshot scripts with hardcoded user machine paths (`C:\Users\<user>\...`) were checked into `tools/`.
4. Dead generator scripts referencing missing temporary folders were checked into `tools/`.
5. `tools/verify-rebrand.cjs` was unintentionally ignored from version control due to a wildcard in `.gitignore`.
6. Non-runtime rebrand comparison images in `assets/branding/previews/` were being packaged into `app.asar` via `"assets/branding/**"`.

## Decision
1. **Root-Level Duplicate Icon Removal**: Remove `icon.png` and `icon-128.png` from the repository root, relying exclusively on canonical assets in `build/`, `public/app-icon.png`, and `assets/branding/`.
2. **Model Asset Deduplication**: Remove `public/models/rvm_mobilenetv3.onnx` and standardize on `src/media/models/rvm_mobilenetv3.onnx` loaded via Vite's `?url` asset import, matching all other vision models (`face-landmarker.task`, `pose-landmarker.task`, `hair-segmenter.tflite`).
3. **Scratch Tooling Removal**: Delete `tools/take-screenshots.cjs`, `tools/take-effect-keyframe-screenshots.cjs`, and `tools/take-farsi-screenshots.cjs` to eliminate hardcoded machine paths from Git history.
4. **Dead Script Removal**: Delete obsolete `tools/generate-category-previews.ps1` and `tools/make-ico.cjs`.
5. **Release Tooling Whitelisting**: Whitelist `!tools/verify-rebrand.cjs` in `.gitignore` and track it in version control to ensure clean clones and automated release pipelines have access to mandatory verification checks.
6. **Package Branding Isolation**: Narrow `package.json`'s `build.files` from `"assets/branding/**"` to runtime icon folders (`assets/branding/app-icons/**`, `assets/branding/master/app-icon-master.png`, `assets/branding/tray/**`), preserving design comparison previews in Git while keeping them out of release binaries.

## Consequences
- Prevents 15 MB double-packaging of the RVM neural network in `dist/` and `app.asar`.
- Eliminates 30 MB of unneeded files and loose root clutter from the Git working tree.
- Resolves the missing release verification script for future CI/CD checkouts.
- Ensures zero impact on video editor UI layout, playback engine, timeline operations, or test suites.
