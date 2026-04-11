import { Matrix } from '@svgdotjs/svg.js';
import type { BBox, Point } from './selection-resize';

/** Minimum distance from pivot to pointer (user units) to treat angle as defined. */
const MIN_ARM_LENGTH = 1e-6;

/**
 * Pivot for rotating the selection as a rigid group: union bbox center in SVG user space.
 */
export function unionRotationPivot(union: BBox): Point {
  return {
    x: union.x + union.width / 2,
    y: union.y + union.height / 2
  };
}

/**
 * Shortest signed rotation from `prev` to `curr` around `pivot`, in radians.
 * Uses incremental pointer positions so crossing the atan2 branch does not jump.
 */
export function rotationDeltaFromPointerMoveRad(pivot: Point, prev: Point, curr: Point): number {
  const dx0 = prev.x - pivot.x;
  const dy0 = prev.y - pivot.y;
  const dx1 = curr.x - pivot.x;
  const dy1 = curr.y - pivot.y;
  const r0 = Math.hypot(dx0, dy0);
  const r1 = Math.hypot(dx1, dy1);
  if (r0 < MIN_ARM_LENGTH || r1 < MIN_ARM_LENGTH) {
    return 0;
  }
  const a0 = Math.atan2(dy0, dx0);
  const a1 = Math.atan2(dy1, dx1);
  return Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
}

export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Transform for the rotate-preview `worldToUnion` group: content is in root SVG user space, then
 * translated by `-unionOrigin` into union-local space; rotation must be about `pivotRoot` expressed
 * in that same local space (i.e. pivot minus union min corner), not root-space coordinates alone.
 */
export function rotateGhostWorldToUnionMatrix(union: BBox, pivotRoot: Point, angleRad: number): Matrix {
  const ux = union.x;
  const uy = union.y;
  const deg = radiansToDegrees(angleRad);
  const px = pivotRoot.x - ux;
  const py = pivotRoot.y - uy;
  return new Matrix().rotate(deg, px, py).multiply(new Matrix().translate(-ux, -uy));
}

/**
 * Axis-aligned bounding box of `union` after rotating its four corners by `angleRad` about `pivot`.
 */
export function rotatedAxisAlignedBBox(union: BBox, pivot: Point, angleRad: number): BBox {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const corners: Point[] = [
    { x: union.x, y: union.y },
    { x: union.x + union.width, y: union.y },
    { x: union.x + union.width, y: union.y + union.height },
    { x: union.x, y: union.y + union.height }
  ];
  const rotated = corners.map((c) => {
    const dx = c.x - pivot.x;
    const dy = c.y - pivot.y;
    return {
      x: pivot.x + dx * cos - dy * sin,
      y: pivot.y + dx * sin + dy * cos
    };
  });
  const xs = rotated.map((q) => q.x);
  const ys = rotated.map((q) => q.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
