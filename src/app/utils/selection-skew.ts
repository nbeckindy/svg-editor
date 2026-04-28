import { Matrix } from '@svgdotjs/svg.js';
import type { BBox } from './selection-resize';

export type SkewEdge = 'n' | 's' | 'e' | 'w';
export type SkewAxis = 'x' | 'y';

const MIN_UNION_DIM = 0.5;
const ANGLE_CLAMP_DEG = 80;
const NOOP_DEG = 0.01;

export function edgeToSkewAxis(edge: SkewEdge): SkewAxis {
  return edge === 'e' || edge === 'w' ? 'y' : 'x';
}

export function unionSkewPivot(union: BBox): { x: number; y: number } {
  return {
    x: union.x + union.width / 2,
    y: union.y + union.height / 2
  };
}

/**
 * Skew angle (degrees) from pointer delta vs union dimensions; see plans/epics/transform-ux-polish.md TUX-8a.
 */
export function skewAngleDegFromPointer(
  edge: SkewEdge,
  union: BBox,
  startSvg: { x: number; y: number },
  currSvg: { x: number; y: number }
): number {
  const axis = edgeToSkewAxis(edge);
  if (axis === 'x') {
    if (union.height < MIN_UNION_DIM) return 0;
    const H = Math.max(union.height, 1e-6);
    const dx = currSvg.x - startSvg.x;
    const signedDx = edge === 'n' ? dx : -dx;
    const deg = (Math.atan2(signedDx, H) * 180) / Math.PI;
    return clampSkewDeg(deg);
  }
  if (union.width < MIN_UNION_DIM) return 0;
  const W = Math.max(union.width, 1e-6);
  const dy = currSvg.y - startSvg.y;
  const signedDy = edge === 'e' ? dy : -dy;
  const deg = (Math.atan2(signedDy, W) * 180) / Math.PI;
  return clampSkewDeg(deg);
}

export function clampSkewDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return Math.max(-ANGLE_CLAMP_DEG, Math.min(ANGLE_CLAMP_DEG, deg));
}

export function isSkewCommitNoop(angleDeg: number): boolean {
  return Math.abs(angleDeg) < NOOP_DEG;
}

/**
 * Ghost `worldToUnion` matrix: union-local preview equivalent to root-space skew about `pivotRoot`.
 */
export function skewGhostWorldToUnionMatrix(
  union: BBox,
  pivotRoot: { x: number; y: number },
  angleDeg: number,
  axis: SkewAxis
): Matrix {
  const ux = union.x;
  const uy = union.y;
  const px = pivotRoot.x - ux;
  const py = pivotRoot.y - uy;
  const t = new Matrix().translate(-ux, -uy);
  if (axis === 'x') {
    return new Matrix().skewX(angleDeg, px, py).multiply(t);
  }
  return new Matrix().skewY(angleDeg, px, py).multiply(t);
}
