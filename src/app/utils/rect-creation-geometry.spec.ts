import { describe, it, expect } from 'vitest';
import { clampRectCornerRadius, maxRectCornerRadius, placeRectAtOrientation } from './rect-creation-geometry';

describe('rect-creation-geometry', () => {
  describe('maxRectCornerRadius', () => {
    it('returns half the shorter edge', () => {
      expect(maxRectCornerRadius(100, 40)).toBe(20);
      expect(maxRectCornerRadius(40, 100)).toBe(20);
    });

    it('returns 0 for invalid dimensions', () => {
      expect(maxRectCornerRadius(0, 100)).toBe(0);
      expect(maxRectCornerRadius(100, -1)).toBe(0);
    });
  });

  describe('clampRectCornerRadius', () => {
    it('clamps to half the shorter edge', () => {
      expect(clampRectCornerRadius(100, 40, 50)).toBe(20);
      expect(clampRectCornerRadius(40, 100, 50)).toBe(20);
    });

    it('returns 0 for non-positive radius', () => {
      expect(clampRectCornerRadius(100, 100, 0)).toBe(0);
      expect(clampRectCornerRadius(100, 100, -1)).toBe(0);
    });
  });

  describe('placeRectAtOrientation', () => {
    const size = { width: 100, height: 50 };
    const anchor = { x: 200, y: 100 };

    it('top-left places top-left at anchor', () => {
      expect(placeRectAtOrientation(anchor, size, 'top-left')).toEqual({
        x: 200,
        y: 100,
        width: 100,
        height: 50
      });
    });

    it('center places center at anchor', () => {
      expect(placeRectAtOrientation(anchor, size, 'center')).toEqual({
        x: 150,
        y: 75,
        width: 100,
        height: 50
      });
    });

    it('bottom-right places bottom-right at anchor', () => {
      expect(placeRectAtOrientation(anchor, size, 'bottom-right')).toEqual({
        x: 100,
        y: 50,
        width: 100,
        height: 50
      });
    });
  });
});
