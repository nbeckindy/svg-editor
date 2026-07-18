import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { DrawingStyleDefaults } from '../services/drawing-style-defaults.service';

/** Marks preview nodes; exclude from selection / eyedropper hit testing. */
export const TEXT_TOOL_PREVIEW_DATA_ATTR = 'data-editor-text-tool-preview';

export function isTextToolPreviewNode(el: Element | null | undefined): boolean {
  if (!(el instanceof Element)) return false;
  return el.hasAttribute(TEXT_TOOL_PREVIEW_DATA_ATTR);
}

/**
 * Applies drawing defaults to an SVG.js text element (presentation attributes).
 * Shared by text-tool placement preview (TER-1); inline edit (TER-2) can reuse the same attrs shape.
 */
export function applyTextTypographyFromDrawingDefaults(
  el: SvgJsElement,
  d: DrawingStyleDefaults,
  options?: { previewOpacity?: number }
): void {
  const opacity =
    typeof options?.previewOpacity === 'number' && Number.isFinite(options.previewOpacity)
      ? options.previewOpacity
      : 1;
  el.attr({
    fill: d.fill,
    stroke: d.stroke,
    'stroke-width': d.strokeWidth,
    'font-family': d.fontFamily,
    'font-size': d.fontSize,
    'font-weight': d.fontWeight,
    'font-style': d.fontStyle,
    'text-anchor': d.textAnchor,
    'letter-spacing': d.letterSpacing,
    'word-spacing': d.wordSpacing,
    'pointer-events': 'none',
    opacity
  });
  if (d.dominantBaseline && d.dominantBaseline !== 'auto') {
    el.attr('dominant-baseline', d.dominantBaseline);
  } else {
    el.attr('dominant-baseline', null);
  }
}
