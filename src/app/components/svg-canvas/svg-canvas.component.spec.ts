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

  it('should not clear selection or select shape when pan tool is active and user clicks canvas', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');
    const selectShapeSpy = vi.spyOn(shapeSelectionService, 'selectShape');

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
    expect(selectShapeSpy).not.toHaveBeenCalled();
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
    const selectShapeSpy = vi.spyOn(shapeSelectionService, 'selectShape');
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

    expect(selectShapeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' })
    );
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
    const toggleSpy = vi.spyOn(shapeSelectionService, 'toggleShapeInSelection');
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

    expect(toggleSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    expect(shapeSelectionService.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
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
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () => mockSvgJsShape('drag-target', shapeNode)
    } as any);
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
    const shapeNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    vi.spyOn(shapeNode, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 30, 40));
    const mousedownEvent = {
      button: 0,
      target: { id: 'a', tagName: 'rect', getBoundingClientRect: () => new DOMRect(20, 30, 30, 40) },
      clientX: 25,
      clientY: 40,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () => mockSvgJsShape('a', shapeNode)
    } as any);
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
    vi.spyOn(canvasViewService, 'screenToSvg').mockReturnValue({ x: 10, y: 5 });
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
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () =>
        mockSvgJsShape('ghost-vis', rect || document.createElementNS('http://www.w3.org/2000/svg', 'rect'))
    } as any);
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
    component.onCanvasMouseDown(mousedownEvent);
    const ghostWrapper = document.body.querySelector('.drag-ghost') as HTMLElement;
    expect(ghostWrapper).toBeTruthy();
    expect(ghostWrapper.style.overflow).toBe('visible');
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
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () =>
        mockSvgJsShape('ghost-svg', rect || document.createElementNS('http://www.w3.org/2000/svg', 'rect'))
    } as any);
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
    component.onCanvasMouseDown(mousedownEvent);
    const ghostSvg = document.body.querySelector('.drag-ghost svg');
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
    vi.spyOn(svgManipulationService, 'getSVGInstance').mockReturnValue({
      findOne: () => mockSvgJsShape('ghost-pad', shapeNode)
    } as any);
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
    component.onCanvasMouseDown(mousedownEvent);
    const ghostSvg = document.body.querySelector('.drag-ghost svg');
    expect(ghostSvg).toBeTruthy();
    const vb = ghostSvg?.getAttribute('viewBox') ?? '';
    const [vx, vy, vw, vh] = vb.split(/\s+/).map(Number);
    expect(vw).toBeGreaterThanOrEqual(30);
    expect(vh).toBeGreaterThanOrEqual(40);
    expect(vx).toBeLessThanOrEqual(10);
    expect(vy).toBeLessThanOrEqual(20);
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
});
