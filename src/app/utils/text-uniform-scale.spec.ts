import { describe, expect, it } from 'vitest';
import {
  computeTextUniformScaleFactor,
  isTextOnlyShapeList,
  nudgeToKeepScaledReference,
  proportionalUnionAfterAxisEdit,
  referencePointForTextScale,
  scaleNumericAttrString,
  scalePointAboutPivot
} from './text-uniform-scale';

describe('text-uniform-scale', () => {
  describe('isTextOnlyShapeList', () => {
    it('returns true only when every shape is text', () => {
      expect(isTextOnlyShapeList([])).toBe(false);
      expect(isTextOnlyShapeList([{ type: 'text' }])).toBe(true);
      expect(isTextOnlyShapeList([{ type: 'text' }, { type: 'text' }])).toBe(true);
      expect(isTextOnlyShapeList([{ type: 'text' }, { type: 'rect' }])).toBe(false);
      expect(isTextOnlyShapeList([{ type: 'rect' }])).toBe(false);
    });
  });

  describe('computeTextUniformScaleFactor', () => {
    const before = { x: 10, y: 20, width: 100, height: 50 };

    it('uses width ratio for center mode', () => {
      const after = { x: 0, y: 0, width: 200, height: 100 };
      const { s, ax, ay } = computeTextUniformScaleFactor('center', before, after);
      expect(s).toBeCloseTo(2);
      expect(ax).toBeCloseTo(60);
      expect(ay).toBeCloseTo(45);
    });

    it('derives uniform s from SE proportional resize', () => {
      const after = { x: 10, y: 20, width: 200, height: 100 };
      const { s, ax, ay } = computeTextUniformScaleFactor('se', before, after);
      expect(s).toBeCloseTo(2);
      expect(ax).toBeCloseTo(10);
      expect(ay).toBeCloseTo(20);
    });
  });

  describe('referencePointForTextScale', () => {
    const box = { x: 0, y: 0, width: 10, height: 20 };

    it('returns fixed corner for SE (NW fixed)', () => {
      expect(referencePointForTextScale(box, 'se')).toEqual({ x: 0, y: 0 });
    });

    it('returns center for center mode', () => {
      expect(referencePointForTextScale(box, 'center')).toEqual({ x: 5, y: 10 });
    });
  });

  describe('nudgeToKeepScaledReference', () => {
    it('computes delta so ref lands on scaled desired point', () => {
      const pivot = { x: 0, y: 0 };
      const refBefore = { x: 10, y: 20 };
      // After font-size change, ref drifted to (12, 24) instead of desired (20, 40) at s=2
      const nudge = nudgeToKeepScaledReference(refBefore, { x: 12, y: 24 }, pivot, 2);
      expect(nudge.x).toBeCloseTo(8);
      expect(nudge.y).toBeCloseTo(16);
      const landed = { x: 12 + nudge.x, y: 24 + nudge.y };
      expect(landed).toEqual(scalePointAboutPivot(refBefore, pivot, 2));
    });
  });

  describe('scaleNumericAttrString', () => {
    it('scales finite numeric attrs', () => {
      expect(scaleNumericAttrString('16', 2)).toBe('32');
      expect(scaleNumericAttrString(null, 2)).toBeNull();
      expect(scaleNumericAttrString('em', 2)).toBeNull();
    });
  });

  describe('proportionalUnionAfterAxisEdit', () => {
    const before = { x: 1, y: 2, width: 100, height: 50 };

    it('locks aspect when editing width', () => {
      expect(proportionalUnionAfterAxisEdit(before, 'w', 200)).toEqual({
        x: 1,
        y: 2,
        width: 200,
        height: 100
      });
    });

    it('locks aspect when editing height', () => {
      expect(proportionalUnionAfterAxisEdit(before, 'h', 25)).toEqual({
        x: 1,
        y: 2,
        width: 50,
        height: 25
      });
    });
  });
});
