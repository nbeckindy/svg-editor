import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToolStripComponent } from './tool-strip.component';
import { EditorToolService } from '../../services/editor-tool.service';

describe('ToolStripComponent', () => {
  let fixture: ComponentFixture<ToolStripComponent>;
  let editorToolService: EditorToolService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolStripComponent],
      providers: [EditorToolService]
    }).compileComponents();

    fixture = TestBed.createComponent(ToolStripComponent);
    editorToolService = TestBed.inject(EditorToolService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have Selector active by default', () => {
    expect(editorToolService.getCurrentTool()).toBe('selector');
    const compiled = fixture.nativeElement as HTMLElement;
    const selectorBtn = compiled.querySelector('[data-testid="tool-selector"]') as HTMLElement;
    expect(selectorBtn.classList.contains('active')).toBe(true);
  });

  it('should render ten tool buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.tool-btn').length).toBe(10);
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
});
