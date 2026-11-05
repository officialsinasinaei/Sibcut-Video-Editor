# Issue 01: Cross-Platform Release Verification and macOS Quarantine

Status: resolved
Type: task

## Description
Implement the deterministic `--smoke-test` target, guard native Vosk bindings against non-Windows platforms with clean UI fallbacks, configure dual `arm64` and `x64` macOS packaging, build automated CI smoke test harnesses for Windows, macOS, and Linux, and document the Gatekeeper quarantine resolution.

## Tasks
- [x] 1. Add `--smoke-test` argument handler in `electron-main.cjs` with clean lifecycle exit code 0 and unhandled error exit code 1.
- [x] 2. Guard `vosk-service.cjs` with `process.platform !== 'win32'` checks to bypass Windows DLL calls on macOS/Linux and expose `isSupported()` cleanly.
- [x] 3. Update captions / transcription UI with an informative platform notice when Vosk is unavailable.
- [x] 4. Update `package.json` with hardened runtime, entitlements, and dual `arm64` + `x64` macOS targets.
- [x] 5. Update `.github/workflows/release.yml` with dual macOS jobs, automated smoke tests on real virtual runners, and strict publish gating.
- [x] 6. Update `.github/workflows/ci.yml` to include packaging check and smoke test.
- [x] 7. Update `RELEASE-AND-GIT-WORKFLOW.md` and release body template with Gatekeeper resolution instructions (`xattr -cr`) and architecture table.
- [x] 8. Verify with automated tests in `tests/` and run smoke test locally.
