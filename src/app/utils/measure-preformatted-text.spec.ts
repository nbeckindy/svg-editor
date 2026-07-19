import { describe, expect, it } from 'vitest';
import {
  estimatePreformattedTextPx,
  expandInlineTextEditorSizePx,
  measurePreformattedTextPx
} from './measure-preformatted-text';

describe('estimatePreformattedTextPx', () => {
  it('grows wider for longer single-line text', () => {
    const font = '16px sans-serif';
    const short = estimatePreformattedTextPx('Hi', font);
    const long = estimatePreformattedTextPx('Hello world, this is longer', font);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it('grows taller for more lines', () => {
    const font = '16px / 1.2 sans-serif';
    const one = estimatePreformattedTextPx('one', font);
    const three = estimatePreformattedTextPx('one\ntwo\nthree', font);
    expect(three.height).toBeGreaterThan(one.height);
  });
});

describe('measurePreformattedTextPx', () => {
  it('returns a usable size (DOM measure or font heuristic)', () => {
    const size = measurePreformattedTextPx('Hello', '16px sans-serif');
    expect(size.width).toBeGreaterThan(1);
    expect(size.height).toBeGreaterThan(1);
  });
});

describe('expandInlineTextEditorSizePx', () => {
  it('respects minimum bbox size', () => {
    const size = expandInlineTextEditorSizePx('a', '12px sans-serif', 80, 40);
    expect(size.width).toBeGreaterThanOrEqual(80);
    expect(size.height).toBeGreaterThanOrEqual(40);
  });

  it('expands beyond min when content is larger', () => {
    const size = expandInlineTextEditorSizePx(
      'A fairly long line of canvas text',
      '20px sans-serif',
      24,
      18
    );
    expect(size.width).toBeGreaterThan(24);
  });
});
