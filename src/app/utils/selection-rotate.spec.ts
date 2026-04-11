import { describe, it, expect } from 'vitest';
import { Matrix, Point } from '@svgdotjs/svg.js';
import {
  unionRotationPivot,
  rotationDeltaFromPointerMoveRad,
  radiansToDegrees,
  rotatedAxisAlignedBBox,
  rotateGhostWorldToUnionMatrix
} from './selection-rotate';
import type { BBox } from './selection-resize';

describe('unionRotationPivot', () => {
  it('returns center of union bbox', () => {
    const u: BBox = { x: 10, y: 20, width: 30, height: 40 };
    expect(unionRotationPivot(u)).toEqual({ x: 25, y: 40 });
  });
});

describe('rotationDeltaFromPointerMoveRad', () => {
  const pivot = { x: 0, y: 0 };

  it('returns +π/2 when pointer moves from east to south of pivot', () => {
    const prev = { x: 10, y: 0 };
    const curr = { x: 0, y: 10 };
    const d = rotationDeltaFromPointerMoveRad(pivot, prev, curr);
    expect(d).toBeCloseTo(Math.PI / 2, 5);
  });

  it('returns small delta when crossing atan2 branch (near ±π)', () => {
    const prev = { x: -100, y: -1 };
    const curr = { x: -100, y: 1 };
    const d = rotationDeltaFromPointerMoveRad(pivot, prev, curr);
    expect(Math.abs(d)).toBeLessThan(0.1);
    expect(d).not.toBe(0);
  });

  it('returns 0 when prev equals curr', () => {
    const p = { x: 5, y: 5 };
    expect(rotationDeltaFromPointerMoveRad(pivot, p, p)).toBe(0);
  });

  it('returns 0 when prev is too close to pivot', () => {
    expect(rotationDeltaFromPointerMoveRad(pivot, pivot, { x: 1, y: 0 })).toBe(0);
  });
});

describe('radiansToDegrees', () => {
  it('converts π to 180', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 5);
  });
});

describe('rotatedAxisAlignedBBox', () => {
  it('90° about center swaps width and height for a non-square union', () => {
    const u: BBox = { x: 10, y: 20, width: 100, height: 50 };
    const p = unionRotationPivot(u);
    const out = rotatedAxisAlignedBBox(u, p, Math.PI / 2);
    expect(out.width).toBeCloseTo(50, 5);
    expect(out.height).toBeCloseTo(100, 5);
  });
});

describe('rotateGhostWorldToUnionMatrix', () => {
  it('maps pivot in root space to union-local pivot for any angle (pivot is fixed)', () => {
    const union: BBox = { x: 10, y: 20, width: 100, height: 40 };
    const pivot = { x: 60, y: 40 };
    const inner = new Point(pivot.x - union.x, pivot.y - union.y);
    for (const rad of [0, 0.2, Math.PI / 4, -1.1]) {
      const m = rotateGhostWorldToUnionMatrix(union, pivot, rad);
      const q = new Point(pivot.x, pivot.y).transform(m);
      expect(q.x).toBeCloseTo(inner.x, 5);
      expect(q.y).toBeCloseTo(inner.y, 5);
    }
  });

  it('differs from using root-space pivot in rotate() when union origin is non-zero', () => {
    const union: BBox = { x: 10, y: 20, width: 30, height: 40 };
    const pivot = unionRotationPivot(union);
    const rad = Math.PI / 3;
    const correct = rotateGhostWorldToUnionMatrix(union, pivot, rad);
    const wrong = new Matrix()
      .rotate(radiansToDegrees(rad), pivot.x, pivot.y)
      .multiply(new Matrix().translate(-union.x, -union.y));
    expect(correct.equals(wrong)).toBe(false);
  });
});
