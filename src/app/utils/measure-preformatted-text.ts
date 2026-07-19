/**
 * Measure preformatted multiline text (like a `white-space: pre` textarea) using a
 * detached mirror element so proportional fonts and newlines match the editor.
 * Falls back to a font-size heuristic when the environment cannot lay out (e.g. jsdom).
 */

function parseFontSizePx(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  if (!m) return 14;
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? n : 14;
}

function parseLineHeightRatio(font: string, fontSizePx: number): number {
  // CSS font shorthand may include `/ 1.2` or `/ 18px` after the size.
  const m = /\/\s*([\d.]+)(px)?/.exec(font);
  if (!m) return 1.2;
  const n = Number.parseFloat(m[1]!);
  if (!Number.isFinite(n) || n <= 0) return 1.2;
  if (m[2] === 'px') return n / fontSizePx;
  // Unitless ratio (also treat bare numbers after / as ratio when < ~4)
  return n > 4 ? n / fontSizePx : n;
}

/** Approximate content box when `offsetWidth` / canvas metrics are unavailable. */
export function estimatePreformattedTextPx(
  text: string,
  font: string,
  options?: { paddingXPx?: number; paddingYPx?: number }
): { width: number; height: number } {
  const paddingX = options?.paddingXPx ?? 0;
  const paddingY = options?.paddingYPx ?? 0;
  const fontSize = parseFontSizePx(font);
  const lh = parseLineHeightRatio(font, fontSize);
  const lines = text.length === 0 ? [''] : text.split('\n');
  const maxChars = Math.max(1, ...lines.map((line) => line.length));
  // ~0.55em average glyph width for typical sans/serif UI fonts.
  const width = Math.ceil(maxChars * fontSize * 0.55) + paddingX * 2;
  const height = Math.ceil(lines.length * fontSize * lh) + paddingY * 2;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function measurePreformattedTextPx(
  text: string,
  font: string,
  options?: {
    letterSpacing?: string;
    paddingXPx?: number;
    paddingYPx?: number;
  }
): { width: number; height: number } {
  const paddingX = options?.paddingXPx ?? 0;
  const paddingY = options?.paddingYPx ?? 0;
  const estimated = estimatePreformattedTextPx(text, font, { paddingXPx: paddingX, paddingYPx: paddingY });

  if (typeof document === 'undefined') {
    return estimated;
  }

  const mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = [
    'position:absolute',
    'left:-99999px',
    'top:0',
    'visibility:hidden',
    'pointer-events:none',
    'white-space:pre',
    'width:max-content',
    'height:auto',
    'margin:0',
    'border:0',
    `padding:${paddingY}px ${paddingX}px`,
    `font:${font}`,
    options?.letterSpacing ? `letter-spacing:${options.letterSpacing}` : ''
  ]
    .filter(Boolean)
    .join(';');

  // Empty or trailing newline: ensure the mirror still has a measurable line box.
  let content = text;
  if (content.length === 0) content = ' ';
  else if (content.endsWith('\n')) content += ' ';
  mirror.textContent = content;

  document.body.appendChild(mirror);
  const measuredWidth = Math.ceil(mirror.offsetWidth);
  const measuredHeight = Math.ceil(mirror.offsetHeight);
  mirror.remove();

  // jsdom (and similar) often report 0×0 for detached layout — prefer the estimate.
  if (measuredWidth <= paddingX * 2 || measuredHeight <= paddingY * 2) {
    return estimated;
  }
  return {
    width: Math.max(1, measuredWidth),
    height: Math.max(1, measuredHeight)
  };
}

/** Grow-to-fit size floored by the SVG text bbox mins (plus a small caret gutter). */
export function expandInlineTextEditorSizePx(
  text: string,
  font: string,
  minWidthPx: number,
  minHeightPx: number,
  options?: { letterSpacing?: string; paddingXPx?: number; paddingYPx?: number; gutterPx?: number }
): { width: number; height: number } {
  const gutter = options?.gutterPx ?? 4;
  const measured = measurePreformattedTextPx(text, font, options);
  return {
    width: Math.max(minWidthPx, measured.width + gutter),
    height: Math.max(minHeightPx, measured.height)
  };
}
