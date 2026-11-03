---
name: github-release-and-git-workflow
description: Standardized runbook and procedures for building, testing, committing, pushing, and releasing Sibcut Video Editor on GitHub using GitHub Actions. Use when preparing or executing releases, pushing changes to Git, or troubleshooting CI/CD builds.
---

# GitHub Release & Git Workflow Skill

This skill defines the mandatory workflow for committing, pushing, and releasing **Sibcut Video Editor** to GitHub.

## When to Use This Skill
- Preparing and releasing a new version (e.g. `v1.0.1`, `v1.1.0`).
- Updating code, committing changes, or pushing to `main`.
- Troubleshooting Git push issues, network timeouts, or large binary transfer errors.
- Troubleshooting GitHub Actions CI or Release workflow failures.
- Auditing license compliance and application branding integrity.

---

## The 5-Step Release Procedure

1. **Synchronize version across 3 files**:
   - `package.json` (`"version": "X.Y.Z"`)
   - `src/lib/version.js` (`export const APP_VERSION = 'X.Y.Z';`)
   - `CHANGELOG.md` (Add section for `[X.Y.Z]` with date and changes)

2. **Run pre-flight checks**:
   ```bash
   npm run check:licenses      # Must pass: all 69 dependencies verified
   node tools/verify-rebrand.cjs # Must pass: branding & metadata integrity
   npm run build:electron      # Must pass: worker & frontend bundle
   ```

3. **Stage and commit**:
   ```bash
   git add .
   git commit -m "release: vX.Y.Z"
   ```

4. **Tag the version**:
   ```bash
   git tag vX.Y.Z
   ```

5. **Push code and tag**:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```

GitHub Actions automatically builds Windows (Setup + Portable), macOS (Apple Silicon dmg + zip), and Linux (AppImage + deb), generates `SHA256SUMS.txt`, and publishes to GitHub Releases.

---

## Critical Agent Constraints

1. **Branding Artwork**: Never modify, redraw, reposition, crop, center, or regenerate the approved mascot or app icon in `assets/branding/` and `build/`.
2. **Product Name**: Always use exact casing: `Sibcut Video Editor`.
3. **Licensing**: Maintain `GPL-3.0-only` for Sibcut and MIT attribution for upstream HeyPuter Everything.
4. **CI Packaging Flag**: In `.github/workflows/release.yml`, always pass `--publish never` to `electron-builder` so it does not attempt unauthenticated auto-publishing.
5. **Runner Labels**: Never use `macos-13` (retired). Always use `macos-latest` (Apple Silicon `arm64`).
6. **Network Buffers**: Never set large `http.postBuffer` values (e.g. 500MB) as they trigger HTTP 408 timeouts. Keep default buffer sizes to enable HTTP chunked transfer streaming.

For the full detailed runbook, refer to [`RELEASE-AND-GIT-WORKFLOW.md`](../../RELEASE-AND-GIT-WORKFLOW.md).
