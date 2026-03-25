import { describe, it, expect } from 'vitest';
import {
  axisAlignedRectsIntersect,
  axisAlignedRectContains,
  MARQUEE_MIN_DRAG_PX,
  marqueeSamplePoints,
  marqueeEdgeSamplePoints,
  MARQUEE_EDGE_SAMPLES_PER_EDGE
} from './marquee-selection';

describe('axisAlignedRectsIntersect', () => {
  it('returns true when rects overlap', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 }
      )
    ).toBe(true);
  });

  it('returns false when separated horizontally', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 11, y: 0, width: 10, height: 10 }
      )
    ).toBe(false);
  });

  it('returns false when separated vertically', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 11, width: 10, height: 10 }
      )
    ).toBe(false);
  });

  it('returns true when touching on an edge (inclusive)', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 10, y: 0, width: 5, height: 5 }
      )
    ).toBe(true);
  });

  it('handles zero-width marquee against a segment on same line', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 5, y: 0, width: 0, height: 10 },
        { x: 0, y: 5, width: 10, height: 2 }
      )
    ).toBe(true);
  });

  it('returns false for zero-width marquee miss', () => {
    expect(
      axisAlignedRectsIntersect(
        { x: 20, y: 0, width: 0, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 }
      )
    ).toBe(false);
  });
});

describe('axisAlignedRectContains', () => {
  it('returns true when inner is strictly inside outer', () => {
    expect(
      axisAlignedRectContains(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 10, y: 20, width: 30, height: 40 }
      )
    ).toBe(true);
  });

  it('returns true when inner touches outer edge (inclusive)', () => {
    expect(
      axisAlignedRectContains(
        { x: 0, y: 0, width: 50, height: 50 },
        { x: 0, y: 0, width: 50, height: 50 }
      )
    ).toBe(true);
  });

  it('returns false when inner sticks out past outer', () => {
    expect(
      axisAlignedRectContains(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 5, y: 5, width: 10, height: 10 }
      )
    ).toBe(false);
  });
});

describe('MARQUEE_MIN_DRAG_PX', () => {
  it('matches zoom marquee threshold', () => {
    expect(MARQUEE_MIN_DRAG_PX).toBe(5);
  });
});

describe('marqueeSamplePoints', () => {
  it('returns a 3×3 grid for default steps including corners', () => {
    const pts = marqueeSamplePoints({ x: 10, y: 20, width: 30, height: 40 });
    expect(pts).toHaveLength(9);
    expect(pts).toContainEqual({ x: 10, y: 20 });
    expect(pts).toContainEqual({ x: 40, y: 60 });
    expect(pts).toContainEqual({ x: 25, y: 40 });
  });

  it('returns center only for zero-size rect', () => {
    expect(marqueeSamplePoints({ x: 5, y: 6, width: 0, height: 0 })).toEqual([{ x: 5, y: 6 }]);
  });
});

describe('marqueeEdgeSamplePoints', () => {
  it('includes corners of the marquee for default samplesPerEdge', () => {
    const pts = marqueeEdgeSamplePoints({ x: 10, y: 20, width: 30, height: 40 });
    expect(pts.length).toBe(4 * MARQUEE_EDGE_SAMPLES_PER_EDGE);
    expect(pts).toContainEqual({ x: 10, y: 20 });
    expect(pts).toContainEqual({ x: 40, y: 60 });
  });

  it('steps along the top edge with n=4', () => {
    const pts = marqueeEdgeSamplePoints({ x: 0, y: 0, width: 9, height: 5 }, 4);
    const top = pts.slice(0, 4);
    expect(top.map((p) => p.x)).toEqual([0, 3, 6, 9]);
    expect(top.every((p) => p.y === 0)).toBe(true);
  });
});
