/** Minimum union width/height in SVG user units to avoid collapsed selection. */
export const MIN_UNION_SIZE = 1e-3;

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Opposite corner (fixed anchor) and vector from anchor to the dragged corner, in union-local space
 * where the union top-left is (0,0).
 */
function anchorAndVectorFromHandle(handle: ResizeCorner, w: number, h: number): { ax: number; ay: number; vx: number; vy: number } {
  switch (handle) {
    case 'se':
      return { ax: 0, ay: 0, vx: w, vy: h };
    case 'nw':
      return { ax: w, ay: h, vx: -w, vy: -h };
    case 'ne':
      return { ax: 0, ay: h, vx: w, vy: -h };
    case 'sw':
      return { ax: w, ay: 0, vx: -w, vy: h };
  }
}

/**
 * Proportional resize: pointer projects onto the diagonal from fixed anchor to the initial active corner.
 * Scale s = dot(P - anchor, v0) / |v0|^2 with anchor and v0 in document space (same as union x,y,w,h).
 */
export function computeProportionalResizedUnion(
  union: BBox,
  handle: ResizeCorner,
  pointer: Point,
  minSize = MIN_UNION_SIZE
): BBox {
  const w0 = union.width;
  const h0 = union.height;
  if (w0 <= 0 || h0 <= 0) {
    return { ...union };
  }
  const { ax, ay, vx, vy } = anchorAndVectorFromHandle(handle, w0, h0);
  const anchorDocX = union.x + ax;
  const anchorDocY = union.y + ay;
  const px = pointer.x - anchorDocX;
  const py = pointer.y - anchorDocY;
  const denom = vx * vx + vy * vy;
  if (denom <= 0) {
    return { ...union };
  }
  let s = (px * vx + py * vy) / denom;
  const minS = minSize / Math.min(w0, h0);
  if (s < minS) {
    s = minS;
  }
  return rectFromScale(union, handle, s);
}

function rectFromScale(union: BBox, handle: ResizeCorner, s: number): BBox {
  const w0 = union.width;
  const h0 = union.height;
  const w1 = s * w0;
  const h1 = s * h0;
  switch (handle) {
    case 'se':
      return { x: union.x, y: union.y, width: w1, height: h1 };
    case 'nw':
      return { x: union.x + w0 - w1, y: union.y + h0 - h1, width: w1, height: h1 };
    case 'ne':
      return { x: union.x, y: union.y + h0 - h1, width: w1, height: h1 };
    case 'sw':
      return { x: union.x + w0 - w1, y: union.y, width: w1, height: h1 };
  }
}

/** Fixed anchor in document SVG coordinates (opposite corner of the handle). */
export function oppositeCornerForHandle(union: BBox, handle: ResizeCorner): Point {
  const { ax, ay } = anchorAndVectorFromHandle(handle, union.width, union.height);
  return { x: union.x + ax, y: union.y + ay };
}
