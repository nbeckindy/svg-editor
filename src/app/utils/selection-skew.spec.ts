import { describe, expect, it } from 'vitest';
import { clampSkewDeg, edgeToSkewAxis, skewAngleDegFromPointer, skewGhostWorldToUnionMatrix, unionSkewPivot } from './selection-skew';

describe('selection-skew', () => {
  it('edgeToSkewAxis maps middle edges to axes', () => {
    expect(edgeToSkewAxis('n')).toBe('x');
    expect(edgeToSkewAxis('s')).toBe('x');
    expect(edgeToSkewAxis('e')).toBe('y');
    expect(edgeToSkewAxis('w')).toBe('y');
  });

  it('skewAngleDegFromPointer uses atan2 against union dimension', () => {
    const union = { x: 0, y: 0, width: 100, height: 50 };
    const start = { x: 50, y: 0 };
    const curr = { x: 50 + 50, y: 0 };
    const deg = skewAngleDegFromPointer('n', union, start, curr);
    expect(deg).toBeCloseTo((Math.atan2(50, 50) * 180) / Math.PI, 5);
  });

  it('clampSkewDeg limits range', () => {
    expect(clampSkewDeg(200)).toBe(80);
    expect(clampSkewDeg(-200)).toBe(-80);
  });

  it('unionSkewPivot is bbox center', () => {
    expect(unionSkewPivot({ x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 25, y: 40 });
  });

  it('skewGhostWorldToUnionMatrix composes translate and skew', () => {
    const union = { x: 10, y: 20, width: 100, height: 50 };
    const pivot = unionSkewPivot(union);
    const m = skewGhostWorldToUnionMatrix(union, pivot, 10, 'x');
    expect(m).toBeTruthy();
    const arr = m.toArray();
    expect(arr.every((n) => Number.isFinite(n))).toBe(true);
  });
});
