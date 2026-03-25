/** Minimum screen drag (width and height) before a marquee counts as intentional; matches zoom marquee. */
export const MARQUEE_MIN_DRAG_PX = 5;

export type AxisAlignedRect = { x: number; y: number; width: number; height: number };

/**
 * True if two axis-aligned rectangles intersect or touch along an edge (inclusive boundaries).
 */
export function axisAlignedRectsIntersect(a: AxisAlignedRect, b: AxisAlignedRect): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return a.x <= bx2 && b.x <= ax2 && a.y <= by2 && b.y <= ay2;
}

/**
 * True if `inner` lies entirely inside `outer` (inclusive edges), same coordinate space.
 */
export function axisAlignedRectContains(outer: AxisAlignedRect, inner: AxisAlignedRect): boolean {
  const ox2 = outer.x + outer.width;
  const oy2 = outer.y + outer.height;
  const ix2 = inner.x + inner.width;
  const iy2 = inner.y + inner.height;
  return outer.x <= inner.x && outer.y <= inner.y && ox2 >= ix2 && oy2 >= iy2;
}

/**
 * Grid sample points inside `marquee` (inclusive edges), same coordinate space as editor SVG / getBBox.
 * Used with `SVGGraphicsElement.isPointInFill` / `isPointInStroke` so selection follows painted geometry
 * (e.g. compound paths with holes), not just the bbox.
 */
export function marqueeSamplePoints(marquee: AxisAlignedRect, gridSteps = 3): { x: number; y: number }[] {
  const w = marquee.width;
  const h = marquee.height;
  if (w < 0 || h < 0 || !Number.isFinite(w) || !Number.isFinite(h)) return [];
  if (w === 0 && h === 0) {
    return [{ x: marquee.x, y: marquee.y }];
  }
  const n = Math.max(2, Math.min(5, Math.floor(gridSteps)));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = n === 1 ? 0.5 : i / (n - 1);
      const v = n === 1 ? 0.5 : j / (n - 1);
      pts.push({
        x: marquee.x + u * w,
        y: marquee.y + v * h
      });
    }
  }
  return pts;
}

/** Default samples per marquee edge when testing fill/stroke intersection along the four sides. */
export const MARQUEE_EDGE_SAMPLES_PER_EDGE = 16;

/**
 * Points along the four boundary segments of `marquee` (inclusive endpoints per segment; corners may repeat).
 * Denser than the interior grid so a marquee edge can register a hit on narrow painted geometry.
 */
export function marqueeEdgeSamplePoints(
  marquee: AxisAlignedRect,
  samplesPerEdge = MARQUEE_EDGE_SAMPLES_PER_EDGE
): { x: number; y: number }[] {
  const { x, y, width: w, height: h } = marquee;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return [];
  if (w < 0 || h < 0) return [];
  const n = Math.max(2, Math.floor(samplesPerEdge));
  const x2 = x + w;
  const y2 = y + h;
  const pts: { x: number; y: number }[] = [];

  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      pts.push({ x: x0 + t * (x1 - x0), y: y0 + t * (y1 - y0) });
    }
  };

  seg(x, y, x2, y);
  seg(x2, y, x2, y2);
  seg(x2, y2, x, y2);
  seg(x, y2, x, y);

  return pts;
}
