import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EFFECT_CATEGORIES, FILTER_CATEGORIES, TRANSITION_CATEGORIES } from '../src/model/catalog.js';
import {
  PREVIEW_ASSETS,
  lookPreview,
  hoverAnimate,
  gradePreview,
  loadPreviewImage,
} from '../src/ui/panels/previews.js';

// jsdom has no WebGL: stand-in compositor for preview tests
vi.mock('../src/engine/compositor.js', () => ({
  Compositor: class {
    render() {}
    resize() {}
  },
}));

describe('Category Preview Assets & Mapping', () => {
  const publicPreviewsDir = path.resolve(__dirname, '../public/previews');

  it('all mapped preview files exist in public/previews/', () => {
    expect(fs.existsSync(publicPreviewsDir)).toBe(true);
    for (const [key, filename] of Object.entries(PREVIEW_ASSETS)) {
      const filePath = path.join(publicPreviewsDir, filename);
      expect(fs.existsSync(filePath), `Asset for ${key} (${filename}) should exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Asset ${filename} should have non-zero size`).toBeGreaterThan(1000);
      // All thumbnails should be lightweight (under 100KB)
      expect(stat.size, `Asset ${filename} should be optimized under 100KB`).toBeLessThan(100_000);
    }
  });

  it('covers all EFFECT_CATEGORIES', () => {
    for (const cat of EFFECT_CATEGORIES) {
      const key = `fx:${cat.id}`;
      expect(PREVIEW_ASSETS[key], `Effects category ${cat.id} should have a preview asset`).toBeDefined();
    }
  });

  it('covers all FILTER_CATEGORIES', () => {
    for (const cat of FILTER_CATEGORIES) {
      const key = `filter:${cat.id}`;
      expect(PREVIEW_ASSETS[key], `Filter category ${cat.id} should have a preview asset`).toBeDefined();
    }
  });

  it('covers all TRANSITION_CATEGORIES with dual scenes (from A and to B)', () => {
    for (const cat of TRANSITION_CATEGORIES) {
      const keyA = `trans:a:${cat.id}`;
      const keyB = `trans:b:${cat.id}`;
      expect(PREVIEW_ASSETS[keyA], `Transition category ${cat.id} should have an A scene preview`).toBeDefined();
      expect(PREVIEW_ASSETS[keyB], `Transition category ${cat.id} should have a B scene preview`).toBeDefined();
      expect(PREVIEW_ASSETS[keyA], `Scene A and Scene B should be distinct`).not.toBe(PREVIEW_ASSETS[keyB]);
    }
  });

  it('covers Color sections (layer, luts, presets)', () => {
    expect(PREVIEW_ASSETS['color:layer']).toBeDefined();
    expect(PREVIEW_ASSETS['color:luts']).toBeDefined();
    expect(PREVIEW_ASSETS['color:presets']).toBeDefined();
  });

  it('renders lookPreview with category options without error', () => {
    const fxCanvas = lookPreview('effect', 'blur', { cat: 'basic' });
    expect(fxCanvas.tagName).toBe('CANVAS');
    expect(fxCanvas.width).toBe(192);
    expect(fxCanvas.height).toBe(108);

    const filterCanvas = lookPreview('filter', 'vivid', { cat: 'featured' });
    expect(filterCanvas.tagName).toBe('CANVAS');

    const transCanvas = lookPreview('transition', 'mix', { cat: 'basic', progress: 0.5 });
    expect(transCanvas.tagName).toBe('CANVAS');
  });

  it('renders gradePreview with category options without error', () => {
    const canvas = gradePreview({}, null, { cat: 'luts' });
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.width).toBe(192);
    expect(canvas.height).toBe(108);
  });

  it('attaches hoverAnimate with category option without error', () => {
    const tile = document.createElement('div');
    const canvas = document.createElement('canvas');
    tile.appendChild(canvas);
    document.body.appendChild(tile);

    expect(() => {
      hoverAnimate(tile, 'effect', 'zoom-pulse', { cat: 'motion' });
      hoverAnimate(tile, 'filter', 'teal-orange', { cat: 'cinematic' });
      hoverAnimate(tile, 'transition', 'slide-left', { cat: 'slide' });
    }).not.toThrow();

    tile.remove();
  });

  it('getRequiredAssetKeys returns all required assets including dual transition scenes', async () => {
    const { getRequiredAssetKeys } = await import('../src/ui/panels/previews.js');
    expect(getRequiredAssetKeys('transition', 'slide', 'slide-left')).toEqual([
      'trans:a:slide',
      'trans:b:slide',
    ]);
    expect(getRequiredAssetKeys('effect', 'basic', 'blur')).toEqual(['fx:basic']);
    expect(getRequiredAssetKeys('effect', 'body', 'body-outline')).toEqual(['fx:body']);
    expect(getRequiredAssetKeys('filter', 'portrait', 'soft-skin')).toEqual(['filter:portrait']);
    expect(getRequiredAssetKeys('color', 'luts', null)).toEqual(['color:luts']);
  });

  it('handles unknown categories gracefully by falling back to defaults', () => {
    expect(() => {
      lookPreview('effect', 'unknown-effect', { cat: 'non-existent' });
      lookPreview('filter', 'unknown-filter', { cat: 'non-existent' });
      lookPreview('transition', 'unknown-trans', { cat: 'non-existent' });
      gradePreview({}, null, { cat: 'non-existent' });
    }).not.toThrow();
  });
});
