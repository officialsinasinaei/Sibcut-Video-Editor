/**
 * Persian / Arabic text shaping and Bidirectional (BiDi) layout engine.
 *
 * In standard Canvas 2D, rendering text glyph-by-glyph or letter-by-letter
 * causes Arabic/Persian letters to become disconnected into isolated shapes
 * and placed from left to right (reversed).
 *
 * This module provides:
 *  1. Contextual Arabic/Persian letter shaping using Unicode Presentation Forms-B & Forms-A
 *     (Isolated, Initial, Medial, Final) including Persian letters (پ چ ژ ک گ ی ۀ).
 *  2. Lam-Alef ligature formation (لا, لآ, لأ, لإ).
 *  3. Zero-Width Non-Joiner (ZWNJ / نیم‌فاصله) handling.
 *  4. Bidirectional (BiDi) run segmentation and visual coordinate layout so that
 *     all letters stay connected, words read from right to left, and mixed English/numbers
 *     flow in their natural direction.
 *  5. Proper logical reading-order index assignment so animations (stagger, letters-rise,
 *     typewriter, word-pop, etc.) animate seamlessly from right to left.
 */

export const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const LTR_REGEX = /[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF]/;

/** Detect if string contains RTL characters */
export function isRTL(text) {
  return RTL_REGEX.test(String(text || ''));
}

/** Persian letters used for decode scrambling */
export const PERSIAN_SCRAMBLE = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';

// Joining types:
// 'D': Dual-joining (can connect to preceding and following)
// 'R': Right-joining (can connect only to preceding / right)
// 'N': Non-joining (never connects)
// 'U': Transparent (diacritics / tashkeel - ignored for connectivity)

const FORMS = {
  // Hamza & Alef variants
  '\u0621': { t: 'N', f: ['\uFE80', '\uFE80', '\uFE80', '\uFE80'] }, // ء
  '\u0622': { t: 'R', f: ['\uFE81', '\uFE82', '\uFE81', '\uFE82'] }, // آ
  '\u0623': { t: 'R', f: ['\uFE83', '\uFE84', '\uFE83', '\uFE84'] }, // أ
  '\u0624': { t: 'R', f: ['\uFE85', '\uFE86', '\uFE85', '\uFE86'] }, // ؤ
  '\u0625': { t: 'R', f: ['\uFE87', '\uFE88', '\uFE87', '\uFE88'] }, // إ
  '\u0626': { t: 'D', f: ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'] }, // ئ
  '\u0627': { t: 'R', f: ['\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'] }, // ا

  // Basic Dual Joiners
  '\u0628': { t: 'D', f: ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'] }, // ب
  '\u0629': { t: 'R', f: ['\uFE93', '\uFE94', '\uFE93', '\uFE94'] }, // ة
  '\u062A': { t: 'D', f: ['\uFE95', '\uFE96', '\uFE97', '\uFE98'] }, // ت
  '\u062B': { t: 'D', f: ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'] }, // ث
  '\u062C': { t: 'D', f: ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'] }, // ج
  '\u062D': { t: 'D', f: ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'] }, // ح
  '\u062E': { t: 'D', f: ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'] }, // خ

  // Dal, Thal, Reh, Zain
  '\u062F': { t: 'R', f: ['\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'] }, // د
  '\u0630': { t: 'R', f: ['\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'] }, // ذ
  '\u0631': { t: 'R', f: ['\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'] }, // ر
  '\u0632': { t: 'R', f: ['\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'] }, // ز

  // Seen, Sheen, Sad, Dad, Tah, Zah, Ain, Ghain
  '\u0633': { t: 'D', f: ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'] }, // س
  '\u0634': { t: 'D', f: ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'] }, // ش
  '\u0635': { t: 'D', f: ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'] }, // ص
  '\u0636': { t: 'D', f: ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'] }, // ض
  '\u0637': { t: 'D', f: ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'] }, // ط
  '\u0638': { t: 'D', f: ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'] }, // ظ
  '\u0639': { t: 'D', f: ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'] }, // ع
  '\u063A': { t: 'D', f: ['\uFECD', '\uFECE', '\uFECF', '\uFED0'] }, // غ
  '\u0640': { t: 'D', f: ['\u0640', '\u0640', '\u0640', '\u0640'] }, // Tatweel ـ

  // Feh, Qaf, Kaf, Lam, Meem, Noon, Heh, Waw, Yeh
  '\u0641': { t: 'D', f: ['\uFED1', '\uFED2', '\uFED3', '\uFED4'] }, // ف
  '\u0642': { t: 'D', f: ['\uFED5', '\uFED6', '\uFED7', '\uFED8'] }, // ق
  '\u0643': { t: 'D', f: ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'] }, // Arabic ك
  '\u0644': { t: 'D', f: ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'] }, // ل
  '\u0645': { t: 'D', f: ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'] }, // م
  '\u0646': { t: 'D', f: ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'] }, // ن
  '\u0647': { t: 'D', f: ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'] }, // ه
  '\u0648': { t: 'R', f: ['\uFEED', '\uFEEE', '\uFEED', '\uFEEE'] }, // و
  '\u0649': { t: 'D', f: ['\uFEEF', '\uFEF0', '\uFEF3', '\uFEF4'] }, // ى
  '\u064A': { t: 'D', f: ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'] }, // Arabic ي

  // Persian Specific Letters
  '\u067E': { t: 'D', f: ['\uFB56', '\uFB57', '\uFB58', '\uFB59'] }, // پ
  '\u0686': { t: 'D', f: ['\uFB7A', '\uFB7B', '\uFB7C', '\uFB7D'] }, // چ
  '\u0698': { t: 'R', f: ['\uFB8A', '\uFB8B', '\uFB8A', '\uFB8B'] }, // ژ
  '\u06A9': { t: 'D', f: ['\uFB8E', '\uFB8F', '\uFB90', '\uFB91'] }, // ک (Persian Keheh)
  '\u06AF': { t: 'D', f: ['\uFB92', '\uFB93', '\uFB94', '\uFB95'] }, // گ
  '\u06CC': { t: 'D', f: ['\uFBFC', '\uFBFD', '\uFBFE', '\uFBFF'] }, // ی (Persian Farsi Yeh)
  '\u06C0': { t: 'R', f: ['\uFBA4', '\uFBA5', '\uFBA4', '\uFBA5'] }, // ۀ (Heh with yeh above)
};

// Lam-Alef Ligatures: [Isolated, Final]
const LAM_ALEF = {
  '\u0627': ['\uFEFB', '\uFEFC'], // لا
  '\u0622': ['\uFEF5', '\uFEF6'], // لآ
  '\u0623': ['\uFEF7', '\uFEF8'], // لأ
  '\u0625': ['\uFEF9', '\uFEFA'], // لإ
};

// Diacritics (transparent to joining)
const DIACRITICS = new Set([
  '\u064B', '\u064C', '\u064D', '\u064E', '\u064F', '\u0650', '\u0651', '\u0652',
  '\u0653', '\u0654', '\u0655', '\u0670',
]);

function isTransparent(ch) {
  return DIACRITICS.has(ch);
}

/**
 * Shape an Arabic/Persian text segment into shaped glyphs (Presentation Forms).
 * Returns array of { ch, rawIndex, rawLen }.
 */
export function shapeArabicRun(text) {
  const chars = [...text];
  const out = [];

  // Helper to find previous non-transparent character
  const findPrev = (from) => {
    for (let k = from - 1; k >= 0; k--) {
      if (chars[k] === '\u200C') return null; // ZWNJ breaks joining
      if (!isTransparent(chars[k])) return { char: chars[k], index: k };
    }
    return null;
  };

  // Helper to find next non-transparent character
  const findNext = (from) => {
    for (let k = from + 1; k < chars.length; k++) {
      if (chars[k] === '\u200C') return null; // ZWNJ breaks joining
      if (!isTransparent(chars[k])) return { char: chars[k], index: k };
    }
    return null;
  };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Skip ZWNJ itself in visual output, but it was already used as joining barrier
    if (ch === '\u200C') {
      continue;
    }

    // Diacritics pass through
    if (isTransparent(ch)) {
      out.push({ ch, rawIndex: i, rawLen: 1 });
      continue;
    }

    const nextObj = findNext(i);

    // Check Lam-Alef ligature
    if (ch === '\u0644' && nextObj && LAM_ALEF[nextObj.char]) {
      const prevObj = findPrev(i);
      const prevInfo = prevObj ? FORMS[prevObj.char] : null;
      const prevJoins = prevInfo && prevInfo.t === 'D';
      const ligForm = prevJoins ? LAM_ALEF[nextObj.char][1] : LAM_ALEF[nextObj.char][0];
      const span = nextObj.index - i + 1;
      out.push({ ch: ligForm, rawIndex: i, rawLen: span });
      i = nextObj.index; // skip the Alef
      continue;
    }

    const info = FORMS[ch];
    if (!info) {
      out.push({ ch, rawIndex: i, rawLen: 1 });
      continue;
    }

    const prevObj = findPrev(i);
    const prevInfo = prevObj ? FORMS[prevObj.char] : null;
    const nextInfo = nextObj ? FORMS[nextObj.char] : null;

    const prevJoins = prevInfo && prevInfo.t === 'D';
    const nextJoins = nextInfo && (nextInfo.t === 'D' || nextInfo.t === 'R');

    let formIdx = 0; // 0: Isolated, 1: Final, 2: Initial, 3: Medial
    if (prevJoins && nextJoins && info.t === 'D') formIdx = 3;
    else if (prevJoins) formIdx = 1;
    else if (nextJoins && info.t === 'D') formIdx = 2;
    else formIdx = 0;

    out.push({ ch: info.f[formIdx], rawIndex: i, rawLen: 1 });
  }

  return out;
}

/**
 * Split line text into BiDi runs: 'rtl', 'ltr', or 'neutral'.
 */
export function segmentBidi(text) {
  const chars = [...text];
  const runs = [];
  let cur = '';
  let curType = null;

  for (const ch of chars) {
    let t = 'neutral';
    if (RTL_REGEX.test(ch)) t = 'rtl';
    else if (LTR_REGEX.test(ch)) t = 'ltr';

    if (t === curType) {
      cur += ch;
    } else {
      if (cur) runs.push({ text: cur, type: curType });
      cur = ch;
      curType = t;
    }
  }
  if (cur) runs.push({ text: cur, type: curType });

  // Resolve neutral tokens in an RTL paragraph
  // Neutrals between two LTR runs become LTR; otherwise they become RTL
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].type === 'neutral') {
      const prev = i > 0 ? runs[i - 1].type : 'rtl';
      const next = i < runs.length - 1 ? runs[i + 1].type : 'rtl';
      if (prev === 'ltr' && next === 'ltr') runs[i].type = 'ltr';
      else runs[i].type = 'rtl';
    }
  }

  // Merge consecutive runs of same type
  const merged = [];
  for (const r of runs) {
    if (merged.length && merged[merged.length - 1].type === r.type) {
      merged[merged.length - 1].text += r.text;
    } else {
      merged.push({ ...r });
    }
  }

  return merged;
}

/**
 * Full layout for an RTL line:
 * Produces an array of glyphs { ch, x, adv, w } in reading order.
 *  - Visual coordinates x place letters properly across the line width from right to left.
 *  - Cursive Persian letters retain their shaped forms.
 *  - Logical reading order is preserved for animation stagger and typing.
 */
export function layoutRtlLine(line, measureSpaced, measurePlain) {
  const bidiRuns = segmentBidi(line);

  // Process each run to obtain its shaped glyph items
  const processedRuns = bidiRuns.map((r) => {
    let glyphs;
    if (r.type === 'rtl') {
      glyphs = shapeArabicRun(r.text);
    } else {
      glyphs = [...r.text].map((ch, idx) => ({ ch, rawIndex: idx, rawLen: 1 }));
    }
    // Measure individual glyphs
    let runW = 0;
    const measuredGlyphs = glyphs.map((g) => {
      const adv = measureSpaced(g.ch);
      const w = measurePlain(g.ch);
      runW += adv;
      return { ...g, adv, w };
    });
    return { type: r.type, text: r.text, glyphs: measuredGlyphs, w: runW };
  });

  const totalLineWidth = processedRuns.reduce((acc, r) => acc + r.w, 0);

  // In an RTL line, logical runs flow right-to-left.
  // The first logical run sits at the rightmost boundary: X_right = totalLineWidth.
  let curRight = totalLineWidth;
  const out = [];

  for (const run of processedRuns) {
    const runLeft = curRight - run.w;
    const runRight = curRight;

    if (run.type === 'rtl') {
      // In an RTL run, glyph 0 (first read) sits on the far right of the run
      let glyphRight = runRight;
      for (const g of run.glyphs) {
        const glyphLeft = glyphRight - g.adv;
        out.push({
          ch: g.ch,
          x: glyphLeft,
          adv: g.adv,
          w: g.w,
        });
        glyphRight = glyphLeft;
      }
    } else {
      // In an LTR run (English or numbers), glyphs flow left-to-right
      let glyphLeft = runLeft;
      for (const g of run.glyphs) {
        out.push({
          ch: g.ch,
          x: glyphLeft,
          adv: g.adv,
          w: g.w,
        });
        glyphLeft += g.adv;
      }
    }

    curRight = runLeft;
  }

  return out;
}
