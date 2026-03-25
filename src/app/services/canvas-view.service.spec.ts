import { TestBed } from '@angular/core/testing';
import { CANVAS_MIN_ZOOM_SCALE, CanvasViewService } from './canvas-view.service';
import { SvgManipulationService } from './svg-manipulation.service';

describe('CanvasViewService', () => {
  let service: CanvasViewService;
  let svgManipulation: SvgManipulationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CanvasViewService, SvgManipulationService]
    });
    service = TestBed.inject(CanvasViewService);
    svgManipulation = TestBed.inject(SvgManipulationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial scale 1 and pan 0', () => {
    expect(service.scale).toBe(1);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
  });

  it('screenToSvg should convert using rect and scale (pan is baked into rect from transforms)', () => {
    const rect = new DOMRect(10, 20, 100, 100);
    const point = service.screenToSvg(60, 70, rect);
    expect(point).not.toBeNull();
    expect(point!.x).toBe(50);
    expect(point!.y).toBe(50);
    service.panX = 30;
    service.panY = 40;
    service.scale = 2;
    const rect2 = new DOMRect(100, 200, 80, 80);
    const p2 = service.screenToSvg(120, 220, rect2);
    expect(p2!.x).toBeCloseTo(10);
    expect(p2!.y).toBeCloseTo(10);
  });

  it('screenToSvg should return null when scale is 0', () => {
    service.scale = 0;
    const rect = new DOMRect(0, 0, 100, 100);
    expect(service.screenToSvg(50, 50, rect)).toBeNull();
  });

  it('zoomInAt should double scale and update pan so point stays under cursor', () => {
    service.scale = 1;
    service.panX = 0;
    service.panY = 0;
    service.zoomInAt(8, 8);
    expect(service.scale).toBe(2);
    expect(service.panX).toBe(-8);
    expect(service.panY).toBe(-8);
  });

  it('zoomOutAt from scale 1 should halve to 50% and update pan so point stays under cursor', () => {
    service.scale = 1;
    service.panX = 10;
    service.panY = 20;
    service.zoomOutAt(8, 8);
    expect(service.scale).toBe(0.5);
    expect(service.panX).toBe(14);
    expect(service.panY).toBe(24);

    service.scale = 2;
    service.panX = -8;
    service.panY = -8;
    service.zoomOutAt(8, 8);
    expect(service.scale).toBe(1);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
  });

  it('zoomOutAt from scale 4 should halve to 2 and update pan so point stays under cursor', () => {
    service.scale = 4;
    service.panX = -24;
    service.panY = -24;
    service.zoomOutAt(8, 8);
    expect(service.scale).toBe(2);
    expect(service.panX).toBe(-8);
    expect(service.panY).toBe(-8);
  });

  it('zoomOutAt should not reduce scale below CANVAS_MIN_ZOOM_SCALE', () => {
    service.scale = CANVAS_MIN_ZOOM_SCALE;
    service.panX = 10;
    service.panY = 20;
    service.zoomOutAt(8, 8);
    expect(service.scale).toBe(CANVAS_MIN_ZOOM_SCALE);
    expect(service.panX).toBe(10);
    expect(service.panY).toBe(20);

    service.scale = CANVAS_MIN_ZOOM_SCALE * 1.5;
    service.panX = 0;
    service.panY = 0;
    service.zoomOutAt(0, 0);
    expect(service.scale).toBe(CANVAS_MIN_ZOOM_SCALE);
  });

  it('panBy should add delta to panX and panY', () => {
    service.panX = 5;
    service.panY = 10;
    service.panBy(20, -15);
    expect(service.panX).toBe(25);
    expect(service.panY).toBe(-5);
  });

  it('setPan should set panX and panY', () => {
    service.setPan(100, 200);
    expect(service.panX).toBe(100);
    expect(service.panY).toBe(200);
  });

  it('resetZoom should set scale 1 and pan 0', () => {
    service.scale = 4;
    service.panX = 10;
    service.panY = 20;
    service.resetZoom();
    expect(service.scale).toBe(1);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
  });

  it('init should call resetZoom', () => {
    service.scale = 8;
    const resetSpy = vi.spyOn(service, 'resetZoom');
    service.init();
    expect(resetSpy).toHaveBeenCalled();
  });

  it('isInitialized should return false when no SVG instance', () => {
    expect(service.isInitialized()).toBe(false);
  });

  it('zoomToFitRect should set scale to fit rect in viewport and center it', () => {
    service.zoomToFitRect(0, 0, 100, 100, 200, 200);
    expect(service.scale).toBe(2);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
  });

  it('zoomToFitRect should center rect at (svgX, svgY) with size (svgW, svgH)', () => {
    service.zoomToFitRect(10, 20, 80, 60, 160, 120);
    expect(service.scale).toBe(2);
    const centerX = 10 + 80 / 2;
    const centerY = 20 + 60 / 2;
    expect(service.panX).toBe(160 / 2 - centerX * 2);
    expect(service.panY).toBe(120 / 2 - centerY * 2);
    expect(service.panX).toBe(-20);
    expect(service.panY).toBe(-40);
  });

  it('zoomToFitRect should use min of aspect ratios for scale', () => {
    service.zoomToFitRect(0, 0, 100, 50, 200, 200);
    expect(service.scale).toBe(2);
    service.zoomToFitRect(0, 0, 50, 100, 200, 200);
    expect(service.scale).toBe(2);
  });

  it('zoomToFitRect should do nothing when viewport or rect has zero size', () => {
    service.zoomToFitRect(0, 0, 100, 100, 0, 200);
    expect(service.scale).toBe(1);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
    service.zoomToFitRect(0, 0, 0, 100, 200, 200);
    expect(service.scale).toBe(1);
  });

  it('zoomToFitRect should cap scale at maxScale', () => {
    service.zoomToFitRect(0, 0, 1, 1, 200, 200, 64);
    expect(service.scale).toBe(64);
    service.zoomToFitRect(0, 0, 1, 1, 200, 200, 10);
    expect(service.scale).toBe(10);
  });

  it('zoomToFitRect should allow scale below 100% when rect is larger than viewport', () => {
    service.zoomToFitRect(0, 0, 400, 400, 200, 200);
    expect(service.scale).toBe(0.5);
    expect(service.panX).toBe(0);
    expect(service.panY).toBe(0);
  });

  it('zoomToFitRect should use fitFraction only for scale so content has viewport margin', () => {
    service.zoomToFitRect(0, 0, 100, 100, 200, 200, 64, 0.5);
    expect(service.scale).toBe(1);
    service.zoomToFitRect(0, 0, 200, 200, 200, 200, 64, 0.5);
    expect(service.scale).toBe(0.5);
  });
});
