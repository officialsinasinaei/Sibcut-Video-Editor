import { describe, it, expect, vi } from 'vitest';
import { EditorStore } from '../src/model/store.js';
import { createActions } from '../src/ui/actions.js';
import { createClipView } from '../src/ui/inspector/common.js';
import { effectParamFields, clipEffectsTab } from '../src/ui/inspector/clip-effects.js';
import { effectTab } from '../src/ui/inspector/effect.js';
import {
  baseValue,
  setBaseValue,
  dottedField,
  valueAt,
  setKey,
  keyedEffectParams,
  keyedClipEffectParams,
  splitKeyframes,
} from '../src/model/keyframes.js';
import {
  addClipEffect,
  removeClipEffect,
  moveClipEffect,
  clearClipEffects,
  activeClipEffects,
} from '../src/model/clip-effects.js';
import { animatableProps, propLabel, curveRange } from '../src/ui/timeline/keyframe-panel.js';
import { effectDefaults } from '../src/model/effect-params.js';
import { fixture, clip, s } from './helpers.js';

describe('Effect slider keyframing model', () => {
  it('reads default base values when uninitialized', () => {
    const effectClip = { type: 'effect', effect: 'blur', params: {} };
    // blur has strength (def: 50)
    expect(baseValue(effectClip, 'params.strength')).toBe(50);

    const mediaClip = {
      type: 'video',
      effects: [{ id: 'zoom-pulse', params: {} }],
    };
    // zoom-pulse has speed (def: 50) and strength (def: 50)
    expect(baseValue(mediaClip, 'fx0.speed')).toBe(50);
    expect(baseValue(mediaClip, 'fx0.strength')).toBe(50);
  });

  it('reads and writes base values via dottedField and setBaseValue', () => {
    const effectClip = { type: 'effect', effect: 'vignette' };
    setBaseValue(effectClip, 'params.strength', 75);
    expect(effectClip.params.strength).toBe(75);
    expect(baseValue(effectClip, 'params.strength')).toBe(75);

    const mediaClip = {
      type: 'video',
      effects: [{ id: 'blur', params: {} }],
    };
    setBaseValue(mediaClip, 'fx0.strength', 30);
    expect(mediaClip.effects[0].params.strength).toBe(30);
    expect(baseValue(mediaClip, 'fx0.strength')).toBe(30);

    // dottedField resolution
    const f1 = dottedField(effectClip, 'params.strength');
    expect(f1).toEqual({ obj: effectClip.params, key: 'strength' });

    const f2 = dottedField(mediaClip, 'fx0.strength');
    expect(f2).toEqual({ obj: mediaClip.effects[0].params, key: 'strength' });
  });

  it('interpolates effect clip parameters over time with keyedEffectParams', () => {
    const c = {
      type: 'effect',
      effect: 'zoom-pulse',
      params: { speed: 50, strength: 50 },
      keyframes: {
        'params.speed': [
          { t: 0, v: 20, ease: 'linear' },
          { t: s(2), v: 80, ease: 'linear' },
        ],
      },
    };

    // At 0s
    expect(keyedEffectParams(c, 0).speed).toBe(20);
    // At 1s (halfway)
    expect(keyedEffectParams(c, s(1)).speed).toBe(50);
    // At 2s
    expect(keyedEffectParams(c, s(2)).speed).toBe(80);
    // Unkeyed parameter keeps base value
    expect(keyedEffectParams(c, s(1)).strength).toBe(50);
  });

  it('interpolates clip effect parameters over time with keyedClipEffectParams and activeClipEffects', () => {
    const c = {
      type: 'video',
      effects: [
        { id: 'blur', params: { strength: 0 } },
      ],
      keyframes: {
        'fx0.strength': [
          { t: 0, v: 0, ease: 'linear' },
          { t: s(1), v: 60, ease: 'linear' },
        ],
      },
    };

    // At t=0, strength is 0, so blur with zeroOff is off
    const activeAt0 = activeClipEffects(c, 0);
    expect(activeAt0).toHaveLength(0);

    // At t=0.5s, strength is 30, so blur is active
    const activeAtHalf = activeClipEffects(c, s(0.5));
    expect(activeAtHalf).toHaveLength(1);
    expect(activeAtHalf[0].params.strength).toBe(30);

    // At t=1s, strength is 60
    const activeAt1 = activeClipEffects(c, s(1));
    expect(activeAt1).toHaveLength(1);
    expect(activeAt1[0].params.strength).toBe(60);
  });

  it('preserves shared keyframes and prunes obsolete ones when switching effects', () => {
    const p = fixture();
    const eff = {
      id: 'eff-1',
      type: 'effect',
      effect: 'zoom-pulse',
      start: 0,
      duration: s(4),
      params: { speed: 60, strength: 70 },
      keyframes: {
        'params.speed': [{ t: 0, v: 30, ease: 'linear' }],
        'params.strength': [{ t: 0, v: 40, ease: 'linear' }],
      },
    };
    p.tracks[0].clips.push(eff);
    const store = new EditorStore(p);
    const ctx = { store };
    ctx.actions = createActions(ctx);
    const view = createClipView(ctx, eff.id);

    // Render effectTab and change effect from zoom-pulse to tilt-shift
    // zoom-pulse has speed and strength.
    // tilt-shift has strength, focus, size.
    // So params.strength should be kept; params.speed should be pruned!
    const tab = effectTab(view);
    const select = tab.querySelector('select');
    select.value = 'tilt-shift';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const updated = store.project.tracks[0].clips[0];
    expect(updated.effect).toBe('tilt-shift');
    expect(updated.keyframes['params.strength']).toBeDefined();
    expect(updated.keyframes['params.speed']).toBeUndefined();
  });

  it('updates and re-indexes keyframes when clip effects are removed, moved or cleared', () => {
    const c = {
      type: 'video',
      effects: [
        { id: 'blur', params: { strength: 50 } },
        { id: 'shake', params: { speed: 40, strength: 50 } },
        { id: 'glow', params: { strength: 60 } },
      ],
      keyframes: {
        'fx0.strength': [{ t: 0, v: 10, ease: 'linear' }],
        'fx1.speed': [{ t: 0, v: 25, ease: 'linear' }],
        'fx2.strength': [{ t: 0, v: 80, ease: 'linear' }],
      },
    };

    // 1. Move effect 0 (blur) to position 2
    // New order: [shake (old 1 -> new 0), glow (old 2 -> new 1), blur (old 0 -> new 2)]
    moveClipEffect(c, 0, 2);
    expect(c.effects.map((e) => e.id)).toEqual(['shake', 'glow', 'blur']);
    expect(c.keyframes['fx0.speed']).toEqual([{ t: 0, v: 25, ease: 'linear' }]);
    expect(c.keyframes['fx1.strength']).toEqual([{ t: 0, v: 80, ease: 'linear' }]);
    expect(c.keyframes['fx2.strength']).toEqual([{ t: 0, v: 10, ease: 'linear' }]);

    // 2. Remove effect at index 1 (glow)
    // New order: [shake (idx 0), blur (idx 1)]
    removeClipEffect(c, 1);
    expect(c.effects.map((e) => e.id)).toEqual(['shake', 'blur']);
    expect(c.keyframes['fx0.speed']).toEqual([{ t: 0, v: 25, ease: 'linear' }]);
    expect(c.keyframes['fx1.strength']).toEqual([{ t: 0, v: 10, ease: 'linear' }]);
    expect(c.keyframes['fx2.strength']).toBeUndefined();

    // 3. Clear all clip effects
    clearClipEffects(c);
    expect(c.effects).toBeUndefined();
    expect(c.keyframes).toBeUndefined();
  });

  it('exposes animatable effect properties and labels in keyframe panel', () => {
    const effClip = {
      type: 'effect',
      effect: 'tilt-shift',
      params: effectDefaults('tilt-shift'),
    };
    const props = animatableProps(effClip);
    expect(props).toEqual(['params.strength', 'params.focus', 'params.size']);
    expect(propLabel('params.strength', effClip)).toBe('Blur');
    expect(propLabel('params.focus', effClip)).toBe('Focus height');

    const mediaClip = {
      type: 'video',
      effects: [
        { id: 'blur', params: effectDefaults('blur') },
        { id: 'shake', params: effectDefaults('shake') },
      ],
    };
    const mediaProps = animatableProps(mediaClip);
    expect(mediaProps).toContain('fx0.strength');
    expect(mediaProps).toContain('fx1.speed');
    expect(mediaProps).toContain('fx1.strength');
    expect(propLabel('fx0.strength', mediaClip)).toBe('Soft blur: Amount');
    expect(propLabel('fx1.speed', mediaClip)).toBe('Camera shake: Speed');
  });

  it('toggles and animates keyframes through the effect slider UI controls', () => {
    const p = fixture();
    const eff = {
      id: 'eff-test',
      type: 'effect',
      effect: 'blur',
      start: 0,
      duration: s(4),
      params: { strength: 40 },
    };
    p.tracks[0].clips.push(eff);
    const store = new EditorStore(p);
    const ctx = { store };
    ctx.actions = createActions(ctx);
    const view = createClipView(ctx, eff.id);

    const fields = effectParamFields(view, {
      id: 'blur',
      keyPrefix: 'params',
      getParams: (x) => x.params,
      setParam: (x, k, v) => { x.params[k] = v; },
    });

    const sliderEl = fields[0];
    const toggleBtn = sliderEl.querySelector('.kf-btn');
    expect(toggleBtn).toBeDefined();

    // Playhead at t = 1s
    store.seek(s(1));
    // Click keyframe toggle diamond to add keyframe at playhead
    toggleBtn.click();

    let clipInStore = store.project.tracks[0].clips[0];
    expect(clipInStore.keyframes).toBeDefined();
    expect(clipInStore.keyframes['params.strength']).toHaveLength(1);
    expect(clipInStore.keyframes['params.strength'][0].t).toBe(s(1));
    expect(clipInStore.keyframes['params.strength'][0].v).toBe(40);

    // Animate value at t = 2s
    store.seek(s(2));
    view.animate('params.strength', 85);
    clipInStore = store.project.tracks[0].clips[0];
    expect(clipInStore.keyframes['params.strength']).toHaveLength(2);
    expect(clipInStore.keyframes['params.strength'][1].t).toBe(s(2));
    expect(clipInStore.keyframes['params.strength'][1].v).toBe(85);

    // ValueOf at t = 1.5s should interpolate halfway between 40 and 85 -> 62.5
    store.seek(s(1.5));
    expect(view.valueOf('params.strength')).toBeCloseTo(62.5);

    // Jump to prev keyframe
    view.jumpKey('params.strength', -1);
    expect(store.time).toBe(s(1));

    // Jump to next keyframe
    view.jumpKey('params.strength', 1);
    expect(store.time).toBe(s(2));

    // Jump past last keyframe stays at s(2)
    view.jumpKey('params.strength', 1);
    expect(store.time).toBe(s(2));

    // Toggling off the keyframe at s(2) leaves 1 keyframe at s(1)
    toggleBtn.click();
    clipInStore = store.project.tracks[0].clips[0];
    expect(clipInStore.keyframes['params.strength']).toHaveLength(1);
    expect(clipInStore.keyframes['params.strength'][0].t).toBe(s(1));

    // Seek to s(1) and toggle off the ONLY remaining keyframe
    store.seek(s(1));
    toggleBtn.click();
    clipInStore = store.project.tracks[0].clips[0];
    // The keyframes object has deleted the property
    expect(clipInStore.keyframes?.['params.strength']).toBeUndefined();
    // But baseValue was preserved from that keyframe value
    expect(clipInStore.params.strength).toBe(40);
  });

  it('splits keyframes continuously across cuts when splitting an effect clip', () => {
    const kf = {
      'params.speed': [
        { t: 0, v: 10, ease: 'linear' },
        { t: s(4), v: 90, ease: 'linear' },
      ],
    };
    const [left, right] = splitKeyframes(kf, s(2));
    // At cut (t = 2s), speed was 50
    expect(left['params.speed']).toHaveLength(2);
    expect(left['params.speed'][1].t).toBe(s(2));
    expect(left['params.speed'][1].v).toBe(50);

    expect(right['params.speed']).toHaveLength(2);
    expect(right['params.speed'][0].t).toBe(0);
    expect(right['params.speed'][0].v).toBe(50);
    expect(right['params.speed'][1].t).toBe(s(2));
    expect(right['params.speed'][1].v).toBe(90);
  });

  it('clamps effect parameters within their valid bounds', () => {
    const c = { type: 'effect', effect: 'vignette' }; // strength 0..100
    setBaseValue(c, 'params.strength', 150);
    expect(c.params.strength).toBe(100);

    setBaseValue(c, 'params.strength', -20);
    expect(c.params.strength).toBe(0);
  });

  it('safely handles null or undefined clips in baseValue and setBaseValue', () => {
    expect(baseValue(null, 'params.strength')).toBe(0);
    expect(baseValue(undefined, 'fx0.speed')).toBe(0);
    expect(() => setBaseValue(null, 'params.strength', 50)).not.toThrow();
    expect(() => setBaseValue(undefined, 'fx0.speed', 50)).not.toThrow();
  });

  it('clamps interpolated effect parameters when using overshooting easings or out-of-bounds keys', () => {
    const effectClip = {
      type: 'effect',
      effect: 'blur', // strength 0..100
      params: { strength: 50 },
      keyframes: {
        'params.strength': [
          { t: 0, v: 95, ease: 'overshoot' },
          { t: s(1), v: 100, ease: 'linear' },
        ],
      },
    };
    // At t=0.5, overshoot easing pushes value past 100; keyedEffectParams should clamp to 100
    const val = keyedEffectParams(effectClip, s(0.5)).strength;
    expect(val).toBeLessThanOrEqual(100);
    expect(val).toBeGreaterThanOrEqual(0);

    const mediaClip = {
      type: 'video',
      effects: [{ id: 'blur', params: { strength: 50 } }],
      keyframes: {
        'fx0.strength': [
          { t: 0, v: 0, ease: 'anticipate' },
          { t: s(1), v: 50, ease: 'linear' },
        ],
      },
    };
    // Anticipate easing dips below 0; keyedClipEffectParams should clamp to 0
    const clipVal = keyedClipEffectParams(mediaClip, 0, s(0.2)).strength;
    expect(clipVal).toBeGreaterThanOrEqual(0);
  });

  it('clamps preserved keyframe values to new parameter bounds when switching effect types', () => {
    const p = fixture();
    const eff = {
      id: 'eff-angle-test',
      type: 'effect',
      effect: 'slow-push', // angle: 0..360
      start: 0,
      duration: s(4),
      params: { angle: 270, strength: 40 },
      keyframes: {
        'params.angle': [
          { t: 0, v: 300, ease: 'linear' },
          { t: s(2), v: 90, ease: 'linear' },
        ],
        'params.strength': [
          { t: 0, v: 40, ease: 'linear' },
        ],
      },
    };
    p.tracks[0].clips.push(eff);
    const store = new EditorStore(p);
    const ctx = { store };
    ctx.actions = createActions(ctx);
    const view = createClipView(ctx, eff.id);

    // Switch to whip-blur where angle is 0..180
    const tab = effectTab(view);
    const select = tab.querySelector('select');
    select.value = 'whip-blur';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const updated = store.project.tracks[0].clips[0];
    expect(updated.effect).toBe('whip-blur');
    // angle keyframe at t=0 was 300; for whip-blur max is 180, so it must be clamped to 180
    expect(updated.keyframes['params.angle'][0].v).toBe(180);
    expect(updated.keyframes['params.angle'][1].v).toBe(90);
  });

  it('computes curveRange safely on clips without keyframes (c.keyframes undefined)', () => {
    const effClip = {
      type: 'effect',
      effect: 'blur',
      duration: s(4),
      params: { strength: 50 },
    };
    const range = curveRange(effClip, 'params.strength');
    expect(range.lo).toBeDefined();
    expect(range.hi).toBeDefined();
    expect(range.hi).toBeGreaterThan(range.lo);
  });

  it('re-renders clip effects inspector properly when moving effects of identical types', () => {
    const p = fixture();
    const media = {
      id: 'media-identical-fx',
      type: 'video',
      start: 0,
      duration: s(4),
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      effects: [
        { id: 'blur', params: { strength: 20 } },
        { id: 'blur', params: { strength: 80 } },
      ],
      keyframes: {
        'fx0.strength': [{ t: 0, v: 20, ease: 'linear' }],
        'fx1.strength': [{ t: 0, v: 80, ease: 'linear' }],
      },
    };
    p.tracks[0].clips.push(media);
    const store = new EditorStore(p);
    const ctx = { store };
    ctx.actions = createActions(ctx);
    const view = createClipView(ctx, media.id);

    const tab = clipEffectsTab(view);
    const itemsBefore = tab.querySelectorAll('.clipfx-item');
    expect(itemsBefore).toHaveLength(2);

    // Move effect 0 down to index 1
    const moveDownBtn = itemsBefore[0].querySelector('[data-act="down"]');
    moveDownBtn.click();

    // Check that store reindexed keyframes and swapped effects
    const updated = store.project.tracks[0].clips[0];
    expect(updated.effects[0].params.strength).toBe(80);
    expect(updated.effects[1].params.strength).toBe(20);
    expect(updated.keyframes['fx0.strength'][0].v).toBe(80);
    expect(updated.keyframes['fx1.strength'][0].v).toBe(20);

    // Inspector should have re-rendered with new order
    const itemsAfter = tab.querySelectorAll('.clipfx-item');
    expect(itemsAfter).toHaveLength(2);
  });

  it('clamps values in setAnimatable when adding keyframes to existing keys', () => {
    const p = fixture();
    const eff = {
      id: 'eff-clamp-key',
      type: 'effect',
      effect: 'vignette', // strength: 0..100
      start: 0,
      duration: s(4),
      params: { strength: 50 },
      keyframes: {
        'params.strength': [{ t: 0, v: 50, ease: 'linear' }],
      },
    };
    p.tracks[0].clips.push(eff);
    const store = new EditorStore(p);
    const actions = createActions({ store });

    store.seek(s(2));
    // Try to set value to 250 (out of bounds)
    actions.setAnimatable(eff.id, 'params.strength', 250);

    const updated = store.project.tracks[0].clips[0];
    const keyAt2 = updated.keyframes['params.strength'].find((k) => k.t === s(2));
    expect(keyAt2).toBeDefined();
    expect(keyAt2.v).toBe(100);
  });

  it('preserves continuity and easing when splitting keyframes with custom cubic curves', () => {
    const kf = {
      'params.speed': [
        { t: 0, v: 20, ease: 'cubic(0.25,0.1,0.25,1)' },
        { t: s(4), v: 80, ease: 'linear' },
      ],
    };
    const [left, right] = splitKeyframes(kf, s(2));
    expect(left['params.speed']).toHaveLength(2);
    expect(left['params.speed'][0].ease).toBe('cubic(0.25,0.1,0.25,1)');
    expect(right['params.speed']).toHaveLength(2);
    expect(right['params.speed'][0].t).toBe(0);
    expect(right['params.speed'][0].v).toBe(left['params.speed'][1].v);
    expect(right['params.speed'][1].t).toBe(s(2));
    expect(right['params.speed'][1].v).toBe(80);
  });

  it('correctly remaps keyframes under rapid interleaved clip effect reordering and removal', () => {
    const c = {
      type: 'video',
      effects: [
        { id: 'blur', params: { strength: 10 } },
        { id: 'shake', params: { speed: 20 } },
        { id: 'glow', params: { strength: 30 } },
        { id: 'vignette', params: { strength: 40 } },
      ],
      keyframes: {
        'fx0.strength': [{ t: 0, v: 10 }],
        'fx1.speed': [{ t: 0, v: 20 }],
        'fx2.strength': [{ t: 0, v: 30 }],
        'fx3.strength': [{ t: 0, v: 40 }],
      },
    };

    // Move fx3 (vignette) to position 0
    moveClipEffect(c, 3, 0);
    // Order now: vignette(0), blur(1), shake(2), glow(3)
    expect(c.effects.map((e) => e.id)).toEqual(['vignette', 'blur', 'shake', 'glow']);
    expect(c.keyframes['fx0.strength'][0].v).toBe(40);
    expect(c.keyframes['fx1.strength'][0].v).toBe(10);
    expect(c.keyframes['fx2.speed'][0].v).toBe(20);
    expect(c.keyframes['fx3.strength'][0].v).toBe(30);

    // Remove shake (at index 2)
    removeClipEffect(c, 2);
    // Order now: vignette(0), blur(1), glow(2)
    expect(c.effects.map((e) => e.id)).toEqual(['vignette', 'blur', 'glow']);
    expect(c.keyframes['fx0.strength'][0].v).toBe(40);
    expect(c.keyframes['fx1.strength'][0].v).toBe(10);
    expect(c.keyframes['fx2.strength'][0].v).toBe(30);
    expect(c.keyframes['fx3.strength']).toBeUndefined();

    // Move blur (at index 1) to position 2 (after glow)
    moveClipEffect(c, 1, 2);
    // Order now: vignette(0), glow(1), blur(2)
    expect(c.effects.map((e) => e.id)).toEqual(['vignette', 'glow', 'blur']);
    expect(c.keyframes['fx0.strength'][0].v).toBe(40);
    expect(c.keyframes['fx1.strength'][0].v).toBe(30);
    expect(c.keyframes['fx2.strength'][0].v).toBe(10);
  });
});


