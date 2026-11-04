# 0003. Playhead Edge Auto-Scroll

## Context
In `src/ui/timeline/timeline.js`, edge auto-scrolling was previously wired only for clip dragging and edge trimming. When a user clicked and dragged the playhead cap (`.tl-playhead-cap`) or scrubbed along the time ruler (`.tl-ruler`), moving the pointer to the left or right boundaries of the visible tracks viewport halted navigation: the viewport remained static, forcing users to interrupt their edit, manually drag the bottom horizontal scrollbar, and re-locate their edit point.

## Decision
1. **Unified Edge Auto-Scroll Mechanism**: Generalize the timeline edge auto-scroll loop in `timeline.js` so it serves clip dragging, playhead cap scrubbing, ruler scrubbing, and ruler marker dragging.
2. **Progressive Velocity Scaling**: Instead of a flat constant scroll speed, calculate velocity based on the pointer's penetration depth into (or past) the 36px threshold margin, ranging from ~8px/tick (gentle precision) to ~36px/tick (fast traversal).
3. **Continuous Per-Tick Seek Dispatch**: Store the latest pointer position and re-evaluate `store.seek()` on every timer tick as `scroller.scrollLeft` shifts beneath the cursor, ensuring continuous forward/backward time advancement even when the user holds the pointer stationary at the screen edge.
4. **Strict Boundary Clamping**: Prevent scrolling past time `00:00:00:00` on the left and limit forward scrolling to the project duration plus standard padding on the right.

## Consequences
- Scrubbing the playhead to either edge of the visible timeline now smoothly scrolls the timeline in real time, matching the industry-standard experience of Premiere Pro, DaVinci Resolve, and CapCut.
- Zero breaking changes to clip dragging, trim handles, magnetic snapping, or keyboard shortcuts.
