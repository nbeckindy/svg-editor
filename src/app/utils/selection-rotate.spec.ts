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

  it('returns negative delta for counter-clockwise rotation (south to east)', () => {
    const prev = { x: 0, y: 10 };
    const curr = { x: 10, y: 0 };
    const d = rotationDeltaFromPointerMoveRad(pivot, prev, curr);
    expect(d).toBeCloseTo(-Math.PI / 2, 5);
  });

  it('accumulates to ≈2π over a full 360° in small steps', () => {
    const steps = 36;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const a0 = (2 * Math.PI * i) / steps;
      const a1 = (2 * Math.PI * (i + 1)) / steps;
      const prev = { x: 10 * Math.cos(a0), y: 10 * Math.sin(a0) };
      const curr = { x: 10 * Math.cos(a1), y: 10 * Math.sin(a1) };
      total += rotationDeltaFromPointerMoveRad(pivot, prev, curr);
    }
    expect(total).toBeCloseTo(2 * Math.PI, 3);
  });

  it('resolves very small angles with reasonable precision', () => {
    const tiny = 1e-8;
    const prev = { x: 100, y: 0 };
    const curr = { x: 100 * Math.cos(tiny), y: 100 * Math.sin(tiny) };
    const d = rotationDeltaFromPointerMoveRad(pivot, prev, curr);
    expect(d).toBeCloseTo(tiny, 6);
  });
});

describe('radiansToDegrees', () => {
  it('converts π to 180', () => {
    expect(radiansToDegrees(Math.PI)).toBeCloseTo(180, 5);
  });

  it('converts 0 to 0', () => {
    expect(radiansToDegrees(0)).toBe(0);
  });

  it('converts negative angle (-π/2) to -90', () => {
    expect(radiansToDegrees(-Math.PI / 2)).toBeCloseTo(-90, 5);
  });

  it('converts 2π (full circle) to 360', () => {
    expect(radiansToDegrees(2 * Math.PI)).toBeCloseTo(360, 5);
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

  it('0° returns original bbox unchanged', () => {
    const u: BBox = { x: 5, y: 15, width: 60, height: 30 };
    const p = unionRotationPivot(u);
    const out = rotatedAxisAlignedBBox(u, p, 0);
    expect(out.x).toBeCloseTo(u.x, 5);
    expect(out.y).toBeCloseTo(u.y, 5);
    expect(out.width).toBeCloseTo(u.width, 5);
    expect(out.height).toBeCloseTo(u.height, 5);
  });

  it('180° about center preserves width and height', () => {
    const u: BBox = { x: 10, y: 20, width: 80, height: 40 };
    const p = unionRotationPivot(u);
    const out = rotatedAxisAlignedBBox(u, p, Math.PI);
    expect(out.width).toBeCloseTo(u.width, 5);
    expect(out.height).toBeCloseTo(u.height, 5);
    expect(out.x).toBeCloseTo(u.x, 5);
    expect(out.y).toBeCloseTo(u.y, 5);
  });

  it('45° rotation expands bbox by known diagonal factor', () => {
    const u: BBox = { x: 0, y: 0, width: 100, height: 0 };
    const pivot = { x: 50, y: 0 };
    const out = rotatedAxisAlignedBBox(u, pivot, Math.PI / 4);
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    expect(out.width).toBeCloseTo(100 * cos45, 4);
    expect(out.height).toBeCloseTo(100 * sin45, 4);
  });

  it('negative angle produces same bbox size as positive angle', () => {
    const u: BBox = { x: 10, y: 20, width: 100, height: 50 };
    const p = unionRotationPivot(u);
    const pos = rotatedAxisAlignedBBox(u, p, Math.PI / 6);
    const neg = rotatedAxisAlignedBBox(u, p, -Math.PI / 6);
    expect(neg.width).toBeCloseTo(pos.width, 5);
    expect(neg.height).toBeCloseTo(pos.height, 5);
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

  it('union at origin: matrix is pure rotation (no extra translation)', () => {
    const union: BBox = { x: 0, y: 0, width: 80, height: 60 };
    const pivot = unionRotationPivot(union);
    const rad = Math.PI / 4;
    const m = rotateGhostWorldToUnionMatrix(union, pivot, rad);
    const corner = new Point(0, 0).transform(m);
    const cos45 = Math.cos(rad);
    const sin45 = Math.sin(rad);
    const dx = -pivot.x;
    const dy = -pivot.y;
    const expectedX = pivot.x + dx * cos45 - dy * sin45;
    const expectedY = pivot.y + dx * sin45 + dy * cos45;
    expect(corner.x).toBeCloseTo(expectedX, 4);
    expect(corner.y).toBeCloseTo(expectedY, 4);
  });

  it('angle = 0 produces pure translation by -union origin', () => {
    const union: BBox = { x: 30, y: 50, width: 100, height: 60 };
    const pivot = unionRotationPivot(union);
    const m = rotateGhostWorldToUnionMatrix(union, pivot, 0);
    const p = new Point(30, 50).transform(m);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
    const q = new Point(130, 110).transform(m);
    expect(q.x).toBeCloseTo(100, 5);
    expect(q.y).toBeCloseTo(60, 5);
  });
});
