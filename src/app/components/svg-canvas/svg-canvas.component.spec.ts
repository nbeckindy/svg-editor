import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SvgCanvasComponent } from './svg-canvas.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';

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
    
    component.svgContent = svgContent;
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

    component.svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
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
    component.svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    fixture.detectChanges();

    expect(svgManipulationService.getSVGInstance()).toBeTruthy();
    expect(initSpy).toHaveBeenCalled();
  });

  it('should zoom in at click position when zoom tool is active and SVG is loaded', () => {
    const zoomInAtSpy = vi.spyOn(canvasViewService, 'zoomInAt');
    component.svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    fixture.detectChanges();

    expect(canvasViewService.isInitialized()).toBe(true);

    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer.nativeElement as HTMLElement;
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

  it('should not call zoomInAt when zoom tool is active but no SVG content', () => {
    editorToolService.setTool('zoom');
    component.svgContent = '';
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

  it('should not clear selection when zoom tool is active and user clicks canvas', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');

    component.svgContent = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>';
    fixture.detectChanges();
    editorToolService.setTool('zoom');

    const wrapperEl = component.svgContainer.nativeElement as HTMLElement;
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
});
