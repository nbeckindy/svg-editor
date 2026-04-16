import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SvgCanvasComponent } from './svg-canvas.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';

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

describe('SvgCanvasComponent', () => {
  let component: SvgCanvasComponent;
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let svgManipulationService: SvgManipulationService;
  let shapeSelectionService: ShapeSelectionService;
  let editorToolService: EditorToolService;
  let canvasViewService: CanvasViewService;

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

  it('should call highlightShape when a shape is clicked with selector tool', () => {
    const highlightShapeSpy = vi.spyOn(svgManipulationService, 'highlightShape');
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="shape-1" x="10" y="10" width="20" height="20"/></svg>');
    fixture.detectChanges();
    editorToolService.setTool('selector');

    const mockEvent = {
      target: { id: 'shape-1', tagName: 'rect' },
      clientX: 20,
      clientY: 20,
      shiftKey: false
    } as unknown as MouseEvent;
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () => ({ id: () => 'shape-1' }),
      find: () => []
    } as any);
    vi.spyOn(svgManipulationService, 'getShapeProperties').mockReturnValue({
      id: 'shape-1',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    component.onCanvasClick(mockEvent);

    expect(highlightShapeSpy).toHaveBeenCalledWith('shape-1');
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
    component['isDraggingShape'] = true;
    component['dragShapeIds'] = ['shape-a', 'shape-b'];
    component['dragStartSvg'] = { x: 0, y: 0 };
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

  it('should on mouseup after drag call translateShape with delta and show shape again', () => {
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
    const translateSpy = vi.spyOn(svgManipulationService, 'translateShape');
    const setVisibilitySpy = vi.spyOn(svgManipulationService, 'setShapeVisibility');
    component['isDraggingShape'] = true;
    component['dragShapeIds'] = ['drag-me'];
    component['dragStartSvg'] = { x: 25, y: 40 };
    stubEditorSvgScreenMapping(component);
    component.onDocumentMouseUp({
      button: 0,
      clientX: 45,
      clientY: 60
    } as MouseEvent);
    expect(component.isDraggingShape).toBe(false);
    expect(translateSpy).toHaveBeenCalledWith('drag-me', 20, 20);
    expect(setVisibilitySpy).toHaveBeenCalledWith('drag-me', true);
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
  });

  describe('viewBox visibility in editor', () => {
    it('should render viewBox as a rect with white fill and thin black stroke when SVG has viewBox', async () => {
      fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 50));
      fixture.detectChanges();
      const canvasSvg = fixture.nativeElement.querySelector('.svg-canvas svg');
      expect(canvasSvg).toBeTruthy();
      const viewBoxFillRect = canvasSvg?.querySelector('rect[data-editor-viewbox-rect]');
      expect(viewBoxFillRect).toBeTruthy();
      expect(viewBoxFillRect?.getAttribute('fill')?.toLowerCase()).toBe('#ffffff');
      expect(component.viewBoxOverlayRect).toBeDefined();
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
  });
});
