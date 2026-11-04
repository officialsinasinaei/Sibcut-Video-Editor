// The timeline panel in jsdom: there is no layout, so tests place the
// content box by hand (contentAt) to stand in for scrolling.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorStore } from '../src/model/store.js';
import { createActions } from '../src/ui/actions.js';
import { createTimeline } from '../src/ui/timeline/timeline.js';
import * as T from '../src/model/timeline.js';
import { fixture, clip, onMain, s } from './helpers.js';

function mountTimeline(p) {
  const store = new EditorStore(p);
  const ctx = {
    store,
    player: { playing: false, pause() {}, setPreview() {} },
    media: { on: () => () => {}, thumb: () => null, peaksNow: () => null, peaks() {} },
    commands: { keyFor: () => '', run() {} },
    assets: { show() {} },
  };
  ctx.actions = createActions(ctx);
  const tl = createTimeline(ctx);
  document.body.append(tl.el);
  tl.mounted();
  const content = tl.el.querySelector('.tl-content');
  const tracks = tl.el.querySelector('.tl-tracks');
  const scroller = tl.el.querySelector('.tl-scroll');
  // Where the content box starts on screen (it moves left as the view scrolls).
  const contentAt = (left) => {
    content.getBoundingClientRect = () => ({ left, top: 0, right: left + 5000, bottom: 400, width: 5000, height: 400, x: left, y: 0 });
  };
  contentAt(0);
  const node = (id) => tl.el.querySelector(`.tl-clip[data-id="${id}"]`);
  const pointer = (target, type, x, y = 0) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  return { store, ctx, tl, content, tracks, scroller, contentAt, node, pointer };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('timeline drags', () => {
  it('keeps a dragged clip under the pointer while the view scrolls, and drops it there', () => {
    const p = fixture();
    const [a] = onMain(p, clip('video', 0, 2), clip('video', 2, 2));
    const title = clip('text', 0, 1);
    T.addClip(p, title, { ripple: false });
    const { store, tl, tracks, scroller, contentAt, node, pointer } = mountTimeline(p);
    store.setToggle('snap', false);
    const pps = tl.pps;
    const x0 = 16 + 10;
    pointer(node(title.id), 'pointerdown', x0);
    pointer(tracks, 'pointermove', x0 + pps); // 1 s to the right
    const el = node(title.id);
    expect(el.classList.contains('dragging')).toBe(true);
    const held = el.style.transform;
    // A render while the drag is held (scroll, selection) keeps the preview.
    tl.render();
    expect(el.style.transform).toBe(held);
    expect(el.classList.contains('dragging')).toBe(true);
    // The view scrolls 2 s further under the still pointer: the clip follows.
    contentAt(-2 * pps);
    scroller.dispatchEvent(new Event('scroll'));
    expect(el.style.transform).not.toBe(held);
    pointer(tracks, 'pointerup', x0 + pps);
    expect(T.findClip(store.project, title.id).clip.start).toBe(s(3));
    expect(T.findClip(store.project, a.id).clip.start).toBe(0);
    tl.dispose();
  });

  it('leaves a pressed clip alone while playback scrolls the view before a drag starts', () => {
    const p = fixture();
    onMain(p, clip('video', 0, 2), clip('video', 2, 2));
    const title = clip('text', 0, 1);
    T.addClip(p, title, { ripple: false });
    const { store, tl, tracks, scroller, contentAt, node, pointer } = mountTimeline(p);
    const steps = store.history.undoStack.length;
    const x0 = 16 + 10;
    pointer(node(title.id), 'pointerdown', x0);
    pointer(tracks, 'pointermove', x0 + 1); // a 1 px wobble: not a drag yet
    contentAt(-tl.pps); // the view follows the playhead
    scroller.dispatchEvent(new Event('scroll'));
    expect(node(title.id).classList.contains('dragging')).toBe(false);
    pointer(tracks, 'pointerup', x0 + 1);
    expect(T.findClip(store.project, title.id).clip.start).toBe(0);
    expect(store.history.undoStack.length).toBe(steps);
    tl.dispose();
  });

  it('trims to where the pointer is after the view scrolled', () => {
    const p = fixture();
    const [a] = onMain(p, clip('video', 0, 2));
    const { store, tl, tracks, scroller, contentAt, node, pointer } = mountTimeline(p);
    store.setToggle('snap', false);
    store.select(a.id);
    tl.render();
    const pps = tl.pps;
    const edge = node(a.id).querySelector('.clip-trim.r');
    const x0 = 16 + 2 * pps;
    pointer(edge, 'pointerdown', x0);
    pointer(tracks, 'pointermove', x0 - pps); // 1 s shorter
    tl.render();
    expect(node(a.id).style.width).toBe(`${pps}px`);
    contentAt(0.5 * pps); // scrolled back half a second
    scroller.dispatchEvent(new Event('scroll'));
    pointer(tracks, 'pointerup', x0 - pps);
    expect(T.findClip(store.project, a.id).clip.duration).toBe(s(0.5));
    tl.dispose();
  });
});

describe('timeline focus', () => {
  it('a click on empty track space keeps the view where it is; Tab brings the clip into view', async () => {
    const p = fixture();
    const [a] = onMain(p, clip('video', 0, 2), clip('video', 2, 2));
    const { tl, tracks, scroller, pointer, node } = mountTimeline(p);
    scroller.scrollLeft = 3000;
    // jsdom does not scroll on focus, so check that every focus asks not to.
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    pointer(tracks, 'pointerdown', 3200, 300);
    tracks.dispatchEvent(new FocusEvent('focus')); // the browser focuses the lanes on mousedown
    pointer(tracks, 'pointerup', 3200, 300);
    expect(focus.mock.calls.length).toBeGreaterThan(0);
    for (const [opts] of focus.mock.calls) expect(opts?.preventScroll).toBe(true);
    expect(scroller.scrollLeft).toBe(3000);
    expect(document.activeElement).toBe(node(a.id));
    focus.mockRestore();
    await new Promise((r) => setTimeout(r));
    // Keyboard focus (no pointer involved) scrolls to the clip it lands on.
    document.body.focus();
    tracks.focus();
    expect(document.activeElement).toBe(node(a.id));
    expect(scroller.scrollLeft).toBe(0);
    tl.dispose();
  });
});

describe('timeline rendering', () => {
  it('only builds transition chips for the cuts in view', () => {
    const p = fixture();
    onMain(p, ...Array.from({ length: 300 }, (_, i) => clip('video', i, 1)));
    const { tl, scroller } = mountTimeline(p);
    const chips = () => tl.el.querySelectorAll('.tl-transition').length;
    const near = chips();
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(60);
    expect(tl.el.querySelectorAll('.tl-clip').length).toBeLessThan(60);
    scroller.scrollLeft = 150 * tl.pps;
    tl.render();
    expect(chips()).toBeGreaterThan(0);
    expect(chips()).toBeLessThan(60);
    tl.dispose();
  });
});

describe('timeline on phones', () => {
  it('zoom to fit keeps the playhead where it is when scrolling seeks', () => {
    const p = fixture();
    onMain(p, clip('video', 0, 10), clip('video', 10, 10));
    const { store, tl, scroller } = mountTimeline(p);
    tl.setCentered(true);
    store.seek(s(12.5));
    scroller.dispatchEvent(new Event('scroll'));
    tl.zoomBy(3);
    scroller.dispatchEvent(new Event('scroll'));
    expect(store.time).toBe(s(12.5));
    tl.zoomToFit();
    scroller.dispatchEvent(new Event('scroll'));
    expect(store.time).toBe(s(12.5));
    tl.dispose();
  });
});


describe('playhead edge auto-scroll', () => {
  function setupTimelineBounds(scroller, content, { width = 800, contentWidth = 50000 } = {}) {
    Object.defineProperty(scroller, 'scrollWidth', { value: contentWidth, configurable: true, writable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: width, configurable: true, writable: true });
    scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 400, width, height: 400, x: 0, y: 0 });
    content.getBoundingClientRect = () => {
      const l = -scroller.scrollLeft;
      return { left: l, top: 0, right: l + contentWidth, bottom: 400, width: contentWidth, height: 400, x: l, y: 0 };
    };
  }

  it('scrolls the timeline and advances time when scrubbing against the right edge', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    const { store, tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);
    scroller.scrollLeft = 0;

    const playheadCap = tl.el.querySelector('.tl-playhead-cap');
    expect(playheadCap).toBeTruthy();

    pointer(playheadCap, 'pointerdown', 790, 20);
    const initialTime = store.time;
    const initialScroll = scroller.scrollLeft;

    vi.advanceTimersByTime(50);

    expect(scroller.scrollLeft).toBeGreaterThan(initialScroll);
    expect(store.time).toBeGreaterThan(initialTime);

    pointer(playheadCap, 'pointerup', 790, 20);
    const timeAfterUp = store.time;
    const scrollAfterUp = scroller.scrollLeft;
    vi.advanceTimersByTime(50);
    expect(scroller.scrollLeft).toBe(scrollAfterUp);
    expect(store.time).toBe(timeAfterUp);

    tl.dispose();
    vi.useRealTimers();
  });

  it('scrolls the timeline and rewinds time when scrubbing against the left edge, clamping at zero', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    const { store, tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);
    scroller.scrollLeft = 500;

    const ruler = tl.el.querySelector('.tl-ruler');
    expect(ruler).toBeTruthy();

    pointer(ruler, 'pointerdown', 10, 10);
    const initialTime = store.time;
    const initialScroll = scroller.scrollLeft;

    vi.advanceTimersByTime(50);

    expect(scroller.scrollLeft).toBeLessThan(initialScroll);
    expect(store.time).toBeLessThan(initialTime);

    // Continue scrolling until time hits 0
    vi.advanceTimersByTime(2000);
    expect(scroller.scrollLeft).toBe(0);
    expect(store.time).toBe(0);

    pointer(ruler, 'pointerup', 10, 10);
    tl.dispose();
    vi.useRealTimers();
  });

  it('accelerates scroll speed progressively as pointer moves further past the edge', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    const { tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);

    const playheadCap = tl.el.querySelector('.tl-playhead-cap');

    // Gentle edge (clientX = 780, 20px inside 36px margin)
    scroller.scrollLeft = 0;
    pointer(playheadCap, 'pointerdown', 780, 20);
    vi.advanceTimersByTime(48);
    const slowDelta = scroller.scrollLeft;
    pointer(playheadCap, 'pointerup', 780, 20);

    // Aggressive edge (clientX = 850, 50px outside boundary)
    scroller.scrollLeft = 0;
    pointer(playheadCap, 'pointerdown', 850, 20);
    vi.advanceTimersByTime(48);
    const fastDelta = scroller.scrollLeft;
    pointer(playheadCap, 'pointerup', 850, 20);

    expect(fastDelta).toBeGreaterThan(slowDelta);

    tl.dispose();
    vi.useRealTimers();
  });

  it('scrolls timeline during ruler marker dragging', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    p.markers = [{ id: 'm1', time: 10 * 1000000, label: 'Intro' }];
    const { tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);
    scroller.scrollLeft = 0;

    const ruler = tl.el.querySelector('.tl-ruler');
    const markerX = 16 + (10 * tl.pps);

    pointer(ruler, 'pointerdown', markerX, 10);
    pointer(ruler, 'pointermove', 790, 10);

    const initialScroll = scroller.scrollLeft;
    vi.advanceTimersByTime(50);

    expect(scroller.scrollLeft).toBeGreaterThan(initialScroll);
    pointer(ruler, 'pointerup', 790, 10);

    tl.dispose();
    vi.useRealTimers();
  });

  it('stops auto-scrolling when window loses focus (blur)', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    const { tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);
    scroller.scrollLeft = 0;

    const playheadCap = tl.el.querySelector('.tl-playhead-cap');
    pointer(playheadCap, 'pointerdown', 790, 20);
    vi.advanceTimersByTime(50);
    const scrollBeforeBlur = scroller.scrollLeft;
    expect(scrollBeforeBlur).toBeGreaterThan(0);

    // Trigger window blur
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(100);
    expect(scroller.scrollLeft).toBe(scrollBeforeBlur);

    tl.dispose();
    vi.useRealTimers();
  });

  it('clamps rightward scrolling at maxScroll without overshooting', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 300));
    const { tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);

    // Mock scrollWidth and clientWidth on scroller
    Object.defineProperty(scroller, 'scrollWidth', { value: 1200, configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: 800, configurable: true });
    // maxScroll is 1200 - 800 = 400
    scroller.scrollLeft = 390;

    const playheadCap = tl.el.querySelector('.tl-playhead-cap');
    pointer(playheadCap, 'pointerdown', 790, 20);

    vi.advanceTimersByTime(100);
    expect(scroller.scrollLeft).toBe(400);

    pointer(playheadCap, 'pointerup', 790, 20);
    tl.dispose();
    vi.useRealTimers();
  });

  it('does not scroll rightward if timeline does not overflow (maxScroll is 0)', () => {
    vi.useFakeTimers();
    const p = fixture();
    onMain(p, clip('video', 0, 5));
    const { tl, content, scroller, pointer } = mountTimeline(p);
    setupTimelineBounds(scroller, content);

    Object.defineProperty(scroller, 'scrollWidth', { value: 800, configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: 800, configurable: true });
    scroller.scrollLeft = 0;

    const playheadCap = tl.el.querySelector('.tl-playhead-cap');
    pointer(playheadCap, 'pointerdown', 790, 20);

    vi.advanceTimersByTime(100);
    expect(scroller.scrollLeft).toBe(0);

    pointer(playheadCap, 'pointerup', 790, 20);
    tl.dispose();
    vi.useRealTimers();
  });
});
