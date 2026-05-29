import { describe, it, expect } from 'vitest';
import type { PathSegment } from './path-d';
import {
  applySymmetricCubicControlDragInPlace,
  findCloseZIndexAfterM,
  findMovetoIndexForSegment
} from './path-node-cubic-handle-mirror';

describe('applySymmetricCubicControlDragInPlace', () => {
  it('mirrors across an interior C–C joint when dragging outgoing x1y1', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: -1, y1: 0, x2: 9, y2: 0, x: 10, y: 0 },
      { type: 'C', x1: 11, y1: 0, x2: 19, y2: 0, x: 20, y: 0 }
    ];
    const mirrored = applySymmetricCubicControlDragInPlace(segments, 2, 'x1y1', 12, 0);
    expect(mirrored).toBe(true);
    expect(segments[2].type === 'C' && segments[2].x1).toBe(12);
    expect(segments[1].type === 'C' && segments[1].x2).toBeCloseTo(8, 10);
    expect(segments[1].type === 'C' && segments[1].y2).toBeCloseTo(0, 10);
  });

  it('mirrors across an interior C–C joint when dragging incoming x2y2', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: -1, y1: 0, x2: 9, y2: 0, x: 10, y: 0 },
      { type: 'C', x1: 11, y1: 0, x2: 19, y2: 0, x: 20, y: 0 }
    ];
    const mirrored = applySymmetricCubicControlDragInPlace(segments, 1, 'x2y2', 7, 0);
    expect(mirrored).toBe(true);
    expect(segments[1].type === 'C' && segments[1].x2).toBe(7);
    expect(segments[2].type === 'C' && segments[2].x1).toBeCloseTo(13, 10);
    expect(segments[2].type === 'C' && segments[2].y1).toBeCloseTo(0, 10);
  });

  it('mirrors last P2 and first P1 across Z on a closed C–C subpath', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: -2, y1: 0, x2: 2, y2: 0, x: 4, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 2, y2: 3, x: 0, y: 0 },
      { type: 'Z' }
    ];
    expect(findMovetoIndexForSegment(segments, 2)).toBe(0);
    expect(findCloseZIndexAfterM(segments, 0)).toBe(3);

    applySymmetricCubicControlDragInPlace(segments, 1, 'x1y1', 1, 2);
    expect(segments[1].type === 'C' && segments[1].x1).toBe(1);
    expect(segments[1].type === 'C' && segments[1].y1).toBe(2);
    expect(segments[2].type === 'C' && segments[2].x2).toBeCloseTo(-1, 10);
    expect(segments[2].type === 'C' && segments[2].y2).toBeCloseTo(-2, 10);

    applySymmetricCubicControlDragInPlace(segments, 2, 'x2y2', 3, 4);
    expect(segments[2].type === 'C' && segments[2].x2).toBe(3);
    expect(segments[2].type === 'C' && segments[2].y2).toBe(4);
    expect(segments[1].type === 'C' && segments[1].x1).toBeCloseTo(-3, 10);
    expect(segments[1].type === 'C' && segments[1].y1).toBeCloseTo(-4, 10);
  });

  it('does not mirror at C–L–C joints (L side has no cubic partner)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: -1, y1: 0, x2: 2, y2: 0, x: 3, y: 0 },
      { type: 'L', x: 6, y: 0 },
      { type: 'C', x1: 7, y1: 0, x2: 8, y2: 0, x: 9, y: 0 }
    ];
    expect(applySymmetricCubicControlDragInPlace(segments, 3, 'x1y1', 20, 20)).toBe(false);
    expect(segments[3].type === 'C' && segments[3].x1).toBe(20);
    expect(segments[3].type === 'C' && segments[3].y1).toBe(20);
    expect(segments[1].type === 'C' && segments[1].x2).toBe(2);

    expect(applySymmetricCubicControlDragInPlace(segments, 1, 'x2y2', 5, 5)).toBe(false);
    expect(segments[1].type === 'C' && segments[1].x2).toBe(5);
    expect(segments[1].type === 'C' && segments[1].y2).toBe(5);
    expect(segments[3].type === 'C' && segments[3].x1).toBe(20);
  });

  it('still mirrors when the dragged control coincides with the anchor (degenerate length)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: -1, y1: 0, x2: 9, y2: 0, x: 10, y: 0 },
      { type: 'C', x1: 11, y1: 0, x2: 19, y2: 0, x: 20, y: 0 }
    ];
    expect(applySymmetricCubicControlDragInPlace(segments, 2, 'x1y1', 10, 0)).toBe(true);
    expect(segments[2].type === 'C' && segments[2].x1).toBe(10);
    expect(segments[2].type === 'C' && segments[2].y1).toBe(0);
    expect(segments[1].type === 'C' && segments[1].x2).toBe(10);
    expect(segments[1].type === 'C' && segments[1].y2).toBe(0);
  });

  it('does not mirror a single C closed loop onto itself', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 0, y2: 1, x: 0, y: 0 },
      { type: 'Z' }
    ];
    expect(applySymmetricCubicControlDragInPlace(segments, 1, 'x1y1', 5, 5)).toBe(false);
    expect(applySymmetricCubicControlDragInPlace(segments, 1, 'x2y2', 3, 3)).toBe(false);
  });
});
