import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SvgCanvasComponent,
  clampCanvasScaleForSelectionChrome,
  rotateHandleOffsetOverlayPx,
  selectionHandleRadiusOverlayPx
} from './svg-canvas.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { ClipboardService } from '../../services/clipboard.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { SnapService } from '../../services/snap.service';
import { CompositeCommand, TranslateCommand } from '../../models/editor-commands';
import { MARQUEE_MIN_DRAG_PX } from '../../utils/marquee-selection';

/** Mock SVG.js shape with clone() for drag-ghost tests. clone() returns a real DOM node so SVG.js add() can adopt it. */
function mockSvgJsShape(
  id: string,
  node: Element
): { id: () => string; node: Element; clone: () => SVGRectElement } {
  return {
    id: () => id,
    node,
    clone: () => document.createElementNS('http://www.w3.org/2000/svg', 'rect') as SVGRectElement
  };
}

/** Match production mapping: pointer/ghost math uses main editor <svg> rect + overlayViewBox. */
function stubEditorSvgScreenMapping(
  component: SvgCanvasComponent,
  domRect: DOMRect = new DOMRect(0, 0, 100, 100),
  viewBox = '0 0 100 100'
): void {
  component.overlayViewBox = viewBox;
  const host = component.svgContainer()?.nativeElement;
  const mainSvg = host?.firstElementChild as SVGSVGElement | undefined;
  if (mainSvg) {
    vi.spyOn(mainSvg, 'getBoundingClientRect').mockReturnValue(domRect);
    // jsdom has no DOMMatrix / weak getScreenCTM — return null so pointer code uses legacy linear mapping.
    (mainSvg as SVGSVGElement & { getScreenCTM: () => null }).getScreenCTM = () => null;
  }
}

describe('selection chrome zoom (TUX-5)', () => {
  it('clampCanvasScaleForSelectionChrome pins scale to 10%–1000% band', () => {
    expect(clampCanvasScaleForSelectionChrome(0.01)).toBe(0.1);
    expect(clampCanvasScaleForSelectionChrome(0.1)).toBe(0.1);
    expect(clampCanvasScaleForSelectionChrome(1)).toBe(1);
    expect(clampCanvasScaleForSelectionChrome(10)).toBe(10);
    expect(clampCanvasScaleForSelectionChrome(64)).toBe(10);
  });

  it('selectionHandleRadiusOverlayPx is inverse in zoom band and clamped 4–8 px', () => {
    expect(selectionHandleRadiusOverlayPx(0.1)).toBe(8);
    expect(selectionHandleRadiusOverlayPx(1)).toBe(6);
    expect(selectionHandleRadiusOverlayPx(2)).toBe(4);
    expect(selectionHandleRadiusOverlayPx(10)).toBe(4);
  });

  it('rotateHandleOffsetOverlayPx is inverse in zoom band and clamped 20–40 px', () => {
    expect(rotateHandleOffsetOverlayPx(0.1)).toBe(40);
    expect(rotateHandleOffsetOverlayPx(1)).toBe(28);
    expect(rotateHandleOffsetOverlayPx(10)).toBe(20);
  });

  it('uses scale 1 when input is non-finite before applying zoom band clamp', () => {
    expect(clampCanvasScaleForSelectionChrome(Number.NaN)).toBe(1);
    expect(selectionHandleRadiusOverlayPx(Number.NaN)).toBe(6);
    expect(rotateHandleOffsetOverlayPx(Number.POSITIVE_INFINITY)).toBe(28);
  });
});

describe('SvgCanvasComponent', () => {
  let component: SvgCanvasComponent;
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let svgManipulationService: SvgManipulationService;
  let shapeSelectionService: ShapeSelectionService;
  let editorToolService: EditorToolService;
  let canvasViewService: CanvasViewService;
  let editorHistoryService: EditorHistoryService;
  let clipboardService: ClipboardService;
  let snapService: SnapService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [
        SvgManipulationService,
        ShapeSelectionService,
        EditorToolService,
        CanvasViewService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
    svgManipulationService = TestBed.inject(SvgManipulationService);
    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    editorToolService = TestBed.inject(EditorToolService);
    canvasViewService = TestBed.inject(CanvasViewService);
    editorHistoryService = TestBed.inject(EditorHistoryService);
    clipboardService = TestBed.inject(ClipboardService);
    snapService = TestBed.inject(SnapService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display placeholder when no SVG content', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    const placeholder = compiled.querySelector('.placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('Load an SVG file to begin editing');
  });

  it('should hide grid overlay when grid snap is disabled', () => {
    editorToolService.setGridSnapEnabled(false);
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('[data-testid="canvas-grid-overlay"]');
    expect(grid).toBeFalsy();
  });

  it('should show grid overlay when grid snap is enabled and SVG is loaded', () => {
    editorToolService.setGridSnapEnabled(true);
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('[data-testid="canvas-grid-overlay"]');
    const lines = fixture.nativeElement.querySelectorAll('[data-testid="canvas-grid-line"]');
    expect(grid).toBeTruthy();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].getAttribute('vector-effect')).toBe('non-scaling-stroke');
  });

  it('should align grid origin with SVG user-space origin and coarsen spacing when zoomed out', () => {
    editorToolService.setGridSnapEnabled(true);
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();

    canvasViewService.panX = 20;
    canvasViewService.panY = 12;
    canvasViewService.scale = 2;

    const xOriginAtScale2 = component.svgBboxToOverlayPixels({ x: 0, y: 0, width: 0, height: 0 }).x;
    const verticalAtOrigin = component.verticalGridLines.find(
      (line) => Math.abs(line.x1 - xOriginAtScale2) < 1e-6
    );
    expect(verticalAtOrigin).toBeDefined();

    const stepAtScale2 = component.gridStepSvgUnits;
    canvasViewService.scale = 0.5;
    const stepAtScale05 = component.gridStepSvgUnits;
    expect(stepAtScale05).toBeGreaterThan(stepAtScale2);
  });

  it('should show and hide grid overlay as grid snap is toggled', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    editorToolService.setGridSnapEnabled(false);
    fixture.detectChanges();

    expect(component.showGridOverlay).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="canvas-grid-overlay"]')).toBeFalsy();

    editorToolService.setGridSnapEnabled(true);
    fixture.detectChanges();

    expect(component.showGridOverlay).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="canvas-grid-overlay"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-grid-line"]').length).toBeGreaterThan(0);

    editorToolService.setGridSnapEnabled(false);
    fixture.detectChanges();

    expect(component.showGridOverlay).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="canvas-grid-overlay"]')).toBeFalsy();
  });

  it('should handle mixed snap toggle states (grid-only and shape-only) during drag', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();

    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 10, y: 10 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    stubEditorSvgScreenMapping(component);

    const smartGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides');
    smartGuideSpy.mockClear();
    editorToolService.setGridSnapEnabled(true);
    editorToolService.setShapeSnapEnabled(false);
    fixture.detectChanges();

    expect(component.showGridOverlay).toBe(true);
    component.onDocumentMouseMove({
      clientX: 20,
      clientY: 20,
      altKey: false
    } as MouseEvent);
    expect(smartGuideSpy).not.toHaveBeenCalled();

    smartGuideSpy.mockClear();
    editorToolService.setGridSnapEnabled(false);
    editorToolService.setShapeSnapEnabled(true);
    fixture.detectChanges();

    expect(component.showGridOverlay).toBe(false);
    component.onDocumentMouseMove({
      clientX: 25,
      clientY: 25,
      altKey: false
    } as MouseEvent);
    expect(smartGuideSpy).toHaveBeenCalledTimes(1);
  });

  it('should initialize SVG when content is provided', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    const initializeSpy = vi.spyOn(svgManipulationService, 'initializeSVG');
    
    fixture.componentRef.setInput('svgContent', svgContent);
    fixture.detectChanges();
    
    // Give time for AfterViewInit to run
    setTimeout(() => {
      expect(initializeSpy).toHaveBeenCalled();
    }, 0);
  });

  it('should handle canvas click on background when selector tool is active', () => {
    editorToolService.setTool('selector');
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');

    fixture.componentRef.setInput('svgContent', '<svg><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();

    const mockEvent = {
      target: { tagName: 'svg' }
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(clearSelectionSpy).toHaveBeenCalled();
    expect(clearHighlightSpy).toHaveBeenCalled();
  });

  it('should call canvasView.init when SVG is initialized', () => {
    const initSpy = vi.spyOn(canvasViewService, 'init');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();

    expect(svgManipulationService.getSVGInstance()).toBeTruthy();
    expect(initSpy).toHaveBeenCalled();
  });

  it('should zoom in at click position when zoom tool is active and SVG is loaded', () => {
    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();

    expect(canvasViewService.isInitialized()).toBe(true);

    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 200,
      right: 210,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => {}
    });

    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 60,
      clientY: 70
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(zoomInAtSpy).toHaveBeenCalled();
    const [svgX, svgY] = zoomInAtSpy.mock.calls[0];
    expect(svgX).toBe(50);
    expect(svgY).toBe(50);
  });

  it('should call zoomOutAt when zoom tool is active and user Alt+clicks', () => {
    const zoomOutAtSpy = vi.spyOn(canvasViewService, 'zoomOutAt');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 200,
      right: 210,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => {}
    });

    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 60,
      clientY: 70,
      altKey: true
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(zoomOutAtSpy).toHaveBeenCalled();
    const [svgX, svgY] = zoomOutAtSpy.mock.calls[0];
    expect(svgX).toBe(50);
    expect(svgY).toBe(50);
  });

  it('should not call zoomInAt when zoom tool is active but no SVG content', () => {
    editorToolService.setTool('zoom');
    fixture.componentRef.setInput('svgContent', '');
    fixture.detectChanges();

    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(zoomInAtSpy).not.toHaveBeenCalled();
  });

  it('should not call zoomOutAt when zoom tool is active but no SVG content', () => {
    editorToolService.setTool('zoom');
    fixture.componentRef.setInput('svgContent', '');
    fixture.detectChanges();

    const zoomOutAtSpy = vi.spyOn(canvasViewService, 'zoomOutAt');
    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50,
      altKey: true
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(zoomOutAtSpy).not.toHaveBeenCalled();
  });

  it('should call zoomInAt not zoomOutAt when zoom tool is active and user clicks without Alt', () => {
    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    const zoomOutAtSpy = vi.spyOn(canvasViewService, 'zoomOutAt');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 200,
      height: 200,
      right: 210,
      bottom: 220,
      x: 10,
      y: 20,
      toJSON: () => {}
    });

    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 60,
      clientY: 70,
      altKey: false
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(zoomInAtSpy).toHaveBeenCalled();
    expect(zoomOutAtSpy).not.toHaveBeenCalled();
  });

  it('should not clear selection when zoom tool is active and user clicks canvas', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {}
    });

    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(clearSelectionSpy).not.toHaveBeenCalled();
    expect(clearHighlightSpy).not.toHaveBeenCalled();
  });

  it('should start zoom marquee on mousedown when zoom tool is active', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('zoom');

    const mousedownEvent = {
      button: 0,
      clientX: 50,
      clientY: 60,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;

    component.onCanvasMouseDown(mousedownEvent);

    expect(component.isZoomMarquee).toBe(true);
    expect(component.zoomMarqueeRect).not.toBeNull();
    expect(component.zoomMarqueeRect?.left).toBe(50);
    expect(component.zoomMarqueeRect?.top).toBe(60);
    expect(mousedownEvent.preventDefault).toHaveBeenCalled();
  });

  it('should update zoom marquee end on document mousemove while dragging', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('zoom');
    component.onCanvasMouseDown({
      button: 0,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    expect(component.isZoomMarquee).toBe(true);

    component.onDocumentMouseMove({ clientX: 80, clientY: 90 } as MouseEvent);

    expect(component.zoomMarqueeRect?.left).toBe(10);
    expect(component.zoomMarqueeRect?.top).toBe(20);
    expect(component.zoomMarqueeRect?.width).toBe(70);
    expect(component.zoomMarqueeRect?.height).toBe(70);
  });

  it('should call zoomToFitRect on mouseup after non-tiny marquee drag', async () => {
    const zoomToFitRectSpy = vi.spyOn(canvasViewService, 'zoomToFitRect');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    component.wrapperWidth = 200;
    component.wrapperHeight = 200;
    await new Promise<void>((r) => setTimeout(r, 0));
    zoomToFitRectSpy.mockClear();
    editorToolService.setTool('zoom');

    const containerRect = new DOMRect(0, 0, 200, 200);
    vi.spyOn(component.svgContainer()!.nativeElement, 'getBoundingClientRect').mockReturnValue(containerRect);
    vi.spyOn(canvasViewService, 'screenToSvg').mockImplementation((clientX: number, clientY: number) => ({
      x: clientX,
      y: clientY
    }));

    component.onCanvasMouseDown({
      button: 0,
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 150, clientY: 150 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0 } as MouseEvent);

    expect(component.isZoomMarquee).toBe(false);
    expect(zoomToFitRectSpy).toHaveBeenCalledWith(50, 50, 100, 100, 200, 200);
  });

  it('should call zoomInAt on click after tiny marquee drag (not zoomToFitRect on mouseup)', async () => {
    const zoomToFitRectSpy = vi.spyOn(canvasViewService, 'zoomToFitRect');
    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    component.wrapperWidth = 200;
    component.wrapperHeight = 200;
    await new Promise<void>((r) => setTimeout(r, 0));
    zoomToFitRectSpy.mockClear();
    editorToolService.setTool('zoom');

    const containerRect = new DOMRect(0, 0, 200, 200);
    vi.spyOn(component.svgContainer()!.nativeElement, 'getBoundingClientRect').mockReturnValue(containerRect);
    vi.spyOn(canvasViewService, 'screenToSvg').mockImplementation((clientX: number, clientY: number) => ({
      x: clientX,
      y: clientY
    }));

    component.onCanvasMouseDown({
      button: 0,
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 52, clientY: 52 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0 } as MouseEvent);
    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50
    } as unknown as MouseEvent);

    expect(zoomInAtSpy).toHaveBeenCalledWith(50, 50);
    expect(zoomToFitRectSpy).not.toHaveBeenCalled();
  });

  it('should not zoom in on click after zoom marquee mouseup', () => {
    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    component.wrapperWidth = 200;
    component.wrapperHeight = 200;
    editorToolService.setTool('zoom');

    vi.spyOn(component.svgContainer()!.nativeElement, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 200)
    );
    vi.spyOn(canvasViewService, 'screenToSvg').mockImplementation((clientX: number, clientY: number) => ({
      x: clientX,
      y: clientY
    }));

    component.onCanvasMouseDown({
      button: 0,
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 150, clientY: 150 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0 } as MouseEvent);

    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 100,
      clientY: 100
    } as unknown as MouseEvent);

    expect(zoomInAtSpy).not.toHaveBeenCalled();
  });

  it('should start selection marquee on mousedown when selector tool and target is background svg', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="20" height="20"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');

    const mousedownEvent = {
      button: 0,
      clientX: 50,
      clientY: 60,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent;

    component.onCanvasMouseDown(mousedownEvent);

    expect(component.isSelectionMarquee).toBe(true);
    expect(component.selectionMarqueeRect).not.toBeNull();
    expect(component.selectionMarqueeRect?.left).toBe(50);
    expect(component.selectionMarqueeRect?.top).toBe(60);
    expect(mousedownEvent.preventDefault).toHaveBeenCalled();
  });

  it('should update selection marquee end on document mousemove while dragging', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    component.onCanvasMouseDown({
      button: 0,
      clientX: 10,
      clientY: 20,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    expect(component.isSelectionMarquee).toBe(true);

    component.onDocumentMouseMove({ clientX: 80, clientY: 90 } as MouseEvent);

    expect(component.selectionMarqueeRect?.left).toBe(10);
    expect(component.selectionMarqueeRect?.top).toBe(20);
    expect(component.selectionMarqueeRect?.width).toBe(70);
    expect(component.selectionMarqueeRect?.height).toBe(70);
  });

  it('should call selectShapes on mouseup after non-tiny selection marquee', () => {
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');
    const hitA = {
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect').mockReturnValue([hitA]);

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, shiftKey: false } as MouseEvent);

    expect(component.isSelectionMarquee).toBe(false);
    expect(selectShapesSpy).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })]);
  });

  it('should pass marquee hits through expandSelectionByClipGroups before selectShapes', () => {
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');
    const hitA = {
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    const hitB = {
      id: 'b',
      type: 'rect',
      fill: '#111',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect').mockReturnValue([hitA]);
    const expandSpy = vi.spyOn(svgManipulationService, 'expandSelectionByClipGroups').mockReturnValue([hitA, hitB]);

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, shiftKey: false } as MouseEvent);

    expect(expandSpy).toHaveBeenCalledWith([hitA]);
    expect(selectShapesSpy).toHaveBeenCalledWith([hitA, hitB]);
  });

  it('should expand a single marquee hit to all shapes in the same clip group (real manipulation)', () => {
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');
    const soloHit = {
      id: 'mq-x1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect').mockReturnValue([soloHit]);

    fixture.componentRef.setInput(
      'svgContent',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><clipPath id="cp-mq"><rect x="0" y="0" width="100" height="100"/></clipPath></defs>
        <g clip-path="url(#cp-mq)">
          <rect id="mq-x1" x="0" y="0" width="5" height="5"/>
          <rect id="mq-x2" x="10" y="0" width="5" height="5"/>
        </g>
      </svg>`
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, shiftKey: false } as MouseEvent);

    const arg = selectShapesSpy.mock.calls[0]?.[0];
    expect(arg?.map((s) => s.id).sort()).toEqual(['mq-x1', 'mq-x2'].sort());
  });

  it('should not call selectShapes on mouseup after tiny selection marquee', () => {
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect');

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 50,
      clientY: 50,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 52, clientY: 52 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0 } as MouseEvent);

    expect(selectShapesSpy).not.toHaveBeenCalled();
    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50
    } as unknown as MouseEvent);
    expect(selectShapesSpy).not.toHaveBeenCalled();
  });

  it('should not clear selection on click after selection marquee mouseup', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const hitA = {
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect').mockReturnValue([hitA]);

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 40, clientY: 40 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0 } as MouseEvent);

    const clearsAfterMarquee = clearSelectionSpy.mock.calls.length;

    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 10,
      clientY: 10
    } as unknown as MouseEvent);

    expect(clearSelectionSpy.mock.calls.length).toBe(clearsAfterMarquee);
  });

  it('should not start selection marquee when mousedown on unselected content shape', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="20" height="20"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');

    const host = component.svgContainer()?.nativeElement;
    const rectEl = host?.querySelector('#r1') as Element | undefined;
    expect(rectEl).toBeTruthy();

    component.onCanvasMouseDown({
      button: 0,
      clientX: 15,
      clientY: 15,
      target: rectEl,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);

    expect(component.isSelectionMarquee).toBe(false);
  });

  it('should call mergeShapesIntoSelection when shift+mouseup after selection marquee', () => {
    const mergeSpy = vi.spyOn(shapeSelectionService, 'mergeShapesIntoSelection');
    const hitB = {
      id: 'b',
      type: 'rect',
      fill: '#f00',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    };
    vi.spyOn(svgManipulationService, 'getShapePropertiesIntersectingRect').mockReturnValue([hitB]);

    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="5" height="5"/><rect id="b" x="50" y="50" width="5" height="5"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    stubEditorSvgScreenMapping(component);

    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      target: { tagName: 'svg' },
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 60, clientY: 60 } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, shiftKey: true } as MouseEvent);

    expect(mergeSpy).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
  });

  it('should not clear selection or select shape when pan tool is active and user clicks canvas', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');

    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle id="c1" cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('pan');

    const mockEvent = {
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50
    } as unknown as MouseEvent;

    component.onCanvasClick(mockEvent);

    expect(clearSelectionSpy).not.toHaveBeenCalled();
    expect(clearHighlightSpy).not.toHaveBeenCalled();
    expect(selectShapesSpy).not.toHaveBeenCalled();
  });

  it('creates a text element at click coordinates and switches back to selector', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"></svg>');
    fixture.detectChanges();
    editorToolService.setTool('text');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const addShapeSpy = vi.spyOn(svgManipulationService, 'addShape');
    const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');

    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 30,
      clientY: 40
    } as unknown as MouseEvent);

    expect(addShapeSpy).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({ x: 30, y: 40, textContent: 'Text' })
    );
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(editorToolService.getCurrentTool()).toBe('selector');
    promptSpy.mockRestore();
  });

  it('shows text placement preview while text tool is active and clears it when leaving text tool', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"></svg>');
    fixture.detectChanges();
    stubEditorSvgScreenMapping(component);
    editorToolService.setTool('text');
    component.onDocumentMouseMove({ clientX: 12, clientY: 18 } as MouseEvent);
    const svg = svgManipulationService.getSVGInstance();
    const preview = svg?.findOne('[data-editor-text-tool-preview]');
    expect(preview).toBeTruthy();
    expect(Number(preview?.attr('x'))).toBeCloseTo(12);
    expect(Number(preview?.attr('y'))).toBeCloseTo(18);
    editorToolService.setTool('selector');
    fixture.detectChanges();
    expect(svgManipulationService.getSVGInstance()?.findOne('[data-editor-text-tool-preview]')).toBeFalsy();
  });

  it('uses prompt input to update just-created text content', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"></svg>');
    fixture.detectChanges();
    editorToolService.setTool('text');
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Hello');
    const updateSpy = vi.spyOn(svgManipulationService, 'updateTextContent');

    component.onCanvasClick({
      target: { tagName: 'svg' },
      clientX: 20,
      clientY: 25
    } as unknown as MouseEvent);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [shapeId, textValue] = updateSpy.mock.calls[0];
    expect(shapeId).toContain('shape-');
    expect(textValue).toBe('Hello');
    promptSpy.mockRestore();
  });

  it('should start pan on mousedown when pan tool is active and left button', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('pan');
    canvasViewService.panX = 10;
    canvasViewService.panY = 20;

    const mousedownEvent = {
      button: 0,
      clientX: 100,
      clientY: 150,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;

    component.onCanvasMouseDown(mousedownEvent);

    expect(component.isPanning).toBe(true);
    expect(mousedownEvent.preventDefault).toHaveBeenCalled();

    const setPanSpy = vi.spyOn(canvasViewService, 'setPan');
    component.onDocumentMouseMove({
      clientX: 120,
      clientY: 170
    } as MouseEvent);

    expect(setPanSpy).toHaveBeenCalledWith(30, 40);
  });

  it('should not start pan on mousedown when not pan tool', () => {
    editorToolService.setTool('selector');
    const mousedownEvent = {
      button: 0,
      clientX: 100,
      clientY: 150,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;

    component.onCanvasMouseDown(mousedownEvent);

    expect(component.isPanning).toBe(false);
    expect(mousedownEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should not start pan on right or middle mouse button', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('pan');

    const rightClick = { button: 2, preventDefault: vi.fn() } as unknown as MouseEvent;
    component.onCanvasMouseDown(rightClick);
    expect(component.isPanning).toBe(false);

    const middleClick = { button: 1, preventDefault: vi.fn() } as unknown as MouseEvent;
    component.onCanvasMouseDown(middleClick);
    expect(component.isPanning).toBe(false);
  });

  it('should stop pan on document mouseup (left button)', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('pan');
    component.onCanvasMouseDown({
      button: 0,
      clientX: 0,
      clientY: 0,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);

    expect(component.isPanning).toBe(true);

    component.onDocumentMouseUp({ button: 0 } as MouseEvent);
    expect(component.isPanning).toBe(false);
  });

  it('should not update pan on mousemove when not panning', () => {
    const setPanSpy = vi.spyOn(canvasViewService, 'setPan');
    component.isPanning = false;

    component.onDocumentMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);

    expect(setPanSpy).not.toHaveBeenCalled();
  });

  it('should show overlay rect when a shape is selected', async () => {
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
      x: 10,
      y: 20,
      width: 50,
      height: 40
    });
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="50" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(component.highlightRect).not.toBeNull();
    expect(component.highlightRect!.x).toBe(10);
    expect(component.highlightRect!.y).toBe(20);
    expect(component.highlightRect!.width).toBe(50);
    expect(component.highlightRect!.height).toBe(40);
    const highlightRectEl = fixture.nativeElement.querySelector('.highlight-overlay rect[stroke="#2196F3"]');
    expect(highlightRectEl).toBeTruthy();
    expect(highlightRectEl.getAttribute('x')).toBe('10');
    expect(highlightRectEl.getAttribute('y')).toBe('20');
    expect(highlightRectEl.getAttribute('width')).toBe('50');
    expect(highlightRectEl.getAttribute('height')).toBe('40');
  });

  it('should show union bbox overlay when multiple shapes are selected', async () => {
    vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({
      x: 0,
      y: 0,
      width: 70,
      height: 75
    });
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="50" y="60" width="20" height="15"/></svg>'
    );
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.toggleShapeInSelection({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(component.highlightRect).not.toBeNull();
    expect(component.highlightRect!.width).toBe(70);
    expect(component.highlightRect!.height).toBe(75);
    expect(svgManipulationService.getUnionBBox).toHaveBeenCalledWith(['a', 'b']);
    // Multi-select: per-shape outlines when DOM rects resolve for at least two shapes
    const outlineRects = component.multiSelectionOutlineRects;
    if (outlineRects.length >= 2) {
      expect(outlineRects.map((r) => r.id).sort()).toEqual(['a', 'b']);
      const blue = fixture.nativeElement.querySelectorAll('.highlight-overlay rect[stroke="#2196F3"]');
      expect(blue.length).toBe(2);
    }
  });

  it('should auto-fit icon palette SVG using SVG width/height (not viewBox) to keep content in bounds', async () => {
    // viewBox units (100x100) do NOT match the SVG element pixel size (200x200),
    // which is what our editor stage ends up using.
    const marker = '<!--svg-editor-test-icon-->';
    const svgContent = `${marker}<svg viewBox="0 0 100 100" width="200" height="200"><rect x="0" y="0" width="100" height="100" fill="#000"/></svg>`;

    component.wrapperWidth = 200;
    component.wrapperHeight = 200;
    fixture.componentRef.setInput('svgContent', svgContent);
    fixture.detectChanges();

    // Allow initializeSVG() microtask + applyInitialFitToViewport() to run.
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    // With fitFraction 0.88 and svgWpx=200, viewportW=200:
    // scale = (200*0.88)/200 = 0.88
    expect(canvasViewService.scale).toBeCloseTo(0.88, 3);
    expect(canvasViewService.panX).toBeCloseTo(12, 3);
    expect(canvasViewService.panY).toBeCloseTo(12, 3);
  });

  it('should refresh viewBox overlay after initial fit-to-view (race-free)', async () => {
    const marker = '<!--svg-editor-test-icon-->';
    const svgContent = `${marker}<svg viewBox="0 0 100 100" width="200" height="200"><rect x="0" y="0" width="100" height="100" fill="#000"/></svg>`;

    component.wrapperWidth = 200;
    component.wrapperHeight = 200;

    const updateSpy = vi.spyOn(component as any, 'updateViewBoxOverlayRect');

    fixture.componentRef.setInput('svgContent', svgContent);
    fixture.detectChanges();

    // Fit runs in microtask; overlay refresh is scheduled on next tick.
    await new Promise((r) => setTimeout(r, 0));
    // ...and may schedule another tick depending on microtask ordering in the test env.
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    expect(updateSpy).toHaveBeenCalled();
  });

  it('should compensate for flex centering offset when fitting to a smaller SVG', async () => {
    const marker = '<!--svg-editor-test-icon-->';
    // svg is smaller than viewport: flexbox centers it based on unscaled size.
    const svgContent = `${marker}<svg viewBox="0 0 100 100" width="150" height="150"><rect x="0" y="0" width="100" height="100" fill="#000"/></svg>`;

    component.wrapperWidth = 200;
    component.wrapperHeight = 200;
    fixture.componentRef.setInput('svgContent', svgContent);
    fixture.detectChanges();

    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    // scale = (viewport * fitFraction) / svgWpx = (200*0.88)/150
    expect(canvasViewService.scale).toBeCloseTo(1.1733333333, 3);

    // zoomToFitRect pan (no offset compensation) would be 12.
    // layout offset = (viewport - svgWpx)/2 = 25, so final pan should be -13.
    expect(canvasViewService.panX).toBeCloseTo(-13, 3);
    expect(canvasViewService.panY).toBeCloseTo(-13, 3);
  });

  it('should not show overlay rect when getShapeBBox returns null for selected shape', async () => {
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue(null);
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="50" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(component.highlightRect).toBeNull();
    const highlightRectEl = fixture.nativeElement.querySelector('.highlight-overlay rect[stroke="#2196F3"]');
    expect(highlightRectEl).toBeFalsy();
  });

  it('should replace selection on normal click on shape', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    const selectShapesSpy = vi.spyOn(shapeSelectionService, 'selectShapes');
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: (sel: string) => (sel === '#b' ? { id: () => 'b' } : null),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick({
      target: { id: 'b', tagName: 'rect' },
      shiftKey: false
    } as unknown as MouseEvent);

    expect(selectShapesSpy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'b' })
    ]);
    expect(shapeSelectionService.getSelectedShapes()).toHaveLength(1);
    expect(shapeSelectionService.getSelectedShape()?.id).toBe('b');
  });

  it('should add to selection on shift-click on shape when another is selected', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    const toggleSpy = vi.spyOn(shapeSelectionService, 'toggleShapeGroupInSelection');
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: (sel: string) => (sel === '#b' ? { id: () => 'b' } : null),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick({
      target: { id: 'b', tagName: 'rect' },
      shiftKey: true
    } as unknown as MouseEvent);

    expect(toggleSpy).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('should add to selection on ctrl-click on shape when another is selected', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    const toggleSpy = vi.spyOn(shapeSelectionService, 'toggleShapeGroupInSelection');
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: (sel: string) => (sel === '#b' ? { id: () => 'b' } : null),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick({
      target: { id: 'b', tagName: 'rect' },
      ctrlKey: true
    } as unknown as MouseEvent);

    expect(toggleSpy).toHaveBeenCalledWith([expect.objectContaining({ id: 'b' })]);
    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('should remove from selection on meta-click on already selected shape', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: (sel: string) => (sel === '#a' ? { id: () => 'a' } : null),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.toggleShapeInSelection({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick({
      target: { id: 'a', tagName: 'rect' },
      metaKey: true
    } as unknown as MouseEvent);

    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['b']);
  });

  it('should select every shape under the same clip-path ancestor on click', () => {
    fixture.componentRef.setInput(
      'svgContent',
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="100"/></clipPath></defs>
        <g clip-path="url(#cp)">
          <rect id="r-in-1" x="5" y="5" width="10" height="10"/>
          <rect id="r-in-2" x="25" y="25" width="10" height="10"/>
        </g>
        <rect id="r-out" x="60" y="5" width="10" height="10"/>
      </svg>`
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    const host = component.svgContainer()?.nativeElement;
    const rIn1 = host?.querySelector('#r-in-1');
    expect(rIn1).toBeTruthy();

    component.onCanvasClick({
      target: rIn1,
      shiftKey: false
    } as unknown as MouseEvent);

    const ids = shapeSelectionService.getSelectedShapes().map((s) => s.id).sort();
    expect(ids).toEqual(['r-in-1', 'r-in-2'].sort());
  });

  it('should remove from selection on shift-click on already selected shape', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="0" y="0" width="10" height="10"/><rect id="b" x="20" y="0" width="10" height="10"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: (sel: string) => (sel === '#a' ? { id: () => 'a' } : null),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.toggleShapeInSelection({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick({
      target: { id: 'a', tagName: 'rect' },
      shiftKey: true
    } as unknown as MouseEvent);

    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['b']);
  });

  it('should clear selection on normal click on empty canvas', () => {
    const clearSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="10" height="10"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({ findOne: () => null, find: () => [] } as any);

    component.onCanvasClick({
      target: { tagName: 'svg', id: '' },
      shiftKey: false
    } as unknown as MouseEvent);

    expect(clearSpy).toHaveBeenCalled();
    expect(shapeSelectionService.getSelectedShapes()).toEqual([]);
  });

  it('should clear selection on shift-click on empty canvas', () => {
    const clearSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="10" width="10" height="10"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({ findOne: () => null, find: () => [] } as any);

    component.onCanvasClick({
      target: { tagName: 'svg', id: '' },
      shiftKey: true
    } as unknown as MouseEvent);

    expect(clearSpy).toHaveBeenCalled();
  });

  it('should start shape drag on mousedown when selected shape is clicked with selector tool', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-target" x="10" y="20" width="30" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'drag-target',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    const setVisibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');
    const rect = fixture.nativeElement.querySelector('#drag-target') || fixture.nativeElement.querySelector('rect');
    const shapeNode = rect || document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    vi.spyOn(shapeNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 30, 40));
    const mousedownEvent = {
      button: 0,
      target: rect || { id: 'drag-target', tagName: 'rect' },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(true);
    expect(setVisibilitySpy).toHaveBeenCalledWith('drag-target', false);
  });

  it('should start drag when mousedown on one of multiple selected shapes', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="10" y="20" width="30" height="40"/><rect id="b" x="50" y="60" width="20" height="25"/></svg>'
    );
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    shapeSelectionService.toggleShapeInSelection({
      id: 'b',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockImplementation((id: string) =>
      id === 'a' ? { x: 10, y: 20, width: 30, height: 40 } : { x: 50, y: 60, width: 20, height: 25 }
    );
    const setVisibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');
    const shapeNode =
      (component.svgContainer()?.nativeElement?.querySelector('#a') as SVGGraphicsElement | null) ??
      document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    vi.spyOn(shapeNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 30, 40));
    const mousedownEvent = {
      button: 0,
      target: shapeNode,
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(true);
    expect(setVisibilitySpy).toHaveBeenCalledWith('a', false);
    expect(setVisibilitySpy).toHaveBeenCalledWith('b', false);
    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('should translate all selected shapes on mouseup after group drag', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="shape-a" x="0" y="0" width="10" height="10"/><rect id="shape-b" x="20" y="20" width="10" height="10"/></svg>');
    fixture.detectChanges();
    const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
    const setVisibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['shape-a', 'shape-b'];
    dragHandler.visibilityShapeIds = ['shape-a', 'shape-b'];
    dragHandler.startSvg = { x: 0, y: 0 };
    dragHandler.startBbox = { x: 0, y: 0, width: 30, height: 30 };
    dragHandler.snapAnchor = { x: 0, y: 0 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    dragHandler.ghost = { removeFragments: vi.fn(), clearDefs: vi.fn() };
    vi.spyOn(svgManipulationService, 'getLayerStackItems').mockReturnValue([
      { id: 'shape-a', name: 'Shape A', type: 'rect' },
      { id: 'shape-b', name: 'Shape B', type: 'rect' }
    ]);
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockImplementation((id: string) => {
      if (id === 'shape-a') return { x: 0, y: 0, width: 10, height: 10 };
      if (id === 'shape-b') return { x: 20, y: 20, width: 10, height: 10 };
      return null;
    });
    const wrapperEl = component.svgContainer()?.nativeElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onDocumentMouseUp({
      button: 0,
      clientX: 10,
      clientY: 5
    } as MouseEvent);
    expect(component.isDraggingShape).toBe(false);
    expect(translateSpy).toHaveBeenCalledWith('shape-a', 10, 5);
    expect(translateSpy).toHaveBeenCalledWith('shape-b', 10, 5);
    expect(setVisibilitySpy).toHaveBeenCalledWith('shape-a', true);
    expect(setVisibilitySpy).toHaveBeenCalledWith('shape-b', true);
  });

  it('should not start drag when mousedown on unselected shape', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="a" x="10" y="20" width="30" height="40"/><rect id="b" x="50" y="60" width="20" height="25"/></svg>'
    );
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    const mousedownEvent = {
      button: 0,
      target: { id: 'b', tagName: 'rect' },
      clientX: 55,
      clientY: 70,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(false);
  });

  it('should not start shape drag when pan tool is active', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('pan');
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const mousedownEvent = {
      button: 0,
      target: { id: 'r1', tagName: 'rect' },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(false);
  });

  it('should not start shape drag when mousedown on background (svg)', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const mousedownEvent = {
      button: 0,
      target: { tagName: 'svg' },
      clientX: 50,
      clientY: 50,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(false);
  });

  it('when shape drag is started, ghost wrapper should have overflow visible to avoid clipping', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="ghost-vis" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'ghost-vis',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    const rect = fixture.nativeElement.querySelector('#ghost-vis') || fixture.nativeElement.querySelector('rect');
    const mousedownEvent = {
      button: 0,
      target: rect || { id: 'ghost-vis', tagName: 'rect' },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    const ghostHost = fixture.nativeElement.querySelector('[data-editor-ghost]') as SVGGElement | null;
    expect(ghostHost).toBeTruthy();
    const ghostInnerSvg = ghostHost?.querySelector('svg');
    expect(ghostInnerSvg?.getAttribute('overflow')).toBe('visible');
  });

  it('when shape drag is started, ghost SVG should have overflow visible to prevent clipping', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="ghost-svg" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'ghost-svg',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    const rect = fixture.nativeElement.querySelector('#ghost-svg') || fixture.nativeElement.querySelector('rect');
    const mousedownEvent = {
      button: 0,
      target: rect || { id: 'ghost-svg', tagName: 'rect' },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    const ghostSvg = fixture.nativeElement.querySelector('[data-editor-ghost] svg');
    expect(ghostSvg).toBeTruthy();
    expect(ghostSvg?.getAttribute('overflow')).toBe('visible');
  });

  it('when shape drag is started, ghost viewBox should match shape bbox so shape fills the ghost', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="ghost-pad" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'ghost-pad',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    const rect = fixture.nativeElement.querySelector('#ghost-pad') || fixture.nativeElement.querySelector('rect');
    const shapeNode = rect || document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    vi.spyOn(shapeNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 30, 40));
    const mousedownEvent = {
      button: 0,
      target: rect || { id: 'ghost-pad', tagName: 'rect' },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    const ghostSvg = fixture.nativeElement.querySelector('[data-editor-ghost] svg');
    expect(ghostSvg).toBeTruthy();
    const vb = ghostSvg?.getAttribute('viewBox') ?? '';
    const [vx, vy, vw, vh] = vb.split(/\s+/).map(Number);
    expect(vw).toBeGreaterThanOrEqual(30);
    expect(vh).toBeGreaterThanOrEqual(40);
    expect(vx).toBeLessThanOrEqual(10);
    expect(vy).toBeLessThanOrEqual(20);
  });

  it('ghost preview clones must not reuse shape ids (translateShape would move the clone, then ghost removal loses the move)', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="solo" x="10" y="20" width="30" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'solo',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    const rect = fixture.nativeElement.querySelector('#solo') as SVGGraphicsElement;
    vi.spyOn(rect, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 30, 40));
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown({
      button: 0,
      target: rect,
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    expect(component.isDraggingShape).toBe(true);
    const idsInsideGhost = fixture.nativeElement.querySelectorAll('[data-editor-ghost] [id]');
    expect(idsInsideGhost.length).toBe(0);
  });

  it('in-document drag ghost is inserted before the dragged shape so later siblings still paint above', () => {
    fixture.componentRef.setInput(
      'svgContent',
      '<svg viewBox="0 0 100 100"><rect id="below" x="10" y="10" width="40" height="40" fill="red"/><rect id="above" x="30" y="30" width="40" height="40" fill="blue"/></svg>'
    );
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'below',
      type: 'rect',
      fill: '#f00',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 40, height: 40 });
    const below =
      (fixture.nativeElement.querySelector('#below') as SVGGraphicsElement | null) ??
      document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    vi.spyOn(below, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 40, 40));
    const mousedownEvent = {
      button: 0,
      target: below,
      clientX: 25,
      clientY: 25,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
    if (wrapperEl) {
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
    }
    stubEditorSvgScreenMapping(component);
    component.onCanvasMouseDown(mousedownEvent);
    expect(component.isDraggingShape).toBe(true);

    const ghost = fixture.nativeElement.querySelector('[data-editor-ghost]');
    const above = fixture.nativeElement.querySelector('#above');
    expect(ghost).toBeTruthy();
    expect(above).toBeTruthy();
    const pos = ghost!.compareDocumentPosition(above!);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('should apply snapped drag preview position when shape snapping is enabled', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setGridSnapEnabled(false);
    editorToolService.setShapeSnapEnabled(true);
    snapService.setGridEnabled(false);
    snapService.setShapeEnabled(true);
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 25, y: 40 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    vi.spyOn(svgManipulationService, 'getLayerStackItems').mockReturnValue([
      { id: 'drag-me', name: 'Drag Me', type: 'rect' },
      { id: 'guide-target', name: 'Guide Target', type: 'rect' }
    ]);
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockImplementation((id: string) => {
      if (id === 'drag-me') return { x: 10, y: 20, width: 30, height: 40 };
      if (id === 'guide-target') return { x: 30, y: 40, width: 30, height: 40 };
      return null;
    });
    const smartGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides').mockReturnValue({
      delta: { x: 12, y: 14 },
      guides: { vertical: [40], horizontal: [50] },
      matches: []
    });
    stubEditorSvgScreenMapping(component);

    component.onDocumentMouseMove({
      clientX: 45,
      clientY: 60,
      altKey: false
    } as MouseEvent);

    expect(smartGuideSpy).toHaveBeenCalledTimes(1);
    expect(dragHandler.overlayRect).toEqual({
      x: 22,
      y: 34,
      width: 30,
      height: 40
    });
  });

  it('should keep drag commit parity with preview when mouseup cannot map pointer', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setGridSnapEnabled(true);
    editorToolService.setShapeSnapEnabled(true);
    snapService.setGridEnabled(true);
    snapService.setShapeEnabled(true);
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
    const setVisibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 25, y: 40 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    dragHandler.ghost = { removeFragments: vi.fn(), clearDefs: vi.fn() };
    vi.spyOn(svgManipulationService, 'getLayerStackItems').mockReturnValue([
      { id: 'drag-me', name: 'Drag Me', type: 'rect' },
      { id: 'guide-target', name: 'Guide Target', type: 'rect' }
    ]);
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockImplementation((id: string) => {
      if (id === 'drag-me') return { x: 10, y: 20, width: 30, height: 40 };
      if (id === 'guide-target') return { x: 30, y: 40, width: 30, height: 40 };
      return null;
    });
    const smartGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides').mockReturnValue({
      delta: { x: 12, y: 14 },
      guides: { vertical: [40], horizontal: [50] },
      matches: []
    });
    const clientToPointSpy = vi.spyOn(component as any, 'clientToEditorSvgPoint');
    clientToPointSpy.mockReturnValueOnce({ x: 45, y: 60 });
    clientToPointSpy.mockReturnValueOnce(null);

    component.onDocumentMouseMove({
      clientX: 45,
      clientY: 60,
      altKey: false
    } as MouseEvent);

    component.onDocumentMouseUp({
      button: 0,
      clientX: 45,
      clientY: 60
    } as MouseEvent);
    expect(component.isDraggingShape).toBe(false);
    expect(smartGuideSpy).toHaveBeenCalledTimes(1);
    expect(translateSpy).toHaveBeenCalledWith('drag-me', 12, 14);
    expect(setVisibilitySpy).toHaveBeenCalledWith('drag-me', true);
  });

  it('should bypass smart-guide snapping during drag while Alt is pressed', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 10, y: 10 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];

    const smartGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides');
    component.altKeyPressed = true;
    stubEditorSvgScreenMapping(component);
    component.onDocumentMouseMove({
      clientX: 20,
      clientY: 20,
      altKey: true
    } as MouseEvent);

    expect(smartGuideSpy).not.toHaveBeenCalled();
    expect(component.verticalSmartGuideLines.length).toBe(0);
    expect(component.horizontalSmartGuideLines.length).toBe(0);
  });

  it('should constrain drag to dominant axis while Shift is held', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    editorToolService.setGridSnapEnabled(false);
    snapService.setGridEnabled(false);
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 10, y: 10 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    dragHandler.ghost = { removeFragments: vi.fn(), clearDefs: vi.fn() };
    stubEditorSvgScreenMapping(component);

    component.onDocumentMouseMove({ clientX: 30, clientY: 60, shiftKey: true } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, clientX: 30, clientY: 60, shiftKey: true } as MouseEvent);

    expect(translateSpy).toHaveBeenCalledWith('drag-me', 0, 50);
  });

  it('should defer Shift axis lock until drag movement exceeds threshold', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="drag-me" x="10" y="20" width="30" height="40"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');
    editorToolService.setGridSnapEnabled(false);
    snapService.setGridEnabled(false);
    shapeSelectionService.selectShape({
      id: 'drag-me',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
    const dragHandler = component['drag'] as any;
    dragHandler.isActive = true;
    dragHandler.shapeIds = ['drag-me'];
    dragHandler.visibilityShapeIds = ['drag-me'];
    dragHandler.startSvg = { x: 10, y: 10 };
    dragHandler.startBbox = { x: 10, y: 20, width: 30, height: 40 };
    dragHandler.snapAnchor = { x: 10, y: 20 };
    dragHandler.ghostFragments = [{ outerGroup: { remove: vi.fn(), matrix: vi.fn() } }];
    dragHandler.ghost = { removeFragments: vi.fn(), clearDefs: vi.fn() };
    stubEditorSvgScreenMapping(component);

    component.onDocumentMouseMove({ clientX: 13, clientY: 12, shiftKey: true } as MouseEvent);
    component.onDocumentMouseUp({ button: 0, clientX: 13, clientY: 12, shiftKey: true } as MouseEvent);

    expect(translateSpy).toHaveBeenCalledWith('drag-me', 3, 2);
  });

  it('should clear overlay when selection is cleared', async () => {
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle id="c1" cx="5" cy="5" r="5"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    shapeSelectionService.selectShape({
      id: 'c1',
      type: 'circle',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(component.highlightRect).not.toBeNull();
    shapeSelectionService.clearSelection();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    expect(component.highlightRect).toBeNull();
    const highlightRectEl = fixture.nativeElement.querySelector('.highlight-overlay rect[stroke="#2196F3"]');
    expect(highlightRectEl).toBeFalsy();
  });

  it('highlightRect should recompute when lastBbox size changes but x,y unchanged (cache includes w/h)', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="1" height="1"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    const spy = vi.spyOn(component as unknown as { svgBboxToOverlayPixels: (b: unknown) => unknown }, 'svgBboxToOverlayPixels');
    spy.mockImplementation((b: unknown) => {
      const bbox = b as { x: number; y: number; width: number; height: number };
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width * 10,
        height: bbox.height * 10
      };
    });
    (component as unknown as { _highlightRectCacheKey: string; _highlightRectCache: unknown; lastBbox: unknown })._highlightRectCacheKey =
      '';
    (component as unknown as { _highlightRectCache: unknown })._highlightRectCache = null;
    (component as unknown as { lastBbox: { x: number; y: number; width: number; height: number } }).lastBbox = {
      x: 0,
      y: 0,
      width: 16,
      height: 16
    };
    canvasViewService.scale = 1;
    const r1 = component.highlightRect;
    (component as unknown as { lastBbox: { x: number; y: number; width: number; height: number } }).lastBbox = {
      x: 0,
      y: 0,
      width: 32,
      height: 32
    };
    const r2 = component.highlightRect;
    spy.mockRestore();
    expect(r1?.width).toBe(160);
    expect(r2?.width).toBe(320);
  });

  it('highlightRect recomputes DOM union when documentRevision bumps even if lastBbox is unchanged', async () => {
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
      x: 10,
      y: 20,
      width: 50,
      height: 40
    });
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="50" height="40"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    shapeSelectionService.selectShape({
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();

    const fromDomSpy = vi.spyOn(
      component as unknown as { selectionHighlightOverlayFromDom: () => unknown },
      'selectionHighlightOverlayFromDom'
    );
    fromDomSpy.mockReturnValue({ x: 0, y: 0, width: 20, height: 20 });
    (component as unknown as { _highlightRectCacheKey: string })._highlightRectCacheKey = '';
    (component as unknown as { _highlightRectCache: unknown })._highlightRectCache = null;

    void component.highlightRect;
    expect(fromDomSpy).toHaveBeenCalledTimes(1);
    void component.highlightRect;
    expect(fromDomSpy).toHaveBeenCalledTimes(1);

    svgManipulationService.documentRevision.update((n) => n + 1);

    void component.highlightRect;
    expect(fromDomSpy).toHaveBeenCalledTimes(2);

    fromDomSpy.mockRestore();
  });

  describe('selection resize (corner handles)', () => {
    it('mousedown on handle starts resize; applyUnionScaleFromSnapshot runs once on mouseup not on move', async () => {
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
        x: 10,
        y: 20,
        width: 30,
        height: 40
      });
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>');
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      editorToolService.setTool('selector');
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
      const snapSpy = vi.spyOn(svgManipulationService, 'snapshotSelectionTransforms').mockReturnValue(new Map());
      const applySpy = vi.spyOn(svgManipulationService, 'applyUnionScaleFromSnapshot');
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
      const zoomEl = component.zoomWrapper()?.nativeElement as HTMLElement;
      if (zoomEl) {
        vi.spyOn(zoomEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const overlayEl = component.highlightOverlayContainer()?.nativeElement as HTMLElement;
      if (overlayEl) {
        vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }

      const handle = document.createElement('div');
      handle.setAttribute('data-resize-handle', 'se');
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect);

      stubEditorSvgScreenMapping(component);

      component.onCanvasMouseDown({
        button: 0,
        target: handle,
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isResizingSelection).toBe(true);
      expect(component.isDraggingShape).toBe(false);
      expect(snapSpy).toHaveBeenCalled();
      expect(applySpy).not.toHaveBeenCalled();

      canvasViewService.scale = 1;
      canvasViewService.panX = 0;
      canvasViewService.panY = 0;
      component.onDocumentMouseMove({
        clientX: 80,
        clientY: 70
      } as MouseEvent);
      expect(applySpy).not.toHaveBeenCalled();

      component.onDocumentMouseUp({
        button: 0,
        clientX: 80,
        clientY: 70
      } as MouseEvent);
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(component.isResizingSelection).toBe(false);
    });

    it('exposes smart guide overlay lines during resize and hides them when Alt is pressed', () => {
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      component.overlayViewBox = '0 0 100 100';

      const resizeHandler = component['resize'] as any;
      resizeHandler.isActive = true;
      resizeHandler.smartGuides = { vertical: [25], horizontal: [30] };

      expect(component.verticalSmartGuideLines.length).toBe(1);
      expect(component.horizontalSmartGuideLines.length).toBe(1);

      component.altKeyPressed = true;
      expect(component.verticalSmartGuideLines.length).toBe(0);
      expect(component.horizontalSmartGuideLines.length).toBe(0);
    });

    it('commits center-anchored resize when Alt is held on mouseup', () => {
      const resizeHandler = component['resize'] as any;
      const centerScaleSpy = vi.spyOn(svgManipulationService, 'applyUnionScaleFromCenter');
      resizeHandler.isActive = true;
      resizeHandler.handle = 'se';
      resizeHandler.unionStart = { x: 10, y: 20, width: 30, height: 40 };
      resizeHandler.lastUnion = { x: 5, y: 15, width: 40, height: 50 };
      resizeHandler.snapshot = new Map([['r1', { clone: () => ({}) }]]);
      resizeHandler.ghostFragments = [];
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });

      component.onDocumentMouseUp({ button: 0, altKey: true } as MouseEvent);

      expect(centerScaleSpy).toHaveBeenCalledTimes(1);
      expect(component.isResizingSelection).toBe(false);
    });
  });

  describe('selection rotate (handle)', () => {
    it('mousedown on rotate handle starts rotate; applyUnionRotationFromSnapshot runs once on mouseup not on move', async () => {
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
        x: 10,
        y: 20,
        width: 30,
        height: 40
      });
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="10" y="20" width="30" height="40"/></svg>');
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      editorToolService.setTool('selector');
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
      const snapSpy = vi.spyOn(svgManipulationService, 'snapshotSelectionTransforms').mockReturnValue(new Map());
      const applySpy = vi.spyOn(svgManipulationService, 'applyUnionRotationFromSnapshot');
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
      const zoomEl = component.zoomWrapper()?.nativeElement as HTMLElement;
      if (zoomEl) {
        vi.spyOn(zoomEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const overlayEl = component.highlightOverlayContainer()?.nativeElement as HTMLElement;
      if (overlayEl) {
        vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }

      const handle = document.createElement('div');
      handle.setAttribute('data-rotate-handle', '');
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect);
      stubEditorSvgScreenMapping(component);

      component.onCanvasMouseDown({
        button: 0,
        target: handle,
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isRotatingSelection).toBe(true);
      expect(component.isResizingSelection).toBe(false);
      expect(snapSpy).toHaveBeenCalled();
      expect(applySpy).not.toHaveBeenCalled();

      canvasViewService.scale = 1;
      canvasViewService.panX = 0;
      canvasViewService.panY = 0;
      component.onDocumentMouseMove({
        clientX: 80,
        clientY: 70
      } as MouseEvent);
      expect(applySpy).not.toHaveBeenCalled();

      component.onDocumentMouseUp({
        button: 0,
        clientX: 80,
        clientY: 70
      } as MouseEvent);
      expect(applySpy).toHaveBeenCalledTimes(1);
      expect(component.isRotatingSelection).toBe(false);
    });

    it('snaps rotation to 15-degree increments while Shift is held', () => {
      const rotateHandler = component['rotate'] as any;
      const applySpy = vi.spyOn(svgManipulationService, 'applyUnionRotationFromSnapshot');
      rotateHandler.isActive = true;
      rotateHandler.unionStart = { x: 0, y: 0, width: 100, height: 100 };
      rotateHandler.pivotDoc = { x: 50, y: 50 };
      rotateHandler.snapshot = new Map([['r1', { clone: () => ({}) }]]);
      rotateHandler.ghostFragments = [{ outerGroup: { remove: vi.fn() }, worldToUnion: { matrix: vi.fn() } }];
      rotateHandler.lastPointerSvg = { x: 90, y: 50 };
      rotateHandler.startPointerRad = 0;
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      vi.spyOn(component as any, 'clientToEditorSvgPoint').mockReturnValue({ x: 70, y: 70 });

      component.onDocumentMouseMove({ clientX: 70, clientY: 70, shiftKey: true } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, shiftKey: true } as MouseEvent);

      const angleDeg = applySpy.mock.calls[0]?.[2] ?? 0;
      expect(angleDeg % 15).toBeCloseTo(0, 6);
    });
  });

  describe('viewBox visibility in editor', () => {
    it('should render viewBox as a white-filled rect with a thin non-scaling overlay stroke when SVG has viewBox', async () => {
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      const canvasSvg = fixture.nativeElement.querySelector('.svg-canvas svg');
      expect(canvasSvg).toBeTruthy();
      const viewBoxFillRect = canvasSvg?.querySelector('rect[data-editor-viewbox-rect]');
      expect(viewBoxFillRect).toBeTruthy();
      expect(viewBoxFillRect?.getAttribute('fill')?.toLowerCase()).toBe('#ffffff');
      expect(viewBoxFillRect?.getAttribute('stroke')?.toLowerCase()).toBe('none');
      expect(component.viewBoxOverlayRect).not.toBeNull();
      const boundaryRect = fixture.nativeElement.querySelector('[data-testid="canvas-viewbox-boundary-overlay"]');
      expect(boundaryRect).toBeTruthy();
      expect(boundaryRect?.getAttribute('stroke')?.toLowerCase()).toBe('#cccccc');
      expect(boundaryRect?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
      expect(boundaryRect?.getAttribute('filter')).toContain('editor-artboard-boundary-shadow');
    });

    it('should show elements outside viewBox in the DOM (all elements visible)', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="outside-rect" x="150" y="150" width="30" height="30"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      const outsideRect = fixture.nativeElement.querySelector('#outside-rect');
      expect(outsideRect).toBeTruthy();
    });

    it('should render light grey area outside viewBox', async () => {
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      const svg = fixture.nativeElement.querySelector('.svg-canvas svg');
      expect(svg).toBeTruthy();
      const outsideRect = svg?.querySelector('rect[data-editor-outside-rect]');
      expect(outsideRect).toBeTruthy();
      const fill = outsideRect?.getAttribute('fill')?.toLowerCase() ?? '';
      expect(fill === '#bfbfbf' || fill.match(/gray|grey/)).toBeTruthy();
    });
  });

  describe('path node edit mode', () => {
    async function loadSvgForSelector(svg: string): Promise<void> {
      fixture.componentRef.setInput('svgContent', svg);
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      editorToolService.setTool('selector');
      stubEditorSvgScreenMapping(component, new DOMRect(0, 0, 100, 100), '0 0 100 100');
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    }

    async function activateNodeEditSelectorTool(): Promise<void> {
      editorToolService.setTool('node-edit-selector');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
    }

    it('positions node-edit anchors in root space when path has translate transform (static transform attr)', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-tx" transform="translate(20 30)" d="M 10 10 L 20 20" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-tx',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      const anchor0 = fixture.nativeElement.querySelector(
        '[data-testid="canvas-path-node-anchor"][data-path-node-path-id="path-tx"][data-path-node-anchor-index="0"]'
      ) as SVGCircleElement;
      expect(anchor0).toBeTruthy();
      // Local M 10 10 + translate(20,30) => root (30, 40); overlay must match painted geometry.
      expect(Number(anchor0.getAttribute('cx'))).toBeCloseTo(30, 5);
      expect(Number(anchor0.getAttribute('cy'))).toBeCloseTo(40, 5);
    });

    /** Regression (svg-editor-0lw): selection move uses SVG matrix; `d` stays local — overlays must use root user space. */
    it('aligns node-edit overlay after selection translate (matrix move without changing d)', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-move-then-node" d="M 10 10 L 20 20" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-move-then-node',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const snap = svgManipulationService.snapshotSelectionTransforms(['path-move-then-node']);
      new TranslateCommand(svgManipulationService, 'path-move-then-node', 15, 25, snap).execute();
      fixture.detectChanges();
      await activateNodeEditSelectorTool();
      const anchor0 = fixture.nativeElement.querySelector(
        '[data-testid="canvas-path-node-anchor"][data-path-node-path-id="path-move-then-node"][data-path-node-anchor-index="0"]'
      ) as SVGCircleElement;
      expect(anchor0).toBeTruthy();
      expect(Number(anchor0.getAttribute('cx'))).toBeCloseTo(25, 5);
      expect(Number(anchor0.getAttribute('cy'))).toBeCloseTo(35, 5);
    });

    it('dragging an anchor moves both its incoming and outgoing handles by the same delta', async () => {
      // Path: M(0,0) → C P1=(10,0) P2=(20,0) anchor=(30,0) → C P1=(30,10) P2=(40,10) anchor=(60,0)
      // Middle anchor is at (30,0). Incoming P2=(20,0), outgoing P1=(30,10).
      // After dragging by (+5,+5): anchor→(35,5), P2→(25,5), P1→(35,15).
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-c" d="M 0 0 C 10 0 20 0 30 0 C 30 10 40 10 60 0" /></svg>'
      );
      shapeSelectionService.selectShape({ id: 'path-c', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 });
      await activateNodeEditSelectorTool();

      // Fake anchor element for middle node (anchor index 1, segment index 2 for a M+C+C path)
      const fakeAnchor = document.createElement('circle');
      fakeAnchor.setAttribute('data-path-node-anchor-index', '1');
      fakeAnchor.setAttribute('data-path-node-path-id', 'path-c');
      fakeAnchor.setAttribute('data-path-node-edit-target', 'true');

      component.onCanvasMouseDown({
        button: 0, clientX: 30, clientY: 0, detail: 1,
        target: fakeAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 35, clientY: 5 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 35, clientY: 5 } as MouseEvent);
      fixture.detectChanges();

      const d =
        (component.svgContainer()?.nativeElement?.querySelector('#path-c') as SVGPathElement | null)
          ?.getAttribute('d') ?? '';
      // Incoming P2: was (20,0) → (25,5); anchor: was (30,0) → (35,5)
      expect(d).toContain('C 10 0 25 5 35 5');
      // Outgoing P1: was (30,10) → (35,15)
      expect(d).toContain('C 35 15');
    });

    it('enters node-edit mode for a selected path when node-edit selector tool is active', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 C 20 10 30 20 40 40 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      const controlLines = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-line"]');
      const controlHandles = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]');
      expect(anchors.length).toBe(3);
      expect(controlLines.length).toBe(2);
      expect(controlHandles.length).toBe(2);
    });

    it('omits duplicate node-edit anchor when closing segment ends at moveto before Z', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 200 200"><path id="path-elide-close" fill="none" stroke="black" d="M 10 10 C 55 5 55 25 100 25 C 100 15.5 10 10 10 10 Z"/></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-elide-close',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      fixture.detectChanges();
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      expect(anchors.length).toBe(2);
    });

    it('pen-style two-cubic close: two anchors and no degenerate handles on collapsed controls (user regression)', async () => {
      const d =
        'M 251 188.703125 C 251 188.703125 436 118.553125 436 191.703125 C 436 264.853125 251 188.703125 251 188.703125 Z';
      await loadSvgForSelector(
        `<svg viewBox="0 0 500 500"><path id="path-pen-2c-close" fill="none" stroke="black" d="${d}"/></svg>`
      );
      shapeSelectionService.selectShape({
        id: 'path-pen-2c-close',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]').length).toBe(2);
      // Degenerate P1 (on M) and degenerate P2 (on closing anchor) are hidden — not confused with extra nodes.
      expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]').length).toBe(2);
    });

    it('hides blue selection rect when node-edit-selector tool is active; restores on switch to selector', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      fixture.detectChanges();

      expect(component.isPathNodeEditModeActive).toBe(true);
      // Highlight rect element must not appear in node-edit mode
      expect(fixture.nativeElement.querySelector('.highlight-overlay rect[stroke="#2196F3"]')).toBeFalsy();
    });

    it('hides path node overlays while dragging selection (translate)', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      expect(component.showPathNodeEditOverlays).toBe(true);
      expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]').length).toBeGreaterThan(0);

      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      const pathEl =
        (component.svgContainer()?.nativeElement?.querySelector('#path-a') as SVGPathElement | null) ??
        document.createElementNS('http://www.w3.org/2000/svg', 'path');
      vi.spyOn(pathEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(15, 15, 50, 40));
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      if (wrapperEl) {
        vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          top: 0,
          width: 100,
          height: 100,
          right: 100,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: () => {}
        });
      }
      stubEditorSvgScreenMapping(component);

      component.onCanvasMouseDown({
        button: 0,
        target: pathEl,
        clientX: 35,
        clientY: 30,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isDraggingShape).toBe(true);
      expect(component.showPathNodeEditOverlays).toBe(false);
    });

    it('hides path node overlays while resizing selection', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      expect(component.showPathNodeEditOverlays).toBe(true);

      vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      vi.spyOn(svgManipulationService, 'snapshotSelectionTransforms').mockReturnValue(new Map());
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      const zoomEl = component.zoomWrapper()?.nativeElement as HTMLElement;
      if (zoomEl) {
        vi.spyOn(zoomEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const overlayEl = component.highlightOverlayContainer()?.nativeElement as HTMLElement;
      if (overlayEl) {
        vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect);
      stubEditorSvgScreenMapping(component);

      const handle = document.createElement('div');
      handle.setAttribute('data-resize-handle', 'se');
      component.onCanvasMouseDown({
        button: 0,
        target: handle,
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isResizingSelection).toBe(true);
      expect(component.showPathNodeEditOverlays).toBe(false);
    });

    it('hides path node overlays while rotating selection', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      expect(component.showPathNodeEditOverlays).toBe(true);

      vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      vi.spyOn(svgManipulationService, 'snapshotSelectionTransforms').mockReturnValue(new Map());
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      const zoomEl = component.zoomWrapper()?.nativeElement as HTMLElement;
      if (zoomEl) {
        vi.spyOn(zoomEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const overlayEl = component.highlightOverlayContainer()?.nativeElement as HTMLElement;
      if (overlayEl) {
        vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect);
      stubEditorSvgScreenMapping(component);

      const handle = document.createElement('div');
      handle.setAttribute('data-rotate-handle', '');
      component.onCanvasMouseDown({
        button: 0,
        target: handle,
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isRotatingSelection).toBe(true);
      expect(component.showPathNodeEditOverlays).toBe(false);
    });

    it('hides path node overlays while skewing selection', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 60 50" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-a',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      expect(component.showPathNodeEditOverlays).toBe(true);

      vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      vi.spyOn(svgManipulationService, 'snapshotSelectionTransforms').mockReturnValue(new Map());
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 50, height: 40 });
      const zoomEl = component.zoomWrapper()?.nativeElement as HTMLElement;
      if (zoomEl) {
        vi.spyOn(zoomEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const overlayEl = component.highlightOverlayContainer()?.nativeElement as HTMLElement;
      if (overlayEl) {
        vi.spyOn(overlayEl, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 200));
      }
      const wrapperEl = component.svgContainer()?.nativeElement as HTMLElement;
      vi.spyOn(wrapperEl, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => {}
      } as DOMRect);
      stubEditorSvgScreenMapping(component);

      const handle = document.createElement('div');
      handle.setAttribute('data-skew-handle', 'n');
      component.onCanvasMouseDown({
        button: 0,
        target: handle,
        clientX: 50,
        clientY: 50,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);

      expect(component.isSkewingSelection).toBe(true);
      expect(component.showPathNodeEditOverlays).toBe(false);
    });

    it('renders node affordances for all selected editable paths in multi-select', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 L 20 20 L 30 10" /><path id="path-b" d="M 50 50 C 60 50 70 60 80 80" /><rect id="rect-non-path" x="5" y="60" width="10" height="10" /></svg>'
      );
      shapeSelectionService.selectShapes([
        { id: 'path-a', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'path-b', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'rect-non-path', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
      ]);
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      const controlHandles = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]');
      expect(anchors.length).toBe(5);
      expect(controlHandles.length).toBe(2);
      expect(
        Array.from(anchors).some((node) => (node as Element).getAttribute('data-path-node-path-id') === 'path-a')
      ).toBe(true);
      expect(
        Array.from(anchors).some((node) => (node as Element).getAttribute('data-path-node-path-id') === 'path-b')
      ).toBe(true);
    });

    it('edits only the targeted path node while preserving multi-selection context', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-left" d="M 10 10 L 20 20" /><path id="path-right" d="M 60 60 L 80 80" /><rect id="rect-keep" x="40" y="40" width="8" height="8" /></svg>'
      );
      shapeSelectionService.selectShapes([
        { id: 'path-left', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'path-right', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'rect-keep', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
      ]);
      await activateNodeEditSelectorTool();

      const leftPath = fixture.nativeElement.querySelector('#path-left') as SVGPathElement;
      const rightPath = fixture.nativeElement.querySelector('#path-right') as SVGPathElement;
      const leftBefore = leftPath.getAttribute('d');
      const rightBefore = rightPath.getAttribute('d');
      const rightAnchor = fixture.nativeElement.querySelector(
        '[data-testid="canvas-path-node-anchor"][data-path-node-path-id="path-right"][data-path-node-anchor-index="0"]'
      ) as Element;

      component.onCanvasMouseDown({
        button: 0,
        clientX: 60,
        clientY: 60,
        target: rightAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 65, clientY: 70 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 65, clientY: 70 } as MouseEvent);
      fixture.detectChanges();

      expect(rightPath.getAttribute('d')).not.toBe(rightBefore);
      expect(leftPath.getAttribute('d')).toBe(leftBefore);
      expect(shapeSelectionService.getSelectedShapes().map((shape) => shape.id).sort()).toEqual(
        ['path-left', 'path-right', 'rect-keep'].sort()
      );
    });

    it('marks a clicked node as selected in node-edit mode', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-select-node" d="M 10 10 L 20 20 L 30 30" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-select-node',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      const middleAnchor = anchors[1] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        target: middleAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 20, clientY: 20 } as MouseEvent);
      fixture.detectChanges();

      const refreshedAnchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      expect((refreshedAnchors[1] as Element).classList.contains('path-node-anchor-selected')).toBe(true);
    });

    it('drags an anchor and updates path d live', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-drag-anchor" d="M 10 10 L 20 20" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-drag-anchor',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-drag-anchor') as SVGPathElement;
      await activateNodeEditSelectorTool();

      const firstAnchor = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]')[0] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        target: firstAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 15, clientY: 25 } as MouseEvent);

      expect(pathEl.getAttribute('d')).toContain('M 15 25');

      component.onDocumentMouseUp({ button: 0, clientX: 15, clientY: 25 } as MouseEvent);
      fixture.detectChanges();
      expect(pathEl.getAttribute('d')).toContain('M 15 25');
    });

    it('deletes selected node with Delete and supports undo/redo', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-delete-node" d="M 10 10 L 20 20 L 30 30" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-delete-node',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-delete-node') as SVGPathElement;
      const dBefore = pathEl.getAttribute('d') ?? '';
      await activateNodeEditSelectorTool();

      const middleAnchor = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]')[1] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        target: middleAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 20, clientY: 20 } as MouseEvent);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      fixture.detectChanges();

      const dAfter = pathEl.getAttribute('d') ?? '';
      expect(dAfter).not.toBe(dBefore);
      expect(dAfter).toContain('M 10 10 L 30 30');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dBefore);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dAfter);
    });

    it('prevents deleting below minimum node count and shows feedback', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-delete-guard" d="M 10 10 L 20 20" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-delete-guard',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-delete-guard') as SVGPathElement;
      const dBefore = pathEl.getAttribute('d') ?? '';
      await activateNodeEditSelectorTool();

      const firstAnchor = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]')[0] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        target: firstAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 10, clientY: 10 } as MouseEvent);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      fixture.detectChanges();

      expect(pathEl.getAttribute('d')).toBe(dBefore);
      const feedback = fixture.nativeElement.querySelector('[data-testid="canvas-path-node-edit-feedback"]');
      expect(feedback).toBeTruthy();
      expect((feedback as HTMLElement).textContent ?? '').toContain('at least 2 nodes');
    });

    it('commits anchor drag as a single undoable node-edit command', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-drag-anchor-undo" d="M 10 10 L 20 20" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-drag-anchor-undo',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-drag-anchor-undo') as SVGPathElement;
      const dBefore = pathEl.getAttribute('d') ?? '';
      await activateNodeEditSelectorTool();

      const firstAnchor = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]')[0] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        target: firstAnchor,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 15, clientY: 25 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 15, clientY: 25 } as MouseEvent);

      const dAfter = pathEl.getAttribute('d') ?? '';
      expect(dAfter).not.toBe(dBefore);
      expect(editorHistoryService.canUndo()).toBe(true);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dBefore);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dAfter);
    });

    it('drags a control handle and supports undo/redo as one drag operation', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-drag-handle" d="M 10 10 C 20 10 30 20 40 40" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-drag-handle',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-drag-handle') as SVGPathElement;
      const dBefore = pathEl.getAttribute('d') ?? '';
      await activateNodeEditSelectorTool();

      const firstHandle = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]')[0] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 10,
        target: firstHandle,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 25, clientY: 5 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 25, clientY: 5 } as MouseEvent);

      const dAfter = pathEl.getAttribute('d') ?? '';
      expect(dAfter).not.toBe(dBefore);
      expect(dAfter).toContain('C 25 5');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dBefore);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dAfter);
      expect(editorHistoryService.canUndo()).toBe(true);
    });

    it('exits node-edit mode on Escape', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-esc" d="M 10 10 L 20 20" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-esc',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();
      expect(component.isPathNodeEditModeActive).toBe(true);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(component.isPathNodeEditModeActive).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="canvas-path-node-anchor"]')).toBeFalsy();
    });

    it('exits node-edit mode when clicking outside the edited path', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-out" d="M 10 10 L 20 20" /><rect id="other" x="40" y="40" width="10" height="10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-out',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const otherEl = fixture.nativeElement.querySelector('#other') as Element;
      await activateNodeEditSelectorTool();
      expect(component.isPathNodeEditModeActive).toBe(true);

      component.onCanvasClick({ target: otherEl } as unknown as MouseEvent);
      fixture.detectChanges();

      expect(component.isPathNodeEditModeActive).toBe(false);
    });

    it('keeps group double-click drill-in behavior working', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><g id="grp"><rect id="child-rect" x="10" y="10" width="20" height="20" /></g></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'grp',
        type: 'g',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const childEl = fixture.nativeElement.querySelector('#child-rect') as Element;

      component.onCanvasDoubleClick({ target: childEl } as unknown as MouseEvent);
      fixture.detectChanges();

      expect(component.drilledIntoGroupId).toBe('grp');
      expect(shapeSelectionService.getSelectedShapes().map((shape) => shape.id)).toEqual(['child-rect']);
      expect(component.isPathNodeEditModeActive).toBe(false);
    });

    it('enters inline text-edit mode from selected text on double-click', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><text id="text-a" x="10" y="20">Hello</text></svg>');
      vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({ x: 10, y: 10, width: 30, height: 12 });
      shapeSelectionService.selectShape({
        id: 'text-a',
        type: 'text',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const textEl = fixture.nativeElement.querySelector('#text-a') as Element;

      component.onCanvasDoubleClick({ target: textEl } as unknown as MouseEvent);
      fixture.detectChanges();

      const editor = fixture.nativeElement.querySelector('[data-testid="canvas-inline-text-editor"]') as HTMLTextAreaElement;
      expect(editor).toBeTruthy();
      expect(editor.value).toBe('Hello');
      expect(editor.getAttribute('aria-label')).toBe('Edit canvas text');
      expect(editor.getAttribute('aria-multiline')).toBe('true');
      expect(editor.getAttribute('title')).toContain('Escape');
      expect(component.drilledIntoGroupId).toBeNull();
    });

    it('inline text editor font tracks SVG text typography and overlay scale', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><text id="text-typo" x="10" y="40" font-size="24" font-weight="700" font-style="italic" font-family="Georgia">Hi</text></svg>'
      );
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      const bboxSpy = vi
        .spyOn(svgManipulationService, 'getShapeBBox')
        .mockReturnValue({ x: 10, y: 20, width: 40, height: 28 });
      try {
        shapeSelectionService.selectShape({
          id: 'text-typo',
          type: 'text',
          fill: '#000',
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1
        });
        const textEl = fixture.nativeElement.querySelector('#text-typo') as SVGTextElement;

        component.onCanvasDoubleClick({ target: textEl } as unknown as MouseEvent);
        fixture.detectChanges();

        const editor = fixture.nativeElement.querySelector(
          '[data-testid="canvas-inline-text-editor"]'
        ) as HTMLTextAreaElement;
        expect(editor).toBeTruthy();
        expect(editor.style.font).toMatch(/24px/);
        expect(editor.style.font).toMatch(/italic/i);
        expect(editor.style.font).toMatch(/Georgia/i);
      } finally {
        bboxSpy.mockRestore();
      }
    });

    it('commits inline text edit on Escape and supports undo/redo', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><text id="text-esc" x="10" y="20">Hello</text></svg>');
      shapeSelectionService.selectShape({
        id: 'text-esc',
        type: 'text',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const textEl = fixture.nativeElement.querySelector('#text-esc') as SVGTextElement;

      component.onCanvasDoubleClick({ target: textEl } as unknown as MouseEvent);
      fixture.detectChanges();
      component.onInlineTextEditInput({ target: { value: 'Edited' } } as unknown as Event);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="canvas-inline-text-editor"]')).toBeFalsy();
      expect(textEl.textContent).toBe('Edited');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(textEl.textContent).toBe('Hello');
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(textEl.textContent).toBe('Edited');
    });

    it('commits inline text edit on outside click', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><text id="text-click" x="10" y="20">Hello</text><rect id="other" x="30" y="30" width="10" height="10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'text-click',
        type: 'text',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const textEl = fixture.nativeElement.querySelector('#text-click') as SVGTextElement;
      const otherEl = fixture.nativeElement.querySelector('#other') as Element;

      component.onCanvasDoubleClick({ target: textEl } as unknown as MouseEvent);
      fixture.detectChanges();
      component.onInlineTextEditInput({ target: { value: 'Outside' } } as unknown as Event);
      component.onCanvasClick({ target: otherEl } as unknown as MouseEvent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="canvas-inline-text-editor"]')).toBeFalsy();
      expect(textEl.textContent).toBe('Outside');
    });

    it('treats selected text with tspan children as parent text for inline edit', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><text id="text-tspan" x="10" y="20"><tspan id="span-a">Line</tspan></text></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'text-tspan',
        type: 'text',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const tspanEl = fixture.nativeElement.querySelector('#span-a') as Element;

      component.onCanvasDoubleClick({ target: tspanEl } as unknown as MouseEvent);
      fixture.detectChanges();
      component.onInlineTextEditInput({ target: { value: 'Merged' } } as unknown as Event);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      const textEl = fixture.nativeElement.querySelector('#text-tspan') as SVGTextElement;
      expect(textEl.textContent).toBe('Merged');
    });

    it('does not enter inline text-edit mode for multi-select', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><text id="text-multi" x="10" y="20">Hello</text><rect id="rect-multi" x="30" y="30" width="10" height="10" /></svg>'
      );
      const svg = svgManipulationService.getSVGInstance()!;
      const textShape = svg.findOne('#text-multi')!;
      const rectShape = svg.findOne('#rect-multi')!;
      shapeSelectionService.selectShapes([
        svgManipulationService.getShapeProperties(textShape),
        svgManipulationService.getShapeProperties(rectShape)
      ]);
      const textEl = fixture.nativeElement.querySelector('#text-multi') as Element;

      component.onCanvasDoubleClick({ target: textEl } as unknown as MouseEvent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="canvas-inline-text-editor"]')).toBeFalsy();
    });

    it('does not enter node-edit mode from double-click on path in selector mode', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-no-dbl" d="M 10 10 L 20 20" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-no-dbl',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-no-dbl') as Element;

      component.onCanvasDoubleClick({ target: pathEl } as unknown as MouseEvent);
      fixture.detectChanges();

      expect(component.isPathNodeEditModeActive).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="canvas-path-node-anchor"]')).toBeFalsy();
    });

    it('does not enter node-edit mode when selected path data cannot be parsed', async () => {
      await loadSvgForSelector('<svg viewBox="0 0 100 100"><path id="path-bad" d="M 10 10 L ?" /></svg>');
      shapeSelectionService.selectShape({
        id: 'path-bad',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(false);
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      expect(anchors.length).toBe(0);
      const feedback = fixture.nativeElement.querySelector('[data-testid="canvas-path-node-edit-feedback"]');
      expect((feedback as HTMLElement | null)?.textContent ?? '').toContain('Node editing supports');
    });

    it('enters node-edit mode for arc paths by normalizing arcs to cubic segments', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-arc" d="M 10 10 A 10 10 0 0 1 40 10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-arc',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-arc') as SVGPathElement;
      const beforeD = pathEl.getAttribute('d');
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      expect(pathEl.getAttribute('d')).toBe(beforeD);
      expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]').length).toBeGreaterThan(1);
      expect(fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]').length).toBeGreaterThan(1);
    });

    it('enters node-edit mode for quadratic Q and smooth T segments', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-q" d="M 10 10 Q 20 5 30 10 T 50 10 L 60 10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-q',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      const handles = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]');
      expect(anchors.length).toBe(4);
      expect(handles.length).toBe(2);
    });

    it('enters node-edit mode for cubic C and smooth S segments', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-s" d="M 10 10 C 20 0 30 0 40 10 S 60 20 70 10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-s',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      await activateNodeEditSelectorTool();

      expect(component.isPathNodeEditModeActive).toBe(true);
      const anchors = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-anchor"]');
      const handles = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]');
      expect(anchors.length).toBe(3);
      expect(handles.length).toBe(4);
    });

    it('drags a quadratic control handle with undo/redo as one drag operation', async () => {
      await loadSvgForSelector(
        '<svg viewBox="0 0 100 100"><path id="path-q-handle" d="M 10 10 Q 20 5 30 10" /></svg>'
      );
      shapeSelectionService.selectShape({
        id: 'path-q-handle',
        type: 'path',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pathEl = fixture.nativeElement.querySelector('#path-q-handle') as SVGPathElement;
      const dBefore = pathEl.getAttribute('d') ?? '';
      await activateNodeEditSelectorTool();

      const firstHandle = fixture.nativeElement.querySelectorAll('[data-testid="canvas-path-node-control-handle"]')[0] as Element;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 5,
        target: firstHandle,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 22, clientY: 8 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 22, clientY: 8 } as MouseEvent);

      const dAfter = pathEl.getAttribute('d') ?? '';
      expect(dAfter).not.toBe(dBefore);
      expect(dAfter).toContain('Q 22 8');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dBefore);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true, bubbles: true }));
      expect(pathEl.getAttribute('d')).toBe(dAfter);
    });
  });

  describe('pen tool', () => {
    async function loadSvgAndPenMode(svg: string): Promise<void> {
      fixture.componentRef.setInput('svgContent', svg);
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 100;
      component.wrapperHeight = 100;
      editorToolService.setTool('pen');
      editorToolService.setPenAltCurveMode(false);
      stubEditorSvgScreenMapping(component, new DOMRect(0, 0, 100, 100), '0 0 100 100');
      fixture.detectChanges();
    }

    async function loadEmptySvgAndPenMode(): Promise<void> {
      await loadSvgAndPenMode('<svg viewBox="0 0 100 100"></svg>');
    }

    it('ignores pen mousedown when target is existing editor content shape', async () => {
      await loadSvgAndPenMode('<svg viewBox="0 0 100 100"><rect id="existing-shape" x="10" y="10" width="20" height="20"/></svg>');
      const shapeEl = fixture.nativeElement.querySelector('#existing-shape') as Element | null;
      expect(shapeEl).toBeTruthy();

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 15,
        clientY: 15,
        detail: 1,
        target: shapeEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(component.isPenSessionActive).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('pen tool inserts a node on an existing path line segment', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-insert-line" d="M 0 0 L 100 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-insert-line') as SVGPathElement | null;
      expect(pathEl).toBeTruthy();

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 4,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(preventDefault).toHaveBeenCalled();
      const d = pathEl?.getAttribute('d') ?? '';
      const ls = (d.match(/\bL\b/g) ?? []).length;
      expect(ls).toBeGreaterThanOrEqual(2);
      expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toContain('pen-insert-line');
    });

    it('pen tool inserts a node on a cubic segment', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-insert-cubic" d="M 0 0 C 0 50 100 50 100 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-insert-cubic') as SVGPathElement | null;
      expect(pathEl).toBeTruthy();

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 38,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(preventDefault).toHaveBeenCalled();
      const d = pathEl?.getAttribute('d') ?? '';
      expect((d.match(/\bC\b/g) ?? []).length).toBe(2);
    });

    it('pen tool inserts a node on a quadratic segment', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-insert-quad" d="M 0 0 Q 50 80 100 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-insert-quad') as SVGPathElement | null;
      expect(pathEl).toBeTruthy();

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 38,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(preventDefault).toHaveBeenCalled();
      const d = pathEl?.getAttribute('d') ?? '';
      expect((d.match(/\bQ\b/g) ?? []).length).toBe(2);
    });

    it('pen tool does not insert when click is off the stroke', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-miss" d="M 0 0 L 100 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-miss') as SVGPathElement | null;
      expect(pathEl).toBeTruthy();
      const before = pathEl?.getAttribute('d');

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 40,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pathEl?.getAttribute('d')).toBe(before);
    });

    it('pen tool does not insert on paths with unsupported commands', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-bad-cmd" d="M 0 0 R 20 20 40 0 L 80 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-bad-cmd') as SVGPathElement | null;
      expect(pathEl).toBeTruthy();
      const before = pathEl?.getAttribute('d');

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 70,
        clientY: 2,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(preventDefault).not.toHaveBeenCalled();
      expect(pathEl?.getAttribute('d')).toBe(before);
    });

    it('pen path insert is a single undo step', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-undo-line" d="M 0 0 L 100 0" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-undo-line') as SVGPathElement | null;
      const before = pathEl?.getAttribute('d');

      component.onCanvasMouseDown({
        button: 0,
        clientX: 40,
        clientY: 3,
        detail: 1,
        target: pathEl,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(pathEl?.getAttribute('d')).not.toBe(before);
      editorHistoryService.undo();
      fixture.detectChanges();
      expect(pathEl?.getAttribute('d')).toBe(before);
    });

    it('pen tool does not insert on path while a pen stroke is in progress', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="pen-busy" d="M 0 50 L 100 50" fill="none" stroke="black"/></svg>'
      );
      const pathEl = fixture.nativeElement.querySelector('#pen-busy') as SVGPathElement | null;
      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      expect(pathEl).toBeTruthy();
      expect(svgRoot).toBeTruthy();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 5,
        clientY: 5,
        detail: 1,
        target: svgRoot,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      const before = pathEl?.getAttribute('d');
      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 50,
        detail: 1,
        target: pathEl,
        preventDefault
      } as unknown as MouseEvent);

      expect(pathEl?.getAttribute('d')).toBe(before);
      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('accepts pen mousedown on empty canvas background', async () => {
      await loadSvgAndPenMode('<svg viewBox="0 0 100 100"><rect id="existing-shape" x="10" y="10" width="20" height="20"/></svg>');
      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      expect(svgRoot).toBeTruthy();

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 80,
        clientY: 80,
        detail: 1,
        target: svgRoot,
        preventDefault
      } as unknown as MouseEvent);

      expect(component.isPenSessionActive).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('snaps pen anchor placement to grid when only grid snap is enabled', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(true);
      editorToolService.setShapeSnapEnabled(false);
      snapService.setGridSize(10);
      fixture.detectChanges();

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 12,
        clientY: 18,
        detail: 1,
        target: svgRoot,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(component.penSessionPreviewPathD).toContain('M 10 20');
    });

    it('applies smart-guide snapping to pen anchors when shape snap is enabled', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(true);
      const shapeGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides').mockReturnValue({
        delta: { x: 3, y: -2 },
        guides: { vertical: [], horizontal: [] },
        matches: []
      });
      fixture.detectChanges();

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 12,
        clientY: 18,
        detail: 1,
        target: svgRoot,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(shapeGuideSpy).toHaveBeenCalled();
      expect(component.penSessionPreviewPathD).toContain('M 15 16');
    });

    it('still applies grid snap when Shift is held on first anchor (Shift constrains Bézier handles while dragging)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(true);
      editorToolService.setShapeSnapEnabled(true);
      const shapeGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides');
      fixture.detectChanges();

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 12,
        clientY: 18,
        detail: 1,
        shiftKey: true,
        target: svgRoot,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(shapeGuideSpy).toHaveBeenCalled();
      expect(component.penSessionPreviewPathD).toContain('M 10 20');
    });

    it('bypasses pen snapping when Cmd/Ctrl is held (j24.1)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(true);
      editorToolService.setShapeSnapEnabled(true);
      const shapeGuideSpy = vi.spyOn(snapService, 'snapDeltaToSmartGuides');
      fixture.detectChanges();

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg') as Element | null;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 12,
        clientY: 18,
        detail: 1,
        metaKey: true,
        target: svgRoot,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      expect(shapeGuideSpy).not.toHaveBeenCalled();
      expect(component.penSessionPreviewPathD).toContain('M 12 18');
    });

    it('Control+drag after M authors quadratic Q segment (h76)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 10,
        detail: 1,
        ctrlKey: true,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      const bend = MARQUEE_MIN_DRAG_PX + 4;
      component.onDocumentMouseMove({ clientX: 50, clientY: 10 + bend } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 50, clientY: 10 + bend } as MouseEvent);
      fixture.detectChanges();

      const penSession = (component as unknown as { penSession: { getSegments: () => { type: string }[] } }).penSession;
      expect(penSession.getSegments().length).toBe(2);
      expect(penSession.getSegments()[1].type).toBe('Q');
    });

    it('toolbar Alt curve mode authors quadratic Q without holding Control (h76)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setPenAltCurveMode(true);
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 10,
        detail: 1,
        ctrlKey: false,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      const bend = MARQUEE_MIN_DRAG_PX + 4;
      component.onDocumentMouseMove({ clientX: 50, clientY: 10 + bend } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 50, clientY: 10 + bend } as MouseEvent);
      fixture.detectChanges();

      const penSession = (component as unknown as { penSession: { getSegments: () => { type: string }[] } }).penSession;
      expect(penSession.getSegments()[1].type).toBe('Q');
    });

    it('pen outgoing handle drag is undone with Ctrl+Z (provisional PenSegmentReplaceCommand)', async () => {
      await loadEmptySvgAndPenMode();
      const bend = MARQUEE_MIN_DRAG_PX + 8;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 70,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 70, clientY: 20 + bend } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 70, clientY: 20 + bend } as MouseEvent);
      fixture.detectChanges();

      const penSession = (component as unknown as { penSession: { getSegments: () => unknown[] } }).penSession;
      const beforeHandle = JSON.stringify(penSession.getSegments());
      const knob = fixture.nativeElement.querySelector(
        '[data-testid="canvas-pen-outgoing-handle"]'
      ) as SVGCircleElement | null;
      expect(knob).toBeTruthy();
      const r = knob!.getBoundingClientRect();
      const mx = r.left + r.width / 2;
      const my = r.top + r.height / 2;
      component.onCanvasMouseDown({
        button: 0,
        clientX: mx,
        clientY: my,
        detail: 1,
        target: knob!,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: mx + 12, clientY: my + 8 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: mx + 12, clientY: my + 8 } as MouseEvent);
      fixture.detectChanges();
      expect(JSON.stringify(penSession.getSegments())).not.toBe(beforeHandle);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      fixture.detectChanges();
      expect(JSON.stringify(penSession.getSegments())).toBe(beforeHandle);
    });

    it('after outgoing handle adjust and new line point, Ctrl+Z restores cubic to pre-handle geometry but keeps the new line', async () => {
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      await loadEmptySvgAndPenMode();
      const bend = MARQUEE_MIN_DRAG_PX + 8;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 70,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 70, clientY: 20 + bend } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 70, clientY: 20 + bend } as MouseEvent);
      fixture.detectChanges();

      const penSession = (component as unknown as { penSession: { getSegments: () => { type: string }[] } }).penSession;
      const afterCurve = JSON.stringify(penSession.getSegments());
      const knob = fixture.nativeElement.querySelector(
        '[data-testid="canvas-pen-outgoing-handle"]'
      ) as SVGCircleElement | null;
      expect(knob).toBeTruthy();
      const r = knob!.getBoundingClientRect();
      const mx = r.left + r.width / 2;
      const my = r.top + r.height / 2;
      component.onCanvasMouseDown({
        button: 0,
        clientX: mx,
        clientY: my,
        detail: 1,
        target: knob!,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: mx + 10, clientY: my + 6 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: mx + 10, clientY: my + 6 } as MouseEvent);
      fixture.detectChanges();
      expect(JSON.stringify(penSession.getSegments())).not.toBe(afterCurve);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 90,
        clientY: 80,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 90, clientY: 80 } as MouseEvent);
      fixture.detectChanges();
      expect(penSession.getSegments().length).toBe(3);
      // Plain click after a C with a reflectable handle: emits C (reflected P1), not L
      expect(penSession.getSegments()[2].type).toBe('C');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      fixture.detectChanges();
      const segs = penSession.getSegments();
      expect(segs.length).toBe(3);
      expect(JSON.stringify(segs.slice(0, 2))).toBe(afterCurve);
      expect(segs[2].type).toBe('C');
    });

    it('shows close-target ring when pointer hovers near pen path start anchor', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 90,
        clientY: 90,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 90,
        clientY: 90
      } as MouseEvent);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 88,
        clientY: 88,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({
        clientX: 12,
        clientY: 10,
        shiftKey: false,
        altKey: false
      } as MouseEvent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="canvas-pen-close-hover"]')).toBeTruthy();
    });

    it('closes path on mouseup inside radius of pen start anchor (single-click close)', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 90,
        clientY: 90,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 90,
        clientY: 90
      } as MouseEvent);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 50,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({
        clientX: 16,
        clientY: 14,
        shiftKey: false,
        altKey: false
      } as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 16,
        clientY: 14
      } as MouseEvent);
      fixture.detectChanges();

      const path = fixture.nativeElement
        .querySelector('[data-editor-content-group]')
        ?.querySelector('path');
      expect(path).toBeTruthy();
      expect((path?.getAttribute('d') ?? '').trim().endsWith('Z'));
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('closing segment uses reflected P1 when last committed node has a handle', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // node 1 at (10,10) — start anchor
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      // node 2 at (100,10) drag down to (100,20) → C with P2=(100,4.5)
      // k = min(10*0.55, 90*0.58) = 5.5; P2 = (100, 4.5)
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);
      // close: click on start node (10,10) — within close radius
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 10, clientY: 10 } as MouseEvent);
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      // Closing segment: C with reflected P1=(100,15.5), P2=start=(10,10), then Z
      expect(d).toContain('C 100 15.5 10 10 10 10 Z');
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('closing pen path with drag near start commits a user-shaped closing cubic before Z', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);

      // Pending segment from near start: drag handle away, then release on start (close radius).
      component.onCanvasMouseDown({ button: 0, clientX: 12, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 52, clientY: 48 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 11, clientY: 10 } as MouseEvent);
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      expect(d.trim().endsWith('Z')).toBe(true);
      // Plain smooth close is always … 10 10 10 10 Z (P2 collapsed onto start). Drag-close must differ.
      expect(d).not.toMatch(/10 10 10 10 Z$/);
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('closing via start-node click does not add a duplicate anchor at the start position', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // node 1 at (10,10), node 2 at (100,10) dragged to (100,20) → cubic with handles
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);

      // Click the start node to close (within close radius)
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 10, clientY: 10 } as MouseEvent);
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';

      // Path must end with C ... Z (no L or C appended after the closing segment)
      expect(d).toContain(' Z');
      // No explicit line-to at the start position (would be a duplicate anchor)
      expect(d).not.toContain('L 10 10');
      // The closing C has the start-node as its endpoint; Z follows immediately
      expect(d).toContain('10 10 Z');
      // The path should be M + C (node2) + C (closing) — never a 4th segment
      const segTokens = d.replace(/Z/g, '').trim().split(/(?=[MCL])/g).filter(Boolean);
      expect(segTokens.length).toBe(3);
    });

    it('close-target hover ring appears when last committed node has cubic handles', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // node 1 at (10,10) — start anchor
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      // node 2 at (100,10) drag down — produces cubic with reflectable handle
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);

      // Hover near the start anchor while a new segment is pending
      component.onCanvasMouseDown({ button: 0, clientX: 80, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 12, clientY: 10, shiftKey: false, altKey: false } as MouseEvent);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="canvas-pen-close-hover"]')).toBeTruthy();
    });

    it('picks up open path continuation near endpoint; extend is single EditPath undo', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="open-a" d="M 10 10 L 50 40" fill="none" stroke="black"/></svg>'
      );

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg');
      component.onCanvasMouseDown({
        button: 0,
        clientX: 52,
        clientY: 40,
        detail: 1,
        shiftKey: true,
        preventDefault: vi.fn(),
        target: svgRoot
      } as unknown as MouseEvent);
      fixture.detectChanges();
      expect(component.isPenSessionActive).toBe(true);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 88,
        clientY: 90,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 88,
        clientY: 90
      } as MouseEvent);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const pathCount =
        svgManipulationService.getSVGInstance()?.find('[data-editor-content-group] path').length ?? 0;
      expect(pathCount).toBe(1);

      const dAfter =
        svgManipulationService.getSVGInstance()?.findOne('#open-a')?.attr('d')?.toString() ?? '';
      expect(dAfter).toMatch(/88/);
      expect(dAfter).toMatch(/90/);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      fixture.detectChanges();

      const dUndo =
        svgManipulationService.getSVGInstance()?.findOne('#open-a')?.attr('d')?.toString() ?? '';
      expect(dUndo).toContain('50 40');
      expect(dUndo).not.toMatch(/88/);
    });

    it('joins finishing stroke into existing open path when end meets endpoint (tolerance)', async () => {
      await loadSvgAndPenMode(
        '<svg viewBox="0 0 100 100"><path id="join-b" d="M 0 0 L 18 22" fill="none" stroke="black"/></svg>'
      );

      const svgRoot = component.svgContainer()?.nativeElement.querySelector('svg');
      component.onCanvasMouseDown({
        button: 0,
        clientX: 40,
        clientY: 40,
        detail: 1,
        shiftKey: true,
        preventDefault: vi.fn(),
        target: svgRoot
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 23,
        detail: 1,
        shiftKey: true,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 20,
        clientY: 23
      } as MouseEvent);
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const pathCount =
        svgManipulationService.getSVGInstance()?.find('[data-editor-content-group] path').length ?? 0;
      expect(pathCount).toBe(1);
      const d =
        svgManipulationService.getSVGInstance()?.findOne('#join-b')?.attr('d')?.toString() ?? '';
      expect(d).toMatch(/18 22/);
      expect(d).toMatch(/20 23/);
    });

    it('Backspace clears moveto-only pen session', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);
      const evt = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
      const pd = vi.spyOn(evt, 'preventDefault');
      component.onKeyDown(evt);
      expect(component.isPenSessionActive).toBe(false);
      expect(pd).toHaveBeenCalled();
    });

    it('Backspace removes last committed segment and keeps drawing when anchors remain', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 30,
        clientY: 40,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 30,
        clientY: 40
      } as MouseEvent);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 60,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 50,
        clientY: 60
      } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      fixture.detectChanges();
      expect(editorToolService.getCurrentTool()).toBe('pen');
      expect(component.isPenSessionActive).toBe(true);
      const segs = (component as unknown as { penSession: { getSegments: () => unknown[] } }).penSession.getSegments();
      expect(segs.map((s: { type: string }) => s.type).join('')).toBe('ML');
      expect(component.penSessionPreviewPathD).toBeTruthy();
    });

    it('Backspace after two anchors clears session (M-only exit)', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 30,
        clientY: 40,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 30,
        clientY: 40
      } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(component.isPenSessionActive).toBe(false);
    });

    it('Backspace cancels in-progress pen segment without removing last committed anchor', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 30,
        clientY: 40,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 30,
        clientY: 40
      } as MouseEvent);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 50,
        clientY: 60,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.penSessionPreviewPathD).toBeTruthy();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      fixture.detectChanges();
      expect(component.isPenSessionActive).toBe(true);
      const segs = (component as unknown as { penSession: { getSegments: () => unknown[] } }).penSession.getSegments();
      expect(segs.map((s: { type: string }) => s.type).join('')).toBe('ML');
      expect(component.penSessionPreviewPathD).toBeTruthy();
    });

    it('click sequence adds a path; Enter finishes and selects it', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 30,
        clientY: 40,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 30,
        clientY: 40
      } as MouseEvent);
      expect(editorToolService.getCurrentTool()).toBe('pen');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const path = fixture.nativeElement
        .querySelector('[data-editor-content-group]')
        ?.querySelector('path');
      expect(path).toBeTruthy();
      const d = path?.getAttribute('d') ?? '';
      expect(d).toMatch(/M[\s0-9.]+/);
      expect(d).toMatch(/L[\s0-9.]+/);
      expect(d.trim().endsWith('Z')).toBe(false);
      expect(shapeSelectionService.getSelectedShapes().length).toBe(1);
      expect(shapeSelectionService.getSelectedShapes()[0].type).toBe('path');
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('double-click finishes as a closed path (joins to start via Z)', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 5,
        clientY: 5,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 25,
        clientY: 25,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 25, clientY: 25 } as MouseEvent);

      component.onCanvasMouseDown({
        button: 0,
        clientX: 60,
        clientY: 10,
        detail: 2,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      fixture.detectChanges();

      const path = fixture.nativeElement
        .querySelector('[data-editor-content-group]')
        ?.querySelector('path');
      expect(path).toBeTruthy();
      const d = path?.getAttribute('d') ?? '';
      expect(d.trim().endsWith('Z')).toBe(true);
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('right-click finishes an open path without closing', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 25,
        clientY: 25,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 25, clientY: 25 } as MouseEvent);

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 2,
        clientX: 25,
        clientY: 25,
        detail: 1,
        preventDefault
      } as unknown as MouseEvent);
      fixture.detectChanges();

      const path = fixture.nativeElement
        .querySelector('[data-editor-content-group]')
        ?.querySelector('path');
      expect(path).toBeTruthy();
      const d = path?.getAttribute('d') ?? '';
      expect(d.trim().endsWith('Z')).toBe(false);
      expect(preventDefault).toHaveBeenCalled();
      expect(editorToolService.getCurrentTool()).toBe('selector');
    });

    it('Escape clears in-progress pen session without adding a path', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();

      const paths = fixture.nativeElement.querySelectorAll('[data-editor-content-group] path');
      expect(paths.length).toBe(0);
    });

    it('canceling tool-switch confirm preserves pen session and keeps pen active', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      editorToolService.setTool('selector');
      fixture.detectChanges();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(component.isPenSessionActive).toBe(true);
      expect(editorToolService.getCurrentTool()).toBe('pen');
      confirmSpy.mockRestore();
    });

    it('accepting tool-switch confirm discards pen session and applies new tool', async () => {
      await loadEmptySvgAndPenMode();
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      editorToolService.setTool('selector');
      fixture.detectChanges();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(component.isPenSessionActive).toBe(false);
      expect(editorToolService.getCurrentTool()).toBe('selector');
      confirmSpy.mockRestore();
    });

    it('canceling document-replace confirm preserves pen session and current document', async () => {
      await loadSvgAndPenMode('<svg viewBox="0 0 100 100"><rect id="doc-old" x="1" y="1" width="5" height="5"/></svg>');
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle id="doc-new" cx="20" cy="20" r="5"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      const host = component.svgContainer()?.nativeElement;
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(component.isPenSessionActive).toBe(true);
      expect(editorToolService.getCurrentTool()).toBe('pen');
      expect(host?.querySelector('#doc-old')).toBeTruthy();
      expect(host?.querySelector('#doc-new')).toBeFalsy();
      confirmSpy.mockRestore();
    });

    it('accepting document-replace confirm discards pen session and loads new document', async () => {
      await loadSvgAndPenMode('<svg viewBox="0 0 100 100"><rect id="doc-old" x="1" y="1" width="5" height="5"/></svg>');
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      expect(component.isPenSessionActive).toBe(true);

      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle id="doc-new" cx="20" cy="20" r="5"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      const host = component.svgContainer()?.nativeElement;
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(component.isPenSessionActive).toBe(false);
      expect(editorToolService.getCurrentTool()).toBe('pen');
      expect(host?.querySelector('#doc-old')).toBeFalsy();
      expect(host?.querySelector('#doc-new')).toBeTruthy();
      confirmSpy.mockRestore();
    });

    it('shows finish feedback when Enter tries to finish an invalid pen path', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const feedback = fixture.nativeElement.querySelector('[data-testid="canvas-pen-finish-feedback"]');
      expect(feedback).toBeTruthy();
      expect(feedback?.textContent).toContain('Add at least 2 points');
      expect(editorToolService.getCurrentTool()).toBe('pen');
    });

    it('shows finish feedback when right-click tries to finish an invalid pen path', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);

      const preventDefault = vi.fn();
      component.onCanvasMouseDown({
        button: 2,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault
      } as unknown as MouseEvent);
      fixture.detectChanges();

      const feedback = fixture.nativeElement.querySelector('[data-testid="canvas-pen-finish-feedback"]');
      expect(feedback).toBeTruthy();
      expect(preventDefault).toHaveBeenCalled();
      expect(editorToolService.getCurrentTool()).toBe('pen');
    });

    it('does not show finish feedback when pen path is valid and finishes', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 30,
        clientY: 40,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({
        button: 0,
        clientX: 30,
        clientY: 40
      } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const feedback = fixture.nativeElement.querySelector('[data-testid="canvas-pen-finish-feedback"]');
      expect(feedback).toBeFalsy();
    });

    it('auto-clears finish feedback after a short duration', async () => {
      await loadEmptySvgAndPenMode();
      vi.useFakeTimers();
      try {
        component.onCanvasMouseDown({
          button: 0,
          clientX: 10,
          clientY: 10,
          detail: 1,
          preventDefault: vi.fn()
        } as unknown as MouseEvent);

        component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="canvas-pen-finish-feedback"]')).toBeTruthy();

        vi.advanceTimersByTime(1200);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('[data-testid="canvas-pen-finish-feedback"]')).toBeFalsy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows rubber-band line in overlay after first point and pointer move', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 70, clientY: 60 } as MouseEvent);
      fixture.detectChanges();

      const band = fixture.nativeElement.querySelector('[data-testid="canvas-pen-rubber-band"]');
      expect(band).toBeTruthy();
      expect(band?.getAttribute('x1')).toBeTruthy();
      expect(band?.getAttribute('x2')).toBeTruthy();
    });

    it('shows full in-progress path preview (committed segments + current segment)', async () => {
      await loadEmptySvgAndPenMode();

      // First point
      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      // Second point commit (L)
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 20, clientY: 20 } as MouseEvent);
      // Pointer moves toward third point (preview only)
      component.onDocumentMouseMove({ clientX: 40, clientY: 20 } as MouseEvent);
      fixture.detectChanges();

      const fullPreview = fixture.nativeElement.querySelector('[data-testid="canvas-pen-path-preview"]');
      expect(fullPreview).toBeTruthy();
      expect(fullPreview?.getAttribute('d')).toBe('M 10 10 L 20 20 L 40 20');
    });

    it('pen preview stroke matches drawing defaults, updates mid-session, matches committed path', async () => {
      const drawingDefaults = TestBed.inject(DrawingStyleDefaultsService);
      drawingDefaults.resetDefaults();
      try {
        await loadEmptySvgAndPenMode();

        component.onCanvasMouseDown({
          button: 0,
          clientX: 10,
          clientY: 10,
          detail: 1,
          preventDefault: vi.fn()
        } as unknown as MouseEvent);
        component.onDocumentMouseMove({ clientX: 40, clientY: 20 } as MouseEvent);
        fixture.detectChanges();

        const previewWhileBand = fixture.nativeElement.querySelector(
          '[data-testid="canvas-pen-path-preview"]'
        ) as SVGPathElement | null;
        expect(previewWhileBand?.getAttribute('stroke')).toBe(drawingDefaults.stroke());
        expect(previewWhileBand?.getAttribute('stroke-width')).toBe(String(drawingDefaults.strokeWidth()));

        const band = fixture.nativeElement.querySelector('[data-testid="canvas-pen-rubber-band"]') as SVGLineElement | null;
        expect(band?.getAttribute('stroke')).toBe(drawingDefaults.stroke());

        drawingDefaults.updateDefaults({ stroke: '#abc123', strokeWidth: 3.25 });
        fixture.detectChanges();

        expect(previewWhileBand?.getAttribute('stroke')).toBe('#abc123');
        expect(previewWhileBand?.getAttribute('stroke-width')).toBe('3.25');
        expect(band?.getAttribute('stroke')).toBe('#abc123');

        component.onCanvasMouseDown({
          button: 0,
          clientX: 30,
          clientY: 40,
          detail: 1,
          preventDefault: vi.fn()
        } as unknown as MouseEvent);
        component.onDocumentMouseMove({ clientX: 50, clientY: 50 } as MouseEvent);
        fixture.detectChanges();

        const curvePreview = fixture.nativeElement.querySelector('[data-testid="canvas-pen-curve-preview"]') as SVGPathElement | null;
        expect(curvePreview).toBeTruthy();
        expect(curvePreview?.getAttribute('stroke')).toBe('#abc123');
        expect(curvePreview?.getAttribute('stroke-width')).toBe('3.25');

        component.onDocumentMouseUp({ button: 0, clientX: 55, clientY: 55 } as MouseEvent);
        component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        fixture.detectChanges();

        const committed = fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path') as SVGPathElement | null;
        expect(committed?.getAttribute('stroke')).toBe('#abc123');
        expect(committed?.getAttribute('stroke-width')).toBe('3.25');
      } finally {
        drawingDefaults.resetDefaults();
      }
    });

    it('keeps pending endpoint fixed while drag updates cubic preview handles', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 30, clientY: 20 } as MouseEvent);
      fixture.detectChanges();

      const preview = fixture.nativeElement.querySelector('[data-testid="canvas-pen-curve-preview"]');
      expect(preview).toBeTruthy();
      const firstDragD = preview?.getAttribute('d') ?? '';
      expect(firstDragD).toContain('C');
      expect(firstDragD).toContain(' 20 20');
      // Endpoint is fixed at mouse-down, but drag should still bend controls off the straight chord.
      expect(firstDragD).not.toBe('M 10 10 C 13.333333 13.333333 16.666667 16.666667 20 20');

      component.onDocumentMouseMove({ clientX: 30, clientY: 30 } as MouseEvent);
      fixture.detectChanges();
      const secondDragD =
        fixture.nativeElement
          .querySelector('[data-testid="canvas-pen-curve-preview"]')
          ?.getAttribute('d') ?? '';
      expect(secondDragD).toContain('C');
      expect(secondDragD).toContain(' 20 20');
      expect(secondDragD).not.toBe(firstDragD);
    });

    it('commits a bent cubic segment (not a straight chord cubic) after drag', async () => {
      await loadEmptySvgAndPenMode();

      component.onCanvasMouseDown({
        button: 0,
        clientX: 10,
        clientY: 10,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 30, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 35, clientY: 25 } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      expect(d).toContain('C');
      expect(d).toContain(' 20 20');
      // First segment: P1 collapses to P0 (Illustrator-style — no outgoing handle on start anchor).
      expect(d).toContain('C 10 10');
      expect(d).toMatch(/12\.218\d+ 17\.406\d+ 20 20/);
    });

    it('second segment after L uses chord-third P1 (no reflectable handle from prior L)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // first anchor
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      // second anchor (plain click — commits an L, so canReflectCubic stays false)
      component.onCanvasMouseDown({ button: 0, clientX: 40, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 40, clientY: 10 } as MouseEvent);
      // third anchor with drag — prior segment is L, so P1 = chord-third from (40,10) toward (70,10) = (50,10)
      component.onCanvasMouseDown({ button: 0, clientX: 70, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 70, clientY: 25 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 70, clientY: 25 } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      expect(d).toMatch(/C 50 10/);
    });

    it('plain click after dragged C emits C with reflected P1 and P2=endpoint (smooth departure)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // node 1 at (10,10)
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      // node 2 at (100,10) drag down to (100,20) → C with P2=(100,4.5)
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);
      // node 3 at (190,10) — plain click, no drag
      component.onCanvasMouseDown({ button: 0, clientX: 190, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 190, clientY: 10 } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      // Segment 2 must be a C (not L) with reflected P1=(100,15.5) and P2=endpoint=(190,10)
      expect(d).not.toContain('L 190 10');
      expect(d).toContain('C 100 15.5 190 10 190 10');
    });

    it('second segment after dragged C uses reflected P1 (smooth node)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      // first anchor at (10,10)
      component.onCanvasMouseDown({ button: 0, clientX: 10, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      // second anchor at (100,10) drag downward to (100,20) — commits C with P1=P0=(10,10), P2=(100,4.5)
      // k = min(10*0.55, 90*0.58) = 5.5; P2 = (100-0*5.5, 10-1*5.5) = (100, 4.5)
      component.onCanvasMouseDown({ button: 0, clientX: 100, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 100, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 100, clientY: 20 } as MouseEvent);
      // third anchor at (190,10) drag downward — P1 should be reflection of P2=(100,4.5) across (100,10) = (100,15.5)
      component.onCanvasMouseDown({ button: 0, clientX: 190, clientY: 10, detail: 1, preventDefault: vi.fn() } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 190, clientY: 20 } as MouseEvent);
      component.onDocumentMouseUp({ button: 0, clientX: 190, clientY: 20 } as MouseEvent);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();

      const d =
        fixture.nativeElement
          .querySelector('[data-editor-content-group]')
          ?.querySelector('path')
          ?.getAttribute('d') ?? '';
      // Second segment: P1 reflected from committed P2=(100,4.5) across anchor=(100,10) → (100,15.5)
      expect(d).toContain('C 100 15.5');
    });

    it('renders dashed pending-curve handle guide while dragging past curve threshold (j24.9)', async () => {
      await loadEmptySvgAndPenMode();
      editorToolService.setGridSnapEnabled(false);
      editorToolService.setShapeSnapEnabled(false);
      fixture.detectChanges();

      const bend = MARQUEE_MIN_DRAG_PX + 8;
      component.onCanvasMouseDown({
        button: 0,
        clientX: 20,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onCanvasMouseDown({
        button: 0,
        clientX: 70,
        clientY: 20,
        detail: 1,
        preventDefault: vi.fn()
      } as unknown as MouseEvent);
      component.onDocumentMouseMove({ clientX: 70, clientY: 20 + bend } as MouseEvent);
      fixture.detectChanges();

      expect(component.penCurvePreviewPathD).toContain('C');
      expect(
        fixture.nativeElement.querySelector('[data-testid="canvas-pen-pending-curve-handle-guide"]')
      ).toBeTruthy();
    });
  });

  describe('keyboard shortcuts', () => {
    it('Ctrl+A selects all shapes when selector tool is active', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><circle id="c1" cx="50" cy="50" r="5"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
      expect(shapeSelectionService.getSelectedShapes().length).toBe(2);
    });

    it('V/Z/H single keys switch tools when not modified', async () => {
      editorToolService.setTool('pen');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'v', bubbles: true }));
      expect(editorToolService.getCurrentTool()).toBe('selector');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'z', bubbles: true }));
      expect(editorToolService.getCurrentTool()).toBe('zoom');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
      expect(editorToolService.getCurrentTool()).toBe('pan');
    });

    it('single-key tool shortcuts are ignored when focus is in an input', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'z', bubbles: true });
        Object.defineProperty(ev, 'target', { value: input, enumerable: true });
        component.onKeyDown(ev);
        expect(editorToolService.getCurrentTool()).toBe('selector');
      } finally {
        input.remove();
      }
    });

    it('does not select all when typing in an input', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true });
        Object.defineProperty(ev, 'target', { value: input, enumerable: true });
        component.onKeyDown(ev);
        expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
      } finally {
        input.remove();
      }
    });

    it('] pushes Bring to front (CompositeCommand) for multi-select in DOM order', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="10" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShapes([
        { id: 'r2', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'r1', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
      ]);
      const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');
      component.onKeyDown(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0][0]).toBeInstanceOf(CompositeCommand);
      expect((pushSpy.mock.calls[0][0] as CompositeCommand).description).toBe('Bring to front');
      pushSpy.mockRestore();
    });

    it('[ pushes Send to back for multi-select', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="10" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShapes([
        { id: 'r1', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
        { id: 'r2', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
      ]);
      const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy.mock.calls[0][0]).toBeInstanceOf(CompositeCommand);
      expect((pushSpy.mock.calls[0][0] as CompositeCommand).description).toBe('Send to back');
      pushSpy.mockRestore();
    });

    it('does not reorder on ] when focus is in an input', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: ']', bubbles: true });
        Object.defineProperty(ev, 'target', { value: input, enumerable: true });
        component.onKeyDown(ev);
        expect(pushSpy).not.toHaveBeenCalled();
      } finally {
        input.remove();
        pushSpy.mockRestore();
      }
    });

    it('does not reorder on ] when zoom tool is active', async () => {
      editorToolService.setTool('zoom');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');
      component.onKeyDown(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
      expect(pushSpy).not.toHaveBeenCalled();
      pushSpy.mockRestore();
    });

    it('Delete removes selected shapes and clears selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const removeSpy = vi.spyOn(svgManipulationService, 'removeShapes');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(removeSpy).toHaveBeenCalledWith(['r1']);
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
      removeSpy.mockRestore();
    });

    it('undo after Delete restores deleted shape selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
      expect(fixture.nativeElement.querySelector('#r1')).toBeNull();

      editorHistoryService.undo();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();

      const selected = shapeSelectionService.getSelectedShapes();
      expect(selected.map((shape) => shape.id)).toEqual(['r1']);
      expect(fixture.nativeElement.querySelector('#r1')).not.toBeNull();
    });

    it('Escape clears selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
    });

    it('Escape cancels active drag without clearing selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const dragHandler = component['drag'] as any;
      dragHandler.isActive = true;
      dragHandler.shapeIds = ['r1'];
      dragHandler.visibilityShapeIds = ['r1'];
      dragHandler.ghostFragments = [];
      const clearSpy = vi.spyOn(shapeSelectionService, 'clearSelection');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(component.isDraggingShape).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(shapeSelectionService.getSelectedShapes().map((shape) => shape.id)).toEqual(['r1']);
    });

    it('Escape cancels active resize without clearing selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const resizeHandler = component['resize'] as any;
      resizeHandler.isActive = true;
      resizeHandler.visibilityShapeIds = ['r1'];
      const clearSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
      const visibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(component.isResizingSelection).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(visibilitySpy).toHaveBeenCalledWith('r1', true);
      expect(shapeSelectionService.getSelectedShapes().map((shape) => shape.id)).toEqual(['r1']);
    });

    it('Escape cancels active rotate without clearing selection', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const rotateHandler = component['rotate'] as any;
      rotateHandler.isActive = true;
      rotateHandler.visibilityShapeIds = ['r1'];
      const clearSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
      const visibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(component.isRotatingSelection).toBe(false);
      expect(clearSpy).not.toHaveBeenCalled();
      expect(visibilitySpy).toHaveBeenCalledWith('r1', true);
      expect(shapeSelectionService.getSelectedShapes().map((shape) => shape.id)).toEqual(['r1']);
    });

    it('Cmd/Meta+A selects all shapes when selector tool is active', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><circle id="c1" cx="50" cy="50" r="5"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }));
      expect(shapeSelectionService.getSelectedShapes().length).toBe(2);
    });

    it('does not select all on Ctrl/Cmd+A when selector tool is not active', async () => {
      editorToolService.setTool('zoom');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><circle id="c1" cx="50" cy="50" r="5"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }));
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
    });

    it('Backspace removes selected shapes like Delete', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const removeSpy = vi.spyOn(svgManipulationService, 'removeShapes');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));

      expect(removeSpy).toHaveBeenCalledWith(['r1']);
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
      removeSpy.mockRestore();
    });

    it('Ctrl+= zooms in at viewport center', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 200;
      component.wrapperHeight = 200;

      const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }));
      expect(zoomInAtSpy).toHaveBeenCalled();
    });

    it('Ctrl+- zooms out at viewport center', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 200;
      component.wrapperHeight = 200;

      const zoomOutAtSpy = vi.spyOn(canvasViewService, 'zoomOutAt');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '-', ctrlKey: true, bubbles: true }));
      expect(zoomOutAtSpy).toHaveBeenCalled();
    });

    it('Ctrl+0 resets zoom', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      canvasViewService.scale = 4;
      canvasViewService.panX = 10;
      canvasViewService.panY = 20;

      const resetSpy = vi.spyOn(canvasViewService, 'resetZoom');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true }));
      expect(resetSpy).toHaveBeenCalled();
      expect(canvasViewService.scale).toBe(1);
      expect(canvasViewService.panX).toBe(0);
      expect(canvasViewService.panY).toBe(0);
    });

    it('Ctrl+= does nothing when no SVG content', () => {
      fixture.componentRef.setInput('svgContent', '');
      fixture.detectChanges();

      const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '=', ctrlKey: true, bubbles: true }));
      expect(zoomInAtSpy).not.toHaveBeenCalled();
    });

    it('NumpadAdd zooms in', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 200;
      component.wrapperHeight = 200;

      const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
      component.onKeyDown(
        new KeyboardEvent('keydown', { key: '+', code: 'NumpadAdd', ctrlKey: true, bubbles: true })
      );
      expect(zoomInAtSpy).toHaveBeenCalled();
    });

    it('NumpadSubtract zooms out', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 200;
      component.wrapperHeight = 200;

      const zoomOutAtSpy = vi.spyOn(canvasViewService, 'zoomOutAt');
      component.onKeyDown(
        new KeyboardEvent('keydown', { key: '-', code: 'NumpadSubtract', ctrlKey: true, bubbles: true })
      );
      expect(zoomOutAtSpy).toHaveBeenCalled();
    });

    it('Ctrl+1 fits artboard to viewport', async () => {
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      component.wrapperWidth = 400;
      component.wrapperHeight = 300;

      const zoomFitSpy = vi.spyOn(canvasViewService, 'zoomToFitRect');
      component.onKeyDown(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }));
      expect(zoomFitSpy).toHaveBeenCalled();
    });

    it('Delete removes every selected shape id', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      shapeSelectionService.selectShapes([
        {
          id: 'r1',
          type: 'rect',
          fill: '#000',
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1
        },
        {
          id: 'r2',
          type: 'rect',
          fill: '#111',
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1
        }
      ]);
      const removeSpy = vi.spyOn(svgManipulationService, 'removeShapes');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

      expect(removeSpy).toHaveBeenCalledWith(['r1', 'r2']);
      expect(shapeSelectionService.getSelectedShapes().length).toBe(0);
      removeSpy.mockRestore();
    });

    it('Ctrl/Cmd+C stores selection in internal clipboard without mutating document', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const removeSpy = vi.spyOn(svgManipulationService, 'removeShapes');
      const before = fixture.nativeElement.querySelectorAll('#r1').length;

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));

      expect(clipboardService.hasContent()).toBe(true);
      expect(removeSpy).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelectorAll('#r1').length).toBe(before);
      removeSpy.mockRestore();
    });

    it('Ctrl+X cuts as one undoable step', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true }));
      expect(fixture.nativeElement.querySelector('#r1')).toBeNull();
      expect(clipboardService.hasContent()).toBe(true);

      editorHistoryService.undo();
      await new Promise((r) => setTimeout(r, 0));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#r1')).not.toBeNull();
    });

    it('Ctrl+V pastes with incremental offset and selects pasted shape', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      component.onKeyDown(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }));
      fixture.detectChanges();

      const rects = Array.from<Element>(
        fixture.nativeElement.querySelector('[data-editor-content-group]').querySelectorAll('rect')
      );
      expect(rects.length).toBe(3);
      const transforms = rects.map((node: Element) => node.getAttribute('transform') ?? '');
      expect(transforms.some((value) => value.includes('translate(10 10)'))).toBe(true);
      expect(transforms.some((value) => value.includes('translate(20 20)'))).toBe(true);
      expect(shapeSelectionService.getSelectedShapes().length).toBe(1);
    });

    it('Ctrl+D duplicates without changing clipboard contents', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      const beforeClipboard = clipboardService.get();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true }));
      fixture.detectChanges();

      const rects = fixture.nativeElement
        .querySelector('[data-editor-content-group]')
        .querySelectorAll('rect');
      expect(rects.length).toBe(2);
      expect(clipboardService.get()).toEqual(beforeClipboard);
    });

    it('clipboard shortcuts are ignored in non-selector tool and input fields', async () => {
      editorToolService.setTool('zoom');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
      expect(clipboardService.hasContent()).toBe(false);

      editorToolService.setTool('selector');
      shapeSelectionService.selectShape({
        id: 'r1',
        type: 'rect',
        fill: '#000',
        stroke: undefined,
        strokeWidth: 0,
        opacity: 1
      });
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true });
        Object.defineProperty(ev, 'target', { value: input, enumerable: true });
        component.onKeyDown(ev);
        expect(fixture.nativeElement.querySelector('#r1')).not.toBeNull();
      } finally {
        input.remove();
      }
    });

    it('Ctrl/Cmd+Shift+ArrowLeft aligns selection left in selector mode', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShapes([
        { id: 'r1', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 },
        { id: 'r2', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 }
      ]);
      const pushSpy = vi.spyOn(editorHistoryService, 'pushAndExecute');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, shiftKey: true, bubbles: true }));

      expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it('alignment/distribution shortcuts are ignored when not in selector tool', async () => {
      editorToolService.setTool('zoom');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShapes([
        { id: 'r1', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 },
        { id: 'r2', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 }
      ]);
      const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, shiftKey: true, bubbles: true }));

      expect(translateSpy).not.toHaveBeenCalled();
    });

    it('alignment/distribution shortcuts are ignored in text input contexts', async () => {
      editorToolService.setTool('selector');
      fixture.componentRef.setInput(
        'svgContent',
        '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/><rect id="r2" x="20" y="0" width="10" height="10"/></svg>'
      );
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      shapeSelectionService.selectShapes([
        { id: 'r1', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 },
        { id: 'r2', type: 'rect', fill: '#000', strokeWidth: 0, opacity: 1 }
      ]);
      const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
      const input = document.createElement('input');
      document.body.appendChild(input);
      try {
        const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, shiftKey: true, bubbles: true });
        Object.defineProperty(ev, 'target', { value: input, enumerable: true });
        component.onKeyDown(ev);
      } finally {
        input.remove();
      }

      expect(translateSpy).not.toHaveBeenCalled();
    });
  });
});
