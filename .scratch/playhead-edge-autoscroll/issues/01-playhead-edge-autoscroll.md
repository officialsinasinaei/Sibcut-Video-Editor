# Issue 01: Playhead Edge Auto-Scroll

Status: ready-for-human
Type: task

## Description
Implement continuous, progressive edge auto-scrolling during playhead scrubbing, ruler scrubbing, and marker dragging in `src/ui/timeline/timeline.js`.

## Tasks
- [x] 1. Refactor `autoScroll(ev, onTick)` in `src/ui/timeline/timeline.js` to support progressive acceleration (8px/frame to 36px/frame over a 36px threshold zone) and per-tick seek updates.
- [x] 2. Wire `autoScroll` and `stopAutoScroll` into `scrub(e)` for playhead cap and ruler scrubbing, with window blur teardown.
- [x] 3. Wire `autoScroll` and `stopAutoScroll` into the marker drag handler on `.tl-ruler`, with window blur teardown.
- [x] 4. Ensure strict clamping at time `0` on the left and duration tail on the right with zero overflow guard and no overshoot.
- [x] 5. Verify with automated tests in `tests/timeline-view.test.js` (7 new edge auto-scroll tests, all 13 passing) and all 8 timeline test suites (144 tests passing).
