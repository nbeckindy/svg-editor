import { describe, expect, it } from 'vitest';
import {
  inlineTextEditorFontShorthand,
  overlayPixelDeltaFromSvgUserDelta,
  resolveInlineTextEditorTypography
} from './svg-inline-text-typography';

describe('overlayPixelDeltaFromSvgUserDelta', () => {
  it('maps user Δ through bboxToOverlay differences', () => {
    const bboxToOverlay = (b: { x: number; y: number; width: number; height: number }) => ({
      x: b.x * 2,
      y: b.y * 3,
      width: b.width * 2,
      height: b.height * 3
    });
    expect(overlayPixelDeltaFromSvgUserDelta(bboxToOverlay, 5, 7)).toEqual({ dxPx: 10, dyPx: 21 });
  });
});

describe('resolveInlineTextEditorTypography', () => {
  it('uses overlay Y scale from font-size when computed style is weak', () => {
    const emptyCs = {
      fontSize: '',
      fontFamily: '',
      fontWeight: '',
      fontStyle: '',
      lineHeight: ''
    } as unknown as CSSStyleDeclaration;

    const bboxToOverlay = (b: { x: number; y: number; width: number; height: number }) => ({
      x: b.x,
      y: b.y * 1.5,
      width: b.width,
      height: b.height * 1.5
    });

    const t = resolveInlineTextEditorTypography(
      document.createElementNS('http://www.w3.org/2000/svg', 'text'),
      { fontFamily: 'Georgia', fontSize: 20, fontWeight: 'bold', fontStyle: 'italic' },
      bboxToOverlay,
      { getComputedStyleFor: () => emptyCs }
    );

    expect(t.fontSizePx).toBe(30);
    expect(t.fontFamily).toBe('Georgia');
    expect(t.fontWeight).toBe('bold');
    expect(t.fontStyle).toBe('italic');
  });

  it('takes the greater of computed px and scaled user size (inherit / transform heuristics)', () => {
    const cs = {
      fontSize: '28px',
      fontFamily: 'Arial',
      fontWeight: '600',
      fontStyle: 'normal',
      lineHeight: 'normal'
    } as unknown as CSSStyleDeclaration;

    const bboxToOverlay = (b: { x: number; y: number; width: number; height: number }) => ({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height
    });

    const t = resolveInlineTextEditorTypography(
      document.createElement('div'),
      { fontSize: 12, fontFamily: '', fontWeight: '', fontStyle: '' },
      bboxToOverlay,
      { getComputedStyleFor: () => cs }
    );

    expect(t.fontSizePx).toBe(28);
    expect(t.fontFamily).toBe('Arial');
  });
});

describe('inlineTextEditorFontShorthand', () => {
  it('builds a valid font shorthand', () => {
    const s = inlineTextEditorFontShorthand({
      fontSizePx: 14,
      fontFamily: 'sans-serif',
      fontWeight: '400',
      fontStyle: 'normal',
      lineHeight: 1.2
    });
    expect(s).toContain('14px');
    expect(s).toContain('sans-serif');
  });
});
