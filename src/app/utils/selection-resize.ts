/** Minimum union width/height in SVG user units to avoid collapsed selection. */
export const MIN_UNION_SIZE = 1e-3;

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export type ResizeEdge = 'n' | 's' | 'e' | 'w';

export type ResizeHandle = ResizeCorner | ResizeEdge;

export function isResizeCorner(h: ResizeHandle): h is ResizeCorner {
  return h === 'nw' || h === 'ne' || h === 'sw' || h === 'se';
}

export function isResizeEdge(h: ResizeHandle): h is ResizeEdge {
  return h === 'n' || h === 's' || h === 'e' || h === 'w';
}

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
  if (Math.abs(s) < minS) {
    s = (s < 0 ? -1 : 1) * minS;
  }
  return rectFromScale(union, handle, s);
}

export function computeCenterAnchoredResize(
  union: BBox,
  pointer: Point,
  minSize = MIN_UNION_SIZE
): BBox {
  const w0 = union.width;
  const h0 = union.height;
  if (w0 <= 0 || h0 <= 0) return { ...union };
  const cx = union.x + w0 / 2;
  const cy = union.y + h0 / 2;
  const startHalfDiagonal = Math.hypot(w0 / 2, h0 / 2);
  if (startHalfDiagonal <= 0) return { ...union };
  const pointerDistance = Math.hypot(pointer.x - cx, pointer.y - cy);
  let s = pointerDistance / startHalfDiagonal;
  const minS = minSize / Math.min(w0, h0);
  if (Math.abs(s) < minS) s = (s < 0 ? -1 : 1) * minS;
  const w1 = Math.abs(s * w0);
  const h1 = Math.abs(s * h0);
  if (s >= 0) {
    return { x: cx - w1 / 2, y: cy - h1 / 2, width: w1, height: h1 };
  }
  return { x: cx - w1 / 2, y: cy - h1 / 2, width: w1, height: h1 };
}

/** Uniform scale about the fixed opposite corner; `s` may be negative (reflection). */
function rectFromScale(union: BBox, handle: ResizeCorner, s: number): BBox {
  const bx = union.x;
  const by = union.y;
  const w0 = union.width;
  const h0 = union.height;
  let cx: number;
  let cy: number;
  let r0x: number;
  let r0y: number;
  switch (handle) {
    case 'se':
      cx = bx;
      cy = by;
      r0x = bx + w0;
      r0y = by + h0;
      break;
    case 'nw':
      cx = bx + w0;
      cy = by + h0;
      r0x = bx;
      r0y = by;
      break;
    case 'ne':
      cx = bx;
      cy = by + h0;
      r0x = bx + w0;
      r0y = by;
      break;
    case 'sw':
      cx = bx + w0;
      cy = by;
      r0x = bx;
      r0y = by + h0;
      break;
  }
  const r1x = cx + s * (r0x - cx);
  const r1y = cy + s * (r0y - cy);
  const xMin = Math.min(cx, r1x);
  const xMax = Math.max(cx, r1x);
  const yMin = Math.min(cy, r1y);
  const yMax = Math.max(cy, r1y);
  return { x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin };
}

/** Free corner drag: independent width/height (Shift off). Supports reflection via min/max span. */
export function computeNonUniformCornerResizedUnion(
  u: BBox,
  handle: ResizeCorner,
  p: Point,
  minSize = MIN_UNION_SIZE
): BBox {
  const { x: bx, y: by, width: w0, height: h0 } = u;
  if (w0 <= 0 || h0 <= 0) return { ...u };

  let xMin: number;
  let xMax: number;
  let yMin: number;
  let yMax: number;
  switch (handle) {
    case 'se':
      xMin = Math.min(bx, p.x);
      xMax = Math.max(bx, p.x);
      yMin = Math.min(by, p.y);
      yMax = Math.max(by, p.y);
      break;
    case 'nw':
      xMin = Math.min(p.x, bx + w0);
      xMax = Math.max(p.x, bx + w0);
      yMin = Math.min(p.y, by + h0);
      yMax = Math.max(p.y, by + h0);
      break;
    case 'ne':
      xMin = Math.min(bx, p.x);
      xMax = Math.max(bx, p.x);
      yMin = Math.min(by + h0, p.y);
      yMax = Math.max(by + h0, p.y);
      break;
    case 'sw':
      xMin = Math.min(bx + w0, p.x);
      xMax = Math.max(bx + w0, p.x);
      yMin = Math.min(by, p.y);
      yMax = Math.max(by, p.y);
      break;
  }

  let w = xMax - xMin;
  let h = yMax - yMin;
  if (w < minSize) {
    const c = (xMin + xMax) / 2;
    xMin = c - minSize / 2;
    xMax = c + minSize / 2;
    w = minSize;
  }
  if (h < minSize) {
    const c = (yMin + yMax) / 2;
    yMin = c - minSize / 2;
    yMax = c + minSize / 2;
    h = minSize;
  }
  return { x: xMin, y: yMin, width: w, height: h };
}

/** Edge midpoint drag: one axis from pointer (Shift off, Alt off). */
export function computeEdgeNonUniformResizedUnion(
  u: BBox,
  edge: ResizeEdge,
  p: Point,
  minSize = MIN_UNION_SIZE
): BBox {
  const { x: bx, y: by, width: w0, height: h0 } = u;
  if (w0 <= 0 || h0 <= 0) return { ...u };

  let xMin: number;
  let xMax: number;
  let yMin: number;
  let yMax: number;
  switch (edge) {
    case 'n':
      // Opposite (south) edge fixed at by+h0; north edge follows pointer.
      xMin = bx;
      xMax = bx + w0;
      yMin = Math.min(p.y, by + h0);
      yMax = Math.max(p.y, by + h0);
      break;
    case 's':
      // Opposite (north) edge fixed at by; south edge follows pointer.
      xMin = bx;
      xMax = bx + w0;
      yMin = Math.min(by, p.y);
      yMax = Math.max(by, p.y);
      break;
    case 'e':
      // Opposite (west) edge fixed at bx; east edge follows pointer.
      xMin = Math.min(bx, p.x);
      xMax = Math.max(bx, p.x);
      yMin = by;
      yMax = by + h0;
      break;
    case 'w':
      // Opposite (east) edge fixed at bx+w0; west edge follows pointer.
      xMin = Math.min(bx + w0, p.x);
      xMax = Math.max(bx + w0, p.x);
      yMin = by;
      yMax = by + h0;
      break;
  }

  let w = xMax - xMin;
  let h = yMax - yMin;
  if (w < minSize) {
    const c = (xMin + xMax) / 2;
    xMin = c - minSize / 2;
    xMax = c + minSize / 2;
    w = minSize;
  }
  if (h < minSize) {
    const c = (yMin + yMax) / 2;
    yMin = c - minSize / 2;
    yMax = c + minSize / 2;
    h = minSize;
  }
  return { x: xMin, y: yMin, width: w, height: h };
}

/** Shift + edge: uniform scale, opposite edge fixed (aspect locked). */
export function computeEdgeAspectLockedResizedUnion(
  u: BBox,
  edge: ResizeEdge,
  p: Point,
  minSize = MIN_UNION_SIZE
): BBox {
  const raw = computeEdgeNonUniformResizedUnion(u, edge, p, minSize);
  const bx = u.x;
  const by = u.y;
  const w0 = u.width;
  const h0 = u.height;
  const cx = bx + w0 / 2;
  const cy = by + h0 / 2;
  let s: number;
  switch (edge) {
    case 'n':
    case 's':
      s = h0 > 1e-12 ? raw.height / h0 : 1;
      break;
    case 'e':
    case 'w':
      s = w0 > 1e-12 ? raw.width / w0 : 1;
      break;
  }
  if (!Number.isFinite(s) || Math.abs(s) < minSize / Math.min(w0, h0)) {
    s = (s < 0 ? -1 : 1) * (minSize / Math.min(w0, h0));
  }
  const w1 = Math.max(Math.abs(s * w0), minSize);
  const h1 = Math.max(Math.abs(s * h0), minSize);
  switch (edge) {
    case 'n':
      return { x: cx - w1 / 2, y: by + h0 - h1, width: w1, height: h1 };
    case 's':
      return { x: cx - w1 / 2, y: by, width: w1, height: h1 };
    case 'e':
      return { x: bx, y: cy - h1 / 2, width: w1, height: h1 };
    case 'w':
      return { x: bx + w0 - w1, y: cy - h1 / 2, width: w1, height: h1 };
  }
}

/**
 * Scale factors and origin for `Matrix.scale(sx, sy, ax, ay)` mapping unionBefore → unionAfter.
 */
export function computeScaleAnchorFromUnionResize(
  handle: ResizeHandle,
  before: BBox,
  after: BBox
): { sx: number; sy: number; ax: number; ay: number } {
  const bx = before.x;
  const by = before.y;
  const w0 = before.width;
  const h0 = before.height;
  const eps = 1e-12;

  if (isResizeCorner(handle)) {
    let cx: number;
    let cy: number;
    let r0x: number;
    let r0y: number;
    switch (handle) {
      case 'se':
        cx = bx;
        cy = by;
        r0x = bx + w0;
        r0y = by + h0;
        break;
      case 'nw':
        cx = bx + w0;
        cy = by + h0;
        r0x = bx;
        r0y = by;
        break;
      case 'ne':
        cx = bx;
        cy = by + h0;
        r0x = bx + w0;
        r0y = by;
        break;
      case 'sw':
        cx = bx + w0;
        cy = by;
        r0x = bx;
        r0y = by + h0;
        break;
    }
    const r1 = draggedCornerOppositeAnchorOnBBox({ x: cx, y: cy }, after);
    const r1x = r1.x;
    const r1y = r1.y;
    const dx0 = r0x - cx;
    const dy0 = r0y - cy;
    const dx1 = r1x - cx;
    const dy1 = r1y - cy;
    const sx = Math.abs(dx0) > eps ? dx1 / dx0 : 1;
    const sy = Math.abs(dy0) > eps ? dy1 / dy0 : 1;
    return { sx, sy, ax: cx, ay: cy };
  }

  let sx: number;
  let sy: number;
  let ax: number;
  let ay: number;
  switch (handle) {
    case 'e':
      ax = bx;
      ay = by + h0 / 2;
      sx = w0 > eps ? (after.x + after.width - bx) / w0 : 1;
      sy = h0 > eps ? after.height / h0 : 1;
      break;
    case 'w':
      ax = bx + w0;
      ay = by + h0 / 2;
      sx = w0 > eps ? (bx + w0 - after.x) / w0 : 1;
      sy = h0 > eps ? after.height / h0 : 1;
      break;
    case 'n':
      ax = bx + w0 / 2;
      ay = by + h0;
      sy = h0 > eps ? (by + h0 - after.y) / h0 : 1;
      sx = w0 > eps ? after.width / w0 : 1;
      break;
    case 's':
      ax = bx + w0 / 2;
      ay = by;
      sy = h0 > eps ? (after.y + after.height - by) / h0 : 1;
      sx = w0 > eps ? after.width / w0 : 1;
      break;
  }
  return { sx, sy, ax, ay };
}

/** Fixed anchor in document SVG coordinates (opposite corner of the handle). */
export function oppositeCornerForHandle(union: BBox, handle: ResizeCorner): Point {
  const { ax, ay } = anchorAndVectorFromHandle(handle, union.width, union.height);
  return { x: union.x + ax, y: union.y + ay };
}

/**
 * After axis-aligned resize about fixed anchor `anchor`, the dragged corner is the corner of `after`
 * diagonally opposite the bbox vertex nearest to `anchor` (handles reflection when the anchor is
 * still a corner of `after` but no longer at e.g. TL after flip).
 */
export function draggedCornerOppositeAnchorOnBBox(anchor: Point, after: BBox): Point {
  const ax = after.x;
  const ay = after.y;
  const aw = after.width;
  const ah = after.height;
  const corners: Point[] = [
    { x: ax, y: ay },
    { x: ax + aw, y: ay },
    { x: ax, y: ay + ah },
    { x: ax + aw, y: ay + ah }
  ];
  let idx = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = Math.hypot(corners[i].x - anchor.x, corners[i].y - anchor.y);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  const opp = idx ^ 3;
  return corners[opp];
}
