import { describe, expect, it, vi } from 'vitest';
import { CanvasCoordinateMappingService } from './canvas-coordinate-mapping.service';

function createMockSvg(overrides: {
  viewBox?: string | null;
  preserveAspectRatio?: string;
  rect?: Partial<DOMRect>;
  getScreenCTM?: () => DOMMatrix | null;
} = {}): SVGSVGElement {
  const rect: DOMRect = {
    x: 0,
    y: 0,
    left: 100,
    top: 50,
    width: 200,
    height: 100,
    right: 300,
    bottom: 150,
    toJSON: () => ({}),
    ...overrides.rect
  };
  return {
    getAttribute: (name: string) => {
      if (name === 'viewBox') return overrides.viewBox ?? '0 0 100 100';
      if (name === 'preserveAspectRatio') return overrides.preserveAspectRatio ?? 'xMidYMid meet';
      return null;
    },
    getBoundingClientRect: () => rect,
    getScreenCTM: overrides.getScreenCTM ?? (() => null)
  } as unknown as SVGSVGElement;
}

describe('CanvasCoordinateMappingService', () => {
  it('parseOverlayViewBox returns null for malformed viewBox strings', () => {
    const svc = new CanvasCoordinateMappingService();
    expect(svc.parseOverlayViewBox('0 0')).toBeNull();
    expect(svc.parseOverlayViewBox('')).toBeNull();
  });

  it('parseOverlayViewBox parses explicit overlay viewBox argument', () => {
    const svc = new CanvasCoordinateMappingService();
    expect(svc.parseOverlayViewBox('10 20 300 400')).toEqual({
      vbMinX: 10,
      vbMinY: 20,
      vbW: 300,
      vbH: 400
    });
  });

  it('clientToEditorSvgPoint falls back to viewBox mapping when CTM is unavailable', () => {
    const svc = new CanvasCoordinateMappingService();
    const mainSvg = createMockSvg();
    svc.bind({
      getMainSvgElement: () => mainSvg,
      getOverlayViewBoxString: () => '0 0 100 100',
      getZoomWrapperElement: () => null,
      getCanvasScale: () => 1,
      getWrapperWidth: () => 200,
      getWrapperHeight: () => 100
    });

    const pt = svc.clientToEditorSvgPoint(150, 75);
    expect(pt).toEqual({ x: 25, y: 25 });
  });

  it('svgBboxToOverlayPixels maps with preserveAspectRatio meet and canvas scale', () => {
    const svc = new CanvasCoordinateMappingService();
    const mainSvg = createMockSvg({ preserveAspectRatio: 'xMidYMid meet' });
    svc.bind({
      getMainSvgElement: () => mainSvg,
      getOverlayViewBoxString: () => '0 0 100 100',
      getZoomWrapperElement: () => null,
      getCanvasScale: () => 2,
      getWrapperWidth: () => 200,
      getWrapperHeight: () => 100
    });

    const mapped = svc.svgBboxToOverlayPixels({ x: 0, y: 0, width: 10, height: 10 });
    // xMidYMid meet: 100×100 content in 200×100 viewport → 50px horizontal letterbox, then × scale 2
    expect(mapped.x).toBeCloseTo(100);
    expect(mapped.y).toBeCloseTo(0);
    expect(mapped.width).toBeCloseTo(20);
    expect(mapped.height).toBeCloseTo(20);
  });

  it('svgBboxToOverlayPixels maps with preserveAspectRatio none without visual wrapper rects', () => {
    const svc = new CanvasCoordinateMappingService();
    const mainSvg = createMockSvg({ preserveAspectRatio: 'none' });
    svc.bind({
      getMainSvgElement: () => mainSvg,
      getOverlayViewBoxString: () => '0 0 100 100',
      getZoomWrapperElement: () => null,
      getCanvasScale: () => 1,
      getWrapperWidth: () => 200,
      getWrapperHeight: () => 100
    });

    const mapped = svc.svgBboxToOverlayPixels({ x: 10, y: 20, width: 50, height: 30 });
    expect(mapped).toEqual({ x: 20, y: 20, width: 100, height: 30 });
  });

  it('svgBboxToOverlayPixels uses wrapper dimensions when main SVG is missing', () => {
    const svc = new CanvasCoordinateMappingService();
    svc.bind({
      getMainSvgElement: () => null,
      getOverlayViewBoxString: () => '0 0 100 100',
      getZoomWrapperElement: () => null,
      getCanvasScale: () => 2,
      getWrapperWidth: () => 200,
      getWrapperHeight: () => 100
    });

    const mapped = svc.svgBboxToOverlayPixels({ x: 0, y: 0, width: 50, height: 50 });
    expect(mapped).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('unbind clears bindings so clientToEditorSvgPoint returns null', () => {
    const svc = new CanvasCoordinateMappingService();
    svc.bind({
      getMainSvgElement: () => createMockSvg(),
      getOverlayViewBoxString: () => '0 0 100 100',
      getZoomWrapperElement: () => null,
      getCanvasScale: () => 1,
      getWrapperWidth: () => 100,
      getWrapperHeight: () => 100
    });
    svc.unbind();
    expect(svc.clientToEditorSvgPoint(0, 0)).toBeNull();
  });
});
