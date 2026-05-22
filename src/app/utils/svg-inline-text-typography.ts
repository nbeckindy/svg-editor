import type { ShapeProperties } from '../models/shape-properties.interface';

/** Maps a root-SVG-user-space bbox through the same projection as selection overlays (viewBox, letterbox, stage scale). */
export type SvgBboxToOverlayPx = (bbox: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => { x: number; y: number; width: number; height: number };

export interface InlineTextEditorTypography {
  fontSizePx: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  /** Unitless ratio or px string for `font` shorthand (e.g. `1.2` or `18px`). */
  lineHeight: string | number;
}

/**
 * Overlay pixel Δ corresponding to a root SVG user-space Δ, using the editor's bbox→overlay mapping.
 * Keeps textarea metrics aligned with canvas zoom / pan / `preserveAspectRatio` (same basis as the
 * editor canvas bbox→overlay pixel mapping).
 */
export function overlayPixelDeltaFromSvgUserDelta(
  bboxToOverlay: SvgBboxToOverlayPx,
  dxUser: number,
  dyUser: number
): { dxPx: number; dyPx: number } {
  const o0 = bboxToOverlay({ x: 0, y: 0, width: 0, height: 0 });
  const o1 = bboxToOverlay({ x: dxUser, y: dyUser, width: 0, height: 0 });
  return { dxPx: o1.x - o0.x, dyPx: o1.y - o0.y };
}

function parseCssPx(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^([\d.]+)px$/i.exec(value.trim());
  if (!m) return null;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type ResolveInlineTextTypographyOptions = {
  /**
   * Override computed-style reads (defaults to `window.getComputedStyle`).
   * Tests inject this instead of spying `window` so parallel Vitest workers stay isolated.
   */
  getComputedStyleFor?: (el: Element) => CSSStyleDeclaration | null;
};

/**
 * Resolve typography for the HTML `<textarea>` inline text editor so it tracks the painted `<text>`
 * as closely as the DOM/CSS stack allows.
 *
 * **Limitations**
 * - The overlay uses **browser** font resolution (system fonts, CSS `@font-face`). SVG-only
 *   resources (`<font>`, defs-referenced faces, subset differences) may paint on canvas but not
 *   match the textarea, and vice versa.
 * - `font-size` combines `getComputedStyle` (captures many local transforms / inheritance) with a
 *   floor from the editor's user-space→overlay Y scale so jsdom / weak `getComputedStyle` paths still
 *   track zoom; extreme non-uniform scale-down on `<text>` can still diverge.
 */
export function resolveInlineTextEditorTypography(
  textEl: Element | null,
  shapeProps: Pick<ShapeProperties, 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle'> | null | undefined,
  bboxToOverlay: SvgBboxToOverlayPx,
  options?: ResolveInlineTextTypographyOptions
): InlineTextEditorTypography {
  const rawFontSize = shapeProps?.fontSize;
  const fontUser =
    Number.isFinite(rawFontSize ?? NaN) && (rawFontSize ?? 0) > 0 ? rawFontSize! : 16;
  const deltaPx = Math.abs(overlayPixelDeltaFromSvgUserDelta(bboxToOverlay, 0, fontUser).dyPx);

  let computedPx: number | null = null;
  let fontFamily = (shapeProps?.fontFamily ?? '').trim();
  let fontWeight = (shapeProps?.fontWeight ?? '').trim() || 'normal';
  let fontStyle = (shapeProps?.fontStyle ?? '').trim() || 'normal';
  let lineHeight: string | number = 1.2;

  const gcs =
    options?.getComputedStyleFor ??
    (typeof window !== 'undefined' && typeof getComputedStyle === 'function'
      ? (el: Element) => getComputedStyle(el)
      : null);

  if (textEl && typeof gcs === 'function') {
    try {
      const cs = gcs(textEl);
      if (cs) {
        computedPx = parseCssPx(cs.fontSize);
        if (cs.fontFamily) fontFamily = cs.fontFamily;
        if (cs.fontWeight) fontWeight = cs.fontWeight;
        if (cs.fontStyle) fontStyle = cs.fontStyle;
        const lh = cs.lineHeight?.trim();
        if (lh && lh !== 'normal') {
          const lhPx = parseCssPx(lh);
          if (lhPx !== null) lineHeight = `${lhPx}px`;
          else {
            const n = Number.parseFloat(lh);
            if (Number.isFinite(n) && n > 0) lineHeight = n;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const fontSizePx = Math.max(computedPx ?? 0, deltaPx > 0 ? deltaPx : 12);
  if (!fontFamily) fontFamily = 'sans-serif';

  return { fontSizePx, fontFamily, fontWeight, fontStyle, lineHeight };
}

/** `font` shorthand for the inline editor (single style binding). */
export function inlineTextEditorFontShorthand(t: InlineTextEditorTypography): string {
  const lh = typeof t.lineHeight === 'number' ? String(t.lineHeight) : t.lineHeight;
  return `${t.fontStyle} ${t.fontWeight} ${t.fontSizePx}px/${lh} ${t.fontFamily}`;
}
