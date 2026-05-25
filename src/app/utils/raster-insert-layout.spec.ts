import { computeRasterInsertLayout, parseRootViewBox } from './raster-insert-layout';

describe('parseRootViewBox', () => {
  it('parses four-number viewBox', () => {
    expect(parseRootViewBox('0 0 800 600')).toEqual({ minX: 0, minY: 0, width: 800, height: 600 });
  });

  it('handles extra whitespace', () => {
    expect(parseRootViewBox('  10  20  100  50  ')).toEqual({ minX: 10, minY: 20, width: 100, height: 50 });
  });

  it('returns null for invalid', () => {
    expect(parseRootViewBox('')).toBeNull();
    expect(parseRootViewBox('0 0')).toBeNull();
    expect(parseRootViewBox('a b c d')).toBeNull();
    expect(parseRootViewBox('0 0 -1 10')).toBeNull();
  });
});

describe('computeRasterInsertLayout', () => {
  it('uses 1:1 size and centers on anchor when viewBox is absent', () => {
    const r = computeRasterInsertLayout({
      viewBox: null,
      intrinsicWidthPx: 40,
      intrinsicHeightPx: 20,
      anchorX: 100,
      anchorY: 50
    });
    expect(r).toEqual({ x: 80, y: 40, width: 40, height: 20 });
  });

  it('scales down uniformly to fit viewBox', () => {
    const r = computeRasterInsertLayout({
      viewBox: '0 0 100 100',
      intrinsicWidthPx: 200,
      intrinsicHeightPx: 100,
      anchorX: 50,
      anchorY: 50
    });
    expect(r.width).toBe(100);
    expect(r.height).toBe(50);
    expect(r.x).toBe(0);
    expect(r.y).toBe(25);
  });

  it('clamps position inside viewBox when anchor is near an edge', () => {
    const r = computeRasterInsertLayout({
      viewBox: '0 0 100 100',
      intrinsicWidthPx: 40,
      intrinsicHeightPx: 40,
      anchorX: 0,
      anchorY: 0
    });
    expect(r.width).toBe(40);
    expect(r.height).toBe(40);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('respects non-zero viewBox origin', () => {
    const r = computeRasterInsertLayout({
      viewBox: '10 20 80 60',
      intrinsicWidthPx: 160,
      intrinsicHeightPx: 120,
      anchorX: 50,
      anchorY: 50
    });
    expect(r.width).toBeCloseTo(80, 5);
    expect(r.height).toBeCloseTo(60, 5);
    expect(r.x).toBeGreaterThanOrEqual(10);
    expect(r.y).toBeGreaterThanOrEqual(20);
    expect(r.x + r.width).toBeLessThanOrEqual(90);
    expect(r.y + r.height).toBeLessThanOrEqual(80);
  });
});
