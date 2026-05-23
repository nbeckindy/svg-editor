import { Matrix } from '@svgdotjs/svg.js';
import {
  ROTATION_MIXED_EPS_DEG,
  normDeg0To360,
  rotationDeg0To360FromMatrix,
  rotationDiffDeg,
  shortestSignedDeltaDeg,
  skewDegFromMatrix
} from './selection-transform-matrix';

describe('selection-transform-matrix', () => {
  describe('normDeg0To360', () => {
    it('maps negative and >360 values into [0, 360)', () => {
      expect(normDeg0To360(-90)).toBe(270);
      expect(normDeg0To360(390)).toBe(30);
      expect(normDeg0To360(0)).toBe(0);
    });

    it('returns NaN for non-finite', () => {
      expect(normDeg0To360(Number.NaN)).toBeNaN();
    });
  });

  describe('shortestSignedDeltaDeg', () => {
    it('chooses shortest arc across wrap', () => {
      expect(shortestSignedDeltaDeg(350, 10)).toBe(20);
      expect(shortestSignedDeltaDeg(10, 350)).toBe(-20);
    });
  });

  describe('rotationDeg0To360FromMatrix', () => {
    it('reads angle from identity as 0', () => {
      expect(rotationDeg0To360FromMatrix(new Matrix())).toBe(0);
    });

    it('matches rotate(30) decomposition', () => {
      const m = new Matrix().rotate(30, 0, 0);
      expect(rotationDeg0To360FromMatrix(m)).toBeCloseTo(30, 5);
    });
  });

  describe('skewDegFromMatrix', () => {
    it('reads skewX from skewX matrix', () => {
      const m = new Matrix().skewX(12, 40, 25);
      const { skewX, skewY } = skewDegFromMatrix(m);
      expect(skewX).toBeCloseTo(12, 5);
      expect(skewY).toBeCloseTo(0, 5);
    });
  });

  describe('rotationDiffDeg', () => {
    it('treats 0 and 360 as equal', () => {
      expect(rotationDiffDeg(0, 360)).toBeLessThanOrEqual(ROTATION_MIXED_EPS_DEG);
    });

    it('reports large difference for 0 vs 45', () => {
      expect(rotationDiffDeg(0, 45)).toBe(45);
    });
  });
});
