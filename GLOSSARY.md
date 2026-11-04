# Sibcut Video Editor

Desktop packaging and performance domain model for Sibcut Video Editor.

## Language

**Cold Launch**:
The initial startup of the portable executable on a machine, requiring the self-extracting archive to decompress and unpack application payloads to disk before execution.
_Avoid_: First boot, initial run, cold boot

**Warm Launch**:
A subsequent startup of the application where previously extracted binaries are reused from a persistent unpack directory, bypassing runtime decompression.
_Avoid_: Fast start, cached boot, quick launch

**In-Place Portable**:
A standalone directory distribution containing pre-extracted binaries and runtime assets with adjacent portable user data, running directly with zero extraction delay.
_Avoid_: Folder portable, unpacked portable, zero-install

**SFX Wrapper**:
The self-extracting executable stub (generated via NSIS) that decompresses bundled application assets into a disk directory before handing off control to the Electron binary.
_Avoid_: Portable exe wrapper, loader, unzipper

**Production Bundle Isolation**:
The separation of build-time web dependencies from Electron main-process runtime dependencies so web-only packages are excluded from the ASAR archive.
_Avoid_: Dependency pruning, tree cleaning

**Single-Instance Guard**:
An application-level lock mechanism that restricts the process to a single active instance, redirecting subsequent invocations to the running window and preventing lock contention in shared directories.
_Avoid_: Mutex check, double-click guard

**Repository Hygiene**:
The systematic removal of duplicate binaries, orphaned scratch scripts, and non-runtime evaluation artifacts from the version control tree while keeping all production, build, and test assets intact.
_Avoid_: Repo cleaning, clutter removal, file purging

**Model Asset Deduplication**:
Maintaining a single canonical on-disk neural network binary under `src/media/models/` and importing it via bundler asset URL references, preventing duplicate copying into `public/` and eliminating redundant multi-megabyte payloads in the application package.
_Avoid_: Model cleanup, onnx pruning
