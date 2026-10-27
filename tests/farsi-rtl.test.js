import { describe, it, expect } from 'vitest';
import { isRTL, shapeArabicRun, segmentBidi, layoutRtlLine, PERSIAN_SCRAMBLE } from '../src/engine/rtl-shaper.js';
import { lineGlyphs, indexGlyphs, wrapLines } from '../src/engine/text-layout.js';
import { scrambleChar, glyphState } from '../src/engine/text-anim.js';
import { FONTS } from '../src/model/catalog.js';

describe('Farsi / Persian RTL Shaper', () => {
  it('detects RTL Persian text accurately', () => {
    expect(isRTL('سلام')).toBe(true);
    expect(isRTL('سلام و درود')).toBe(true);
    expect(isRTL('پروژه ویدیو')).toBe(true);
    expect(isRTL('Hello World')).toBe(false);
    expect(isRTL('123456')).toBe(false);
  });

  it('correctly shapes Persian cursive connections', () => {
    // "بستنی" (All dual joiners: Initial, Medial, Medial, Medial, Final)
    const bastani = shapeArabicRun('بستنی');
    expect(bastani.map((g) => g.ch.charCodeAt(0).toString(16))).toEqual([
      'fe91', // Initial Beh
      'feb4', // Medial Seen
      'fe98', // Medial Teh
      'fee8', // Medial Noon
      'fbfd', // Final Farsi Yeh
    ]);
  });

  it('correctly handles right-joining Persian letters', () => {
    // "درود" (Dal, Reh, Waw, Dal - all right-joiners, none joins forward)
    const dorood = shapeArabicRun('درود');
    expect(dorood.map((g) => g.ch.charCodeAt(0).toString(16))).toEqual([
      'fea9', // Isolated Dal
      'fead', // Isolated Reh
      'feed', // Isolated Waw
      'fea9', // Isolated Dal
    ]);
  });

  it('correctly forms Lam-Alef ligatures', () => {
    // "سلام" (Seen initial + Lam-Alef final ligature + Meem isolated)
    const salam = shapeArabicRun('سلام');
    expect(salam.map((g) => g.ch.charCodeAt(0).toString(16))).toEqual([
      'feb3', // Initial Seen
      'fefc', // Final Lam-Alef ligature
      'fee1', // Isolated Meem
    ]);
  });

  it('respects Persian Zero-Width Non-Joiner (ZWNJ)', () => {
    // "می‌شود": Meem initial + Yeh final + ZWNJ + Sheen initial + Waw final (connected to Sheen) + Dal isolated
    const mishavad = shapeArabicRun('می\u200Cشود');
    expect(mishavad.map((g) => g.ch.charCodeAt(0).toString(16))).toEqual([
      'fee3', // Initial Meem
      'fbfd', // Final Farsi Yeh (does NOT connect to Sheen because of ZWNJ)
      'feb7', // Initial Sheen
      'feee', // Final Waw (connected to Sheen)
      'fea9', // Isolated Dal
    ]);
  });

  it('correctly positions RTL glyphs visually from right to left in reading order', () => {
    const fakeMeasure = () => 10;
    const glyphs = layoutRtlLine('سلام و درود', fakeMeasure, fakeMeasure);

    // Reading order: glyph 0 is Seen (first letter read, at the far right)
    expect(glyphs[0].ch).toBe('\uFEB3'); // Initial Seen
    expect(glyphs[0].x).toBe(90); // rightmost

    // Last letter read is Dal (at the far left)
    expect(glyphs[glyphs.length - 1].ch).toBe('\uFEA9'); // Isolated Dal
    expect(glyphs[glyphs.length - 1].x).toBe(0); // leftmost
  });

  it('handles mixed RTL and LTR numbers properly', () => {
    const fakeMeasure = () => 10;
    const glyphs = layoutRtlLine('سلام 2026 علی', fakeMeasure, fakeMeasure);

    // "2026" should flow left-to-right internally
    const two1 = glyphs.find((g) => g.ch === '2');
    const zero = glyphs.find((g) => g.ch === '0');
    const six = glyphs.find((g) => g.ch === '6');

    expect(two1.x).toBeLessThan(zero.x);
    expect(zero.x).toBeLessThan(six.x);
  });

  it('integrates with lineGlyphs seamlessly', () => {
    const fakeMeasure = (str) => str.length * 10;
    const ltrGlyphs = lineGlyphs('Hello', fakeMeasure, fakeMeasure);
    expect(ltrGlyphs[0].ch).toBe('H');
    expect(ltrGlyphs[0].x).toBe(0); // LTR starts at 0

    const rtlGlyphs = lineGlyphs('سلام', fakeMeasure, fakeMeasure);
    expect(rtlGlyphs[0].ch).toBe('\uFEB3'); // Initial Seen
    expect(rtlGlyphs[0].x).toBeGreaterThan(0); // RTL starts at right
  });

  it('scrambles Persian characters with Persian letters during decode effect', () => {
    const scrambled = scrambleChar('س', 0, 1);
    expect(PERSIAN_SCRAMBLE).toContain(scrambled);
  });

  it('supports animations on Persian glyphs in proper reading order', () => {
    const fakeMeasure = () => 10;
    const glyphs = lineGlyphs('سلام', fakeMeasure, fakeMeasure);
    const lines = [{ y: 50, glyphs }];
    const totals = indexGlyphs(lines);

    expect(totals.chars).toBe(3);
    expect(glyphs[0].ci).toBe(0); // Initial Seen is first letter animated
    expect(glyphs[1].ci).toBe(1); // Lam-Alef is second
    expect(glyphs[2].ci).toBe(2); // Meem is third

    // Letters rise animation at early progress (p = 0.2)
    const st0 = glyphState([{ id: 'letters-rise', p: 0.2 }], glyphs[0], totals, { size: 64 });
    const st2 = glyphState([{ id: 'letters-rise', p: 0.2 }], glyphs[2], totals, { size: 64 });

    // Glyph 0 has progressed further than glyph 2
    expect(st0.alpha).toBeGreaterThanOrEqual(st2.alpha);
  });

  it('includes all 10 Farsi fonts in catalog', () => {
    const farsiFontIds = [
      'Vazirmatn',
      'Sahel',
      'Shabnam',
      'Samim',
      'Tanha',
      'Parastoo',
      'Gandom',
      'Estedad',
      'Lalezar',
      'Amiri',
    ];

    for (const id of farsiFontIds) {
      const found = FONTS.find((f) => f.id === id);
      expect(found).toBeDefined();
      expect(found.label).toContain('('); // Contains Persian name
      expect(found.css).toContain(id);
    }
  });
});
