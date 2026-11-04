# Issue 01: Add tools/check-packaging.mjs guardrail

Status: resolved
Type: task

## Description
Create `tools/check-packaging.mjs` verifying:
- Production Bundle Isolation (`package.json` `"dependencies"` limited strictly to runtime modules `koffi` and `yauzl`).
- Asset deduplication (`public/` vs `public/assets/`).
- ASAR budget ceiling (max 200 MB for `release/win-unpacked/resources/app.asar` when present).

Expose as `npm run check:packaging`, wire to `prebuild`, and add automated unit tests in `tests/check-packaging.test.js`.
