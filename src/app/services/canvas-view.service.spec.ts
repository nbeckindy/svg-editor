import { TestBed } from '@angular/core/testing';
import { CanvasViewService } from './canvas-view.service';
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

  it('screenToSvg should convert using rect and current pan/scale', () => {
    const rect = new DOMRect(10, 20, 100, 100);
    const point = service.screenToSvg(60, 70, rect);
    expect(point).not.toBeNull();
    expect(point!.x).toBe(50);
    expect(point!.y).toBe(50);
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
});
