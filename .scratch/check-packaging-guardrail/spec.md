# Spec: Automated Packaging & ASAR Guardrail

## Problem
In the past, web dependencies leaked into `package.json` `"dependencies"` and duplicate WASM binaries sat in `public/assets/`, inflating `app.asar` to 551 MB without failing any automated checks.

## Goals
Implement `tools/check-packaging.mjs` and wire it to `package.json` as `npm run check:packaging`:
1. **Production Bundle Isolation**: Assert that `"dependencies"` in `package.json` only contains verified Electron main-process runtime packages (`koffi`, `yauzl`).
2. **Asset Deduplication**: Assert that no duplicate filenames exist between `public/` root and `public/assets/` (or duplicate WASM files).
3. **ASAR Size Budget**: If `release/win-unpacked/resources/app.asar` exists, assert that its file size does not exceed the 200 MB budget ceiling.
4. **Automated Testing**: Provide a Vitest test suite (`tests/check-packaging.test.js`) verifying all validation rules pass on valid configs and throw actionable errors on violations.
