import { describe, it, expect, vi } from 'vitest';
import { sampleCanvasPointerTarget } from './sample-canvas-pointer-target';

describe('sampleCanvasPointerTarget', () => {
  it('returns null when elementFromPoint is missing', () => {
    const previousElementFromPoint = document.elementFromPoint;
    delete (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint;

    try {
      expect(sampleCanvasPointerTarget(10, 20)).toBeNull();
    } finally {
      if (previousElementFromPoint) {
        document.elementFromPoint = previousElementFromPoint;
      }
    }
  });

  it('returns elementFromPoint result when available', () => {
    const hit = document.createElement('span');
    const previousElementFromPoint = document.elementFromPoint;
    const elementFromPoint = vi.fn().mockReturnValue(hit) as typeof document.elementFromPoint;
    document.elementFromPoint = elementFromPoint;

    try {
      expect(sampleCanvasPointerTarget(5, 6)).toBe(hit);
      expect(elementFromPoint).toHaveBeenCalledWith(5, 6);
    } finally {
      if (previousElementFromPoint) {
        document.elementFromPoint = previousElementFromPoint;
      } else {
        delete (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint;
      }
    }
  });
});
