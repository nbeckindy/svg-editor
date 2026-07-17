import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ToolStripComponent } from './tool-strip.component';
import { EditorToolService } from '../../services/editor-tool.service';
import { registerDefaultToolDescriptors } from '../../tools/register-default-tool-descriptors';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { SvgEditorDocumentService } from '../../services/svg-editor-document.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { RasterInsertAnchorStore } from '../../services/raster-insert-anchor.store';
import { RasterImageInsertService } from '../../services/raster-image-insert.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';

describe('ToolStripComponent', () => {
  let fixture: ComponentFixture<ToolStripComponent>;
  let editorToolService: EditorToolService;
  const editorDocumentMock = {
    documentRevision: signal(0),
    getSVGInstance: vi.fn(() => ({}) as unknown),
    getDocumentViewBox: vi.fn(() => '0 0 800 600')
  };

  const rasterInsertSpy = vi.fn().mockResolvedValue({ kind: 'inserted' as const });

  beforeEach(async () => {
    vi.restoreAllMocks();
    rasterInsertSpy.mockResolvedValue({ kind: 'inserted' as const });
    editorDocumentMock.getSVGInstance.mockReturnValue({} as unknown);
    await TestBed.configureTestingModule({
      imports: [ToolStripComponent],
      providers: [
        EditorToolService,
        ToolRegistryService,
        DrawingStyleDefaultsService,
        {
          provide: ChromeEditorApplyService,
          useValue: {
            applyCreationFillDefault: vi.fn(),
            applyCreationStrokeDefault: vi.fn(),
            applyCreationStrokeWidthDefault: vi.fn()
          }
        },
        { provide: SvgEditorDocumentService, useValue: editorDocumentMock },
        { provide: ShapeSelectionService, useValue: { selectShape: vi.fn() } },
        { provide: EditorHistoryService, useValue: { pushAndExecute: vi.fn() } },
        { provide: RasterImageInsertService, useValue: { insertRasterFileAtAnchor: rasterInsertSpy } },
        RasterInsertAnchorStore
      ]
    }).compileComponents();

    registerDefaultToolDescriptors(TestBed.inject(ToolRegistryService));

    fixture = TestBed.createComponent(ToolStripComponent);
    editorToolService = TestBed.inject(EditorToolService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('hosts creation paint defaults on the strip', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="creation-paint-defaults"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="creation-default-fill"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="creation-default-stroke"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="creation-default-stroke-width"]')).toBeTruthy();
  });

  it('should have Selector active by default', () => {
    expect(editorToolService.getCurrentTool()).toBe('selector');
    const compiled = fixture.nativeElement as HTMLElement;
    const selectorBtn = compiled.querySelector('[data-testid="tool-selector"]') as HTMLElement;
    expect(selectorBtn.classList.contains('active')).toBe(true);
  });

  it('should render eleven tool buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.tool-btn').length).toBe(11);
  });

  it('disables insert image when no SVG instance', () => {
    editorDocumentMock.getSVGInstance.mockReturnValue(null);
    const f = TestBed.createComponent(ToolStripComponent);
    f.detectChanges();
    const btn = (f.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-insert-image"]'
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    editorDocumentMock.getSVGInstance.mockReturnValue({} as unknown);
  });

  it('should set tool to zoom when Zoom button is clicked', () => {
    const setToolSpy = vi.spyOn(editorToolService, 'setTool');
    const zoomBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-zoom"]'
    ) as HTMLElement;

    zoomBtn.click();
    fixture.detectChanges();

    expect(setToolSpy).toHaveBeenCalledWith('zoom');
    expect(editorToolService.getCurrentTool()).toBe('zoom');
  });

  it('should set tool to selector when Selector button is clicked', () => {
    editorToolService.setTool('zoom');
    fixture.detectChanges();

    const setToolSpy = vi.spyOn(editorToolService, 'setTool');
    const selectorBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-selector"]'
    ) as HTMLElement;

    selectorBtn.click();
    fixture.detectChanges();

    expect(setToolSpy).toHaveBeenCalledWith('selector');
    expect(editorToolService.getCurrentTool()).toBe('selector');
  });

  it('should set tool to node-edit-selector when Node Edit button is clicked', () => {
    const nodeEditBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-node-edit-selector"]'
    ) as HTMLElement;

    nodeEditBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('node-edit-selector');
  });

  it('should set tool to pan when Pan button is clicked', () => {
    const setToolSpy = vi.spyOn(editorToolService, 'setTool');
    const panBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-pan"]'
    ) as HTMLElement;

    panBtn.click();
    fixture.detectChanges();

    expect(setToolSpy).toHaveBeenCalledWith('pan');
    expect(editorToolService.getCurrentTool()).toBe('pan');
  });

  it('should show Zoom button as active when zoom tool is selected', () => {
    editorToolService.setTool('zoom');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const zoomBtn = compiled.querySelector('[data-testid="tool-zoom"]');
    const selectorBtn = compiled.querySelector('[data-testid="tool-selector"]');
    expect(zoomBtn?.classList.contains('active')).toBe(true);
    expect(selectorBtn?.classList.contains('active')).toBe(false);
  });

  it('should show Pan button as active when pan tool is selected', () => {
    editorToolService.setTool('pan');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const panBtn = compiled.querySelector('[data-testid="tool-pan"]');
    const selectorBtn = compiled.querySelector('[data-testid="tool-selector"]');
    expect(panBtn?.classList.contains('active')).toBe(true);
    expect(selectorBtn?.classList.contains('active')).toBe(false);
  });

  it('should set tool to rect when Rect button is clicked', () => {
    const rectBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-rect"]'
    ) as HTMLElement;

    rectBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('rect');
  });

  it('should set tool to ellipse when Ellipse button is clicked', () => {
    const ellipseBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-ellipse"]'
    ) as HTMLElement;

    ellipseBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('ellipse');
  });

  it('should set tool to line when Line button is clicked', () => {
    const lineBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-line"]'
    ) as HTMLElement;

    lineBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('line');
  });

  it('isCreationTool() returns true for rect, ellipse, and line', () => {
    expect(editorToolService.isCreationTool('rect')).toBe(true);
    expect(editorToolService.isCreationTool('ellipse')).toBe(true);
    expect(editorToolService.isCreationTool('line')).toBe(true);
  });

  it('isCreationTool() returns false for selector, node-edit-selector, zoom, pan, text, and pen', () => {
    expect(editorToolService.isCreationTool('selector')).toBe(false);
    expect(editorToolService.isCreationTool('node-edit-selector')).toBe(false);
    expect(editorToolService.isCreationTool('zoom')).toBe(false);
    expect(editorToolService.isCreationTool('pan')).toBe(false);
    expect(editorToolService.isCreationTool('text')).toBe(false);
    expect(editorToolService.isCreationTool('pen')).toBe(false);
  });

  it('should set tool to text when Text button is clicked', () => {
    const textBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-text"]'
    ) as HTMLElement;

    textBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('text');
  });

  it('should set tool to pen when Pen button is clicked', () => {
    const penBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tool-pen"]'
    ) as HTMLElement;

    penBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('pen');
  });

  it('insert image delegates to RasterImageInsertService with resolved anchor', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const file = new File([bytes], 't.png', { type: 'image/png' });

    await fixture.componentInstance.onRasterImageFileChosen({
      target: { files: [file], value: '' }
    } as unknown as Event);

    expect(rasterInsertSpy).toHaveBeenCalledTimes(1);
    expect(rasterInsertSpy.mock.calls[0][0]).toBe(file);
    expect(rasterInsertSpy.mock.calls[0][1]).toEqual({ x: 400, y: 300 });
    expect(rasterInsertSpy.mock.calls[0][2]).toBeUndefined();
  });
});
