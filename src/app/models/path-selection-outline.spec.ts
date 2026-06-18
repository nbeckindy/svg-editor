import { describe, expect, it } from 'vitest';
import { buildPathSelectionOutlineOverlayD } from './path-selection-outline';
import type { PathSegment } from './path-d';

describe('buildPathSelectionOutlineOverlayD', () => {
  it('maps segment coordinates through the supplied mapper', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 20 },
      { type: 'C', x1: 12, y1: 22, x2: 30, y2: 40, x: 50, y: 60 }
    ];
    const d = buildPathSelectionOutlineOverlayD('p1', segments, (_id, lx, ly) => ({
      x: lx + 5,
      y: ly + 10
    }));
    expect(d).toBe('M 5 10 L 15 30 C 17 32 35 50 55 70');
  });
});
