import { TestBed } from '@angular/core/testing';
import {
  CanvasCoordinateMappingService,
  type CanvasCoordinateMappingBindings
} from './canvas-coordinate-mapping.service';

function createMockSvgPoint(): SVGPoint {
  const pt = {
    x: 0,
    y: 0,
    matrixTransform(m: DOMMatrix) {
      return {
        x: m.a * pt.x + m.c * pt.y + m.e,
        y: m.b * pt.x + m.d * pt.y + m.f
      };
    }
  };
  return pt as SVGPoint;
}

function createMockSvg(options: {
  viewBox?: string;
  preserveAspectRatio?: string;
  rect?: DOMRect;
  screenCtm?: DOMMatrix | null;
}): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  if (options.viewBox) svg.setAttribute('viewBox', options.viewBox);
  if (options.preserveAspectRatio) {
    svg.setAttribute('preserveAspectRatio', options.preserveAspectRatio);
  }
  const rect = options.rect ?? new DOMRect(0, 0, 200, 100);
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect);
  const ctm = options.screenCtm ?? null;
  (svg as SVGSVGElement & { getScreenCTM: () => DOMMatrix | null }).getScreenCTM = () => ctm;
  (svg as SVGSVGElement & { createSVGPoint: () => SVGPoint }).createSVGPoint = createMockSvgPoint;
  return svg;
}

function mockBindings(overrides: Partial<CanvasCoordinateMappingBindings> = {}): CanvasCoordinateMappingBindings {
  return {
    getMainSvgElement: () => null,
    getOverlayViewBoxString: () => '0 0 100 100',
    getZoomWrapperElement: () => null,
    getCanvasScale: () => 1,
    getWrapperWidth: () => 200,
    getWrapperHeight: () => 100,
    ...overrides
  };
}

describe('CanvasCoordinateMappingService', () => {
  let service: CanvasCoordinateMappingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CanvasCoordinateMappingService);
  });

  afterEach(() => {
    service.unbind();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('parseOverlayViewBox', () => {
    it('parses explicit viewBox string', () => {
      expect(service.parseOverlayViewBox('10 20 300 400')).toEqual({
        vbMinX: 10,
        vbMinY: 20,
        vbW: 300,
        vbH: 400
      });
    });

    it('returns null for malformed viewBox', () => {
      expect(service.parseOverlayViewBox('0 0 100')).toBeNull();
    });

    it('reads viewBox from bindings when argument omitted', () => {
      service.bind(mockBindings({ getOverlayViewBoxString: () => '5 15 50 75' }));
      expect(service.parseOverlayViewBox()).toEqual({
        vbMinX: 5,
        vbMinY: 15,
        vbW: 50,
        vbH: 75
      });
    });
  });

  describe('clientToEditorSvgPoint', () => {
    it('returns null when unbound', () => {
      expect(service.clientToEditorSvgPoint(50, 50)).toBeNull();
    });

    it('returns null when main SVG element is missing', () => {
      service.bind(mockBindings({ getMainSvgElement: () => null }));
      expect(service.clientToEditorSvgPoint(50, 50)).toBeNull();
    });

    it('uses CTM mapping when getScreenCTM succeeds', () => {
      const svg = createMockSvg({ rect: new DOMRect(0, 0, 100, 100) });
      const ctm = {
        a: 2,
        b: 0,
        c: 0,
        d: 2,
        e: 10,
        f: 20,
        inverse: () => ({ a: 0.5, b: 0, c: 0, d: 0.5, e: -5, f: -10 })
      } as unknown as DOMMatrix;
      (svg as SVGSVGElement & { getScreenCTM: () => DOMMatrix }).getScreenCTM = () => ctm;
      service.bind(mockBindings({ getMainSvgElement: () => svg }));

      const pt = service.clientToEditorSvgPoint(20, 30);
      expect(pt).not.toBeNull();
      expect(pt!.x).toBeCloseTo(5);
      expect(pt!.y).toBeCloseTo(5);
    });

    it('falls back to linear viewBox mapping when CTM is unavailable', () => {
      const svg = createMockSvg({ rect: new DOMRect(10, 20, 100, 50), screenCtm: null });
      service.bind(
        mockBindings({
          getMainSvgElement: () => svg,
          getOverlayViewBoxString: () => '0 0 200 100'
        })
      );

      const pt = service.clientToEditorSvgPoint(60, 45);
      expect(pt).toEqual({ x: 100, y: 50 });
    });
  });

  describe('svgBboxToOverlayPixels', () => {
    it('scales by wrapper dimensions when main SVG is absent', () => {
      service.bind(
        mockBindings({
          getMainSvgElement: () => null,
          getOverlayViewBoxString: () => '0 0 100 100',
          getCanvasScale: () => 2,
          getWrapperWidth: () => 200,
          getWrapperHeight: () => 100
        })
      );

      expect(service.svgBboxToOverlayPixels({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
        x: 40,
        y: 40,
        width: 120,
        height: 80
      });
    });

    it('maps bbox with preserveAspectRatio meet and wrapper fallback rects', () => {
      const svg = createMockSvg({
        preserveAspectRatio: 'xMidYMid meet',
        rect: new DOMRect(0, 0, 0, 0)
      });
      service.bind(
        mockBindings({
          getMainSvgElement: () => svg,
          getOverlayViewBoxString: () => '0 0 100 100',
          getCanvasScale: () => 2,
          getWrapperWidth: () => 200,
          getWrapperHeight: () => 100,
          getZoomWrapperElement: () => null
        })
      );

      const px = service.svgBboxToOverlayPixels({ x: 0, y: 0, width: 100, height: 100 });
      expect(px.x).toBeCloseTo(100);
      expect(px.y).toBeCloseTo(0);
      expect(px.width).toBeCloseTo(200);
      expect(px.height).toBeCloseTo(200);
    });

    it('maps bbox with preserveAspectRatio none using visual rects', () => {
      const svg = createMockSvg({
        preserveAspectRatio: 'none',
        rect: new DOMRect(10, 5, 180, 90)
      });
      const wrapper = document.createElement('div');
      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
      service.bind(
        mockBindings({
          getMainSvgElement: () => svg,
          getOverlayViewBoxString: () => '0 0 100 100',
          getCanvasScale: () => 1,
          getWrapperWidth: () => 200,
          getWrapperHeight: () => 100,
          getZoomWrapperElement: () => wrapper
        })
      );

      const px = service.svgBboxToOverlayPixels({ x: 10, y: 10, width: 20, height: 20 });
      expect(px.x).toBeCloseTo(28);
      expect(px.y).toBeCloseTo(14);
      expect(px.width).toBeCloseTo(36);
      expect(px.height).toBeCloseTo(18);
    });
  });

  describe('bind / unbind', () => {
    it('unbind clears bindings so mapping returns null', () => {
      const svg = createMockSvg({ rect: new DOMRect(0, 0, 100, 100), screenCtm: null });
      service.bind(
        mockBindings({
          getMainSvgElement: () => svg,
          getOverlayViewBoxString: () => '0 0 100 100'
        })
      );
      expect(service.clientToEditorSvgPoint(50, 50)).not.toBeNull();
      service.unbind();
      expect(service.clientToEditorSvgPoint(50, 50)).toBeNull();
    });
  });
});
