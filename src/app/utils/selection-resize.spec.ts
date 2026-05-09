import { describe, it, expect } from 'vitest';
import type { BBox } from './selection-resize';
import {
  computeCenterAnchoredResize,
  computeNonUniformCornerResizedUnion,
  computeEdgeNonUniformResizedUnion,
  computeScaleAnchorFromUnionResize,
  computeProportionalResizedUnion,
  oppositeCornerForHandle,
  MIN_UNION_SIZE
} from './selection-resize';

describe('computeProportionalResizedUnion', () => {
  const u = { x: 10, y: 20, width: 100, height: 50 };

  it('SE: scales from NW anchor when pointer moves along diagonal', () => {
    const p = { x: 10 + 200, y: 20 + 100 };
    const out = computeProportionalResizedUnion(u, 'se', p);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBeCloseTo(200);
    expect(out.height).toBeCloseTo(100);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height);
  });

  it('NW: fixed SE corner; pointer toward NW shrinks', () => {
    const anchor = oppositeCornerForHandle(u, 'nw');
    expect(anchor.x).toBe(110);
    expect(anchor.y).toBe(70);
    const p = { x: 60, y: 45 };
    const out = computeProportionalResizedUnion(u, 'nw', p);
    expect(out.x + out.width).toBeCloseTo(anchor.x);
    expect(out.y + out.height).toBeCloseTo(anchor.y);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height);
  });

  it('clamps to min size when pointer is too close to anchor', () => {
    const p = { x: u.x + 0.0001, y: u.y + 0.0001 };
    const out = computeProportionalResizedUnion(u, 'se', p, 2);
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(2 - 1e-6);
  });

  it('NE: preserves aspect', () => {
    const out = computeProportionalResizedUnion(u, 'ne', { x: 200, y: 0 });
    expect(out.width / out.height).toBeCloseTo(2);
  });

  it('SW: preserves aspect', () => {
    const out = computeProportionalResizedUnion(u, 'sw', { x: 0, y: 120 });
    expect(out.width / out.height).toBeCloseTo(2);
  });

  it('NE: anchor is SW corner and new bbox expands correctly', () => {
    const anchor = oppositeCornerForHandle(u, 'ne');
    expect(anchor.x).toBe(u.x);
    expect(anchor.y).toBe(u.y + u.height);
    const p = { x: 310, y: -80 };
    const out = computeProportionalResizedUnion(u, 'ne', p);
    expect(out.x).toBeCloseTo(anchor.x);
    expect(out.y + out.height).toBeCloseTo(anchor.y);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height);
  });

  it('SW: anchor is NE corner and new bbox expands correctly', () => {
    const anchor = oppositeCornerForHandle(u, 'sw');
    expect(anchor.x).toBe(u.x + u.width);
    expect(anchor.y).toBe(u.y);
    const p = { x: -90, y: 170 };
    const out = computeProportionalResizedUnion(u, 'sw', p);
    expect(out.x + out.width).toBeCloseTo(anchor.x);
    expect(out.y).toBeCloseTo(anchor.y);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height);
  });

  it('pointer exactly on anchor clamps to min size', () => {
    const anchor = oppositeCornerForHandle(u, 'se');
    const out = computeProportionalResizedUnion(u, 'se', anchor, 5);
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(5 - 1e-6);
  });

  it('very large scale factor produces large bbox with correct aspect', () => {
    const p = { x: u.x + 10000, y: u.y + 5000 };
    const out = computeProportionalResizedUnion(u, 'se', p);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height, 3);
    expect(out.width).toBeGreaterThan(1000);
  });

  it('pointer on opposite side of anchor allows reflection (Shift / proportional)', () => {
    const p = { x: u.x - 50, y: u.y - 25 };
    const out = computeProportionalResizedUnion(u, 'se', p, 0.001);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    expect(out.x).toBeLessThan(u.x);
    expect(out.width / out.height).toBeCloseTo(u.width / u.height);
  });
});

describe('computeNonUniformCornerResizedUnion', () => {
  const u = { x: 10, y: 20, width: 100, height: 50 };

  it('SE: pointer far right and short height changes aspect', () => {
    const out = computeNonUniformCornerResizedUnion(u, 'se', { x: 200, y: 40 });
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(190);
    expect(out.height).toBe(20);
  });
});

describe('computeEdgeNonUniformResizedUnion', () => {
  const u = { x: 10, y: 20, width: 100, height: 50 };

  it('e: widens without changing height origin', () => {
    const out = computeEdgeNonUniformResizedUnion(u, 'e', { x: 200, y: 30 });
    expect(out.y).toBe(20);
    expect(out.height).toBe(50);
    expect(out.width).toBe(190);
  });
});

describe('computeScaleAnchorFromUnionResize', () => {
  it('derives negative sx when SE corner moves past the NW anchor (horizontal flip)', () => {
    const before = { x: 0, y: 0, width: 100, height: 50 };
    const after = { x: -120, y: 0, width: 100, height: 50 };
    const { sx, sy } = computeScaleAnchorFromUnionResize('se', before, after);
    expect(sx).toBeLessThan(0);
    expect(sy).toBe(1);
  });
});

describe('oppositeCornerForHandle', () => {
  const u: BBox = { x: 10, y: 20, width: 100, height: 50 };

  it('SE handle → NW corner (top-left)', () => {
    const c = oppositeCornerForHandle(u, 'se');
    expect(c).toEqual({ x: 10, y: 20 });
  });

  it('NW handle → SE corner (bottom-right)', () => {
    const c = oppositeCornerForHandle(u, 'nw');
    expect(c).toEqual({ x: 110, y: 70 });
  });

  it('NE handle → SW corner (bottom-left)', () => {
    const c = oppositeCornerForHandle(u, 'ne');
    expect(c).toEqual({ x: 10, y: 70 });
  });

  it('SW handle → NE corner (top-right)', () => {
    const c = oppositeCornerForHandle(u, 'sw');
    expect(c).toEqual({ x: 110, y: 20 });
  });
});

describe('edge cases: square union', () => {
  const sq: BBox = { x: 0, y: 0, width: 50, height: 50 };

  it('SE: aspect ratio 1:1 preserved after resize', () => {
    const out = computeProportionalResizedUnion(sq, 'se', { x: 100, y: 100 });
    expect(out.width).toBeCloseTo(out.height);
    expect(out.width).toBeCloseTo(100);
  });

  it('NW: resize on square keeps 1:1 ratio', () => {
    const out = computeProportionalResizedUnion(sq, 'nw', { x: 25, y: 25 });
    expect(out.width).toBeCloseTo(out.height);
  });
});

describe('edge cases: very small union near MIN_UNION_SIZE', () => {
  const tiny: BBox = { x: 100, y: 200, width: MIN_UNION_SIZE * 2, height: MIN_UNION_SIZE * 2 };

  it('resize to smaller still respects MIN_UNION_SIZE clamp', () => {
    const anchor = oppositeCornerForHandle(tiny, 'se');
    const out = computeProportionalResizedUnion(tiny, 'se', {
      x: anchor.x + MIN_UNION_SIZE * 0.1,
      y: anchor.y + MIN_UNION_SIZE * 0.1
    });
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(MIN_UNION_SIZE - 1e-9);
  });

  it('MIN_UNION_SIZE is a positive constant', () => {
    expect(MIN_UNION_SIZE).toBeGreaterThan(0);
    expect(MIN_UNION_SIZE).toBeLessThan(1);
  });
});

describe('computeCenterAnchoredResize', () => {
  const u: BBox = { x: 10, y: 20, width: 100, height: 50 };

  it('keeps center fixed while scaling outward', () => {
    const out = computeCenterAnchoredResize(u, { x: 160, y: 95 });
    expect(out.x + out.width / 2).toBeCloseTo(u.x + u.width / 2);
    expect(out.y + out.height / 2).toBeCloseTo(u.y + u.height / 2);
    expect(out.width).toBeGreaterThan(u.width);
    expect(out.height).toBeGreaterThan(u.height);
  });

  it('clamps near center to minimum size', () => {
    const center = { x: u.x + u.width / 2, y: u.y + u.height / 2 };
    const out = computeCenterAnchoredResize(u, center, 4);
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(4 - 1e-6);
  });
});
