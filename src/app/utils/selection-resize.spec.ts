import { describe, it, expect } from 'vitest';
import {
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
});
