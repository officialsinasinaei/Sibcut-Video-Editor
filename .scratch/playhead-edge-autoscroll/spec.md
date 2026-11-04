# Specification: Playhead Edge Auto-Scroll

## Objective
Enable smooth, progressive auto-scrolling when scrubbing or dragging the playhead (or timeline markers) against the left or right boundaries of the visible timeline tracks area, allowing continuous timeline navigation forward or backward across multi-minute projects without breaking existing clip snapping, ruler markers, or playback controls.

## Requirements
1. **Playhead & Ruler Scrubbing**:
   - When the user presses and drags the playhead cap (`.tl-playhead-cap`) or scrubs directly on the timeline ruler (`.tl-ruler`), moving within 36px of the left or right boundary of the visible tracks area activates horizontal auto-scrolling.
   - On every animation frame / scroll interval tick, `scroller.scrollLeft` updates by the calculated scroll velocity, and `store.seek()` re-evaluates against the newly scrolled coordinates so time continuously advances or rewinds even when the mouse is held stationary at the edge.
2. **Speed Curve & Progressive Dynamics**:
   - Distance-proportional velocity: Gentle scrolling (~8–12px/tick) when hovering just inside the 36px edge zone, accelerating up to ~32–40px/tick when dragging further past the boundary.
3. **Boundary Clamping**:
   - Clamped cleanly at time `00:00:00:00` on the left.
   - Clamped at project duration plus tail padding on the right to prevent endless scrolling into empty space.
4. **Marker Dragging Consistency**:
   - Dragging chapter markers on the ruler shares the same auto-scroll loop.
5. **Robust Teardown & Integration**:
   - `stopAutoScroll()` terminates all timers immediately on `pointerup`, `pointercancel`, or window blur. Clip dragging, trimming, playhead scrubbing, and marker dragging share the unified progressive velocity loop without regressions.
