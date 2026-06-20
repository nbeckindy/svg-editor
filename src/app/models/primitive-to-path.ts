import type { PathSegment } from './path-d';

/** SVG circle/ellipse cubic approximation constant (κ). */
const BEZIER_KAPPA = 0.5522847498;

export const COMPOUND_OPERAND_TYPES = new Set(['path', 'rect', 'circle', 'ellipse']);

export function isCompoundOperandType(type: string): boolean {
  return COMPOUND_OPERAND_TYPES.has(type);
}

function parseLengthAttr(el: Element, name: string, fallback = 0): number {
  const raw = el.getAttribute(name);
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Closed subpath for axis-aligned rect in element-local space (supports rx/ry corners). */
export function rectToClosedSubpath(x: number, y: number, w: number, h: number, rxIn = 0, ryIn = 0): PathSegment[] {
  if (w <= 0 || h <= 0) return [];
  let rx = Math.max(0, rxIn);
  let ry = Math.max(0, ryIn);
  if (rx === 0 && ry === 0) {
    return [
      { type: 'M', x, y },
      { type: 'L', x: x + w, y },
      { type: 'L', x: x + w, y: y + h },
      { type: 'L', x, y: y + h },
      { type: 'Z' }
    ];
  }
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);
  const kx = rx * BEZIER_KAPPA;
  const ky = ry * BEZIER_KAPPA;
  const x1 = x + w;
  const y1 = y + h;
  return [
    { type: 'M', x: x + rx, y },
    { type: 'L', x: x1 - rx, y },
    { type: 'C', x1: x1 - rx + kx, y1: y, x2: x1, y2: y + ry - ky, x: x1, y: y + ry },
    { type: 'L', x: x1, y: y1 - ry },
    { type: 'C', x1: x1, y1: y1 - ry + ky, x2: x1 - rx + kx, y2: y1, x: x1 - rx, y: y1 },
    { type: 'L', x: x + rx, y: y1 },
    { type: 'C', x1: x + rx - kx, y1: y1, x2: x, y2: y1 - ry + ky, x, y: y1 - ry },
    { type: 'L', x, y: y + ry },
    { type: 'C', x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
    { type: 'Z' }
  ];
}

/** Closed ellipse (or circle when rx === ry) as four cubic segments in element-local space. */
export function ellipseToClosedSubpath(cx: number, cy: number, rx: number, ry: number): PathSegment[] {
  if (rx <= 0 || ry <= 0) return [];
  const kx = rx * BEZIER_KAPPA;
  const ky = ry * BEZIER_KAPPA;
  return [
    { type: 'M', x: cx, y: cy - ry },
    { type: 'C', x1: cx + kx, y1: cy - ry, x2: cx + rx, y2: cy - ky, x: cx + rx, y: cy },
    { type: 'C', x1: cx + rx, y1: cy + ky, x2: cx + kx, y2: cy + ry, x: cx, y: cy + ry },
    { type: 'C', x1: cx - kx, y1: cy + ry, x2: cx - rx, y2: cy + ky, x: cx - rx, y: cy },
    { type: 'C', x1: cx - rx, y1: cy - ky, x2: cx - kx, y2: cy - ry, x: cx, y: cy - ry },
    { type: 'Z' }
  ];
}

export function primitiveElementToClosedSubpath(element: Element): PathSegment[] | null {
  const tag = element.tagName.toLowerCase();
  if (tag === 'rect') {
    const subpath = rectToClosedSubpath(
      parseLengthAttr(element, 'x'),
      parseLengthAttr(element, 'y'),
      parseLengthAttr(element, 'width'),
      parseLengthAttr(element, 'height'),
      parseLengthAttr(element, 'rx'),
      parseLengthAttr(element, 'ry')
    );
    return subpath.length > 0 ? subpath : null;
  }
  if (tag === 'circle') {
    const subpath = ellipseToClosedSubpath(
      parseLengthAttr(element, 'cx'),
      parseLengthAttr(element, 'cy'),
      parseLengthAttr(element, 'r'),
      parseLengthAttr(element, 'r')
    );
    return subpath.length > 0 ? subpath : null;
  }
  if (tag === 'ellipse') {
    const subpath = ellipseToClosedSubpath(
      parseLengthAttr(element, 'cx'),
      parseLengthAttr(element, 'cy'),
      parseLengthAttr(element, 'rx'),
      parseLengthAttr(element, 'ry')
    );
    return subpath.length > 0 ? subpath : null;
  }
  return null;
}
