import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToolStripComponent } from './tool-strip.component';
import { EditorToolService } from '../../services/editor-tool.service';
import { EditorHistoryService } from '../../services/editor-history.service';

describe('ToolStripComponent', () => {
  let component: ToolStripComponent;
  let fixture: ComponentFixture<ToolStripComponent>;
  let editorToolService: EditorToolService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolStripComponent],
      providers: [EditorToolService, EditorHistoryService]
    }).compileComponents();

    fixture = TestBed.createComponent(ToolStripComponent);
    component = fixture.componentInstance;
    editorToolService = TestBed.inject(EditorToolService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have Selector active by default', () => {
    expect(editorToolService.getCurrentTool()).toBe('selector');
    const compiled = fixture.nativeElement as HTMLElement;
    const selectorBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Selector'
    );
    expect(selectorBtn?.classList.contains('active')).toBe(true);
  });

  it('should display Undo, Redo, Selector, Zoom, Pan, Rect, Ellipse, Line, and Pen buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.tool-btn');
    expect(buttons.length).toBe(9);
    expect((buttons[0] as HTMLElement).textContent?.trim()).toContain('Undo');
    expect((buttons[1] as HTMLElement).textContent?.trim()).toContain('Redo');
    expect((buttons[2] as HTMLElement).textContent?.trim()).toBe('Selector');
    expect((buttons[3] as HTMLElement).textContent?.trim()).toBe('Zoom');
    expect((buttons[4] as HTMLElement).textContent?.trim()).toContain('Pan');
    expect((buttons[5] as HTMLElement).textContent?.trim()).toContain('Rect');
    expect((buttons[6] as HTMLElement).textContent?.trim()).toContain('Ellipse');
    expect((buttons[7] as HTMLElement).textContent?.trim()).toContain('Line');
    expect((buttons[8] as HTMLElement).textContent?.trim()).toContain('Pen');
  });

  it('should set tool to zoom when Zoom button is clicked', () => {
    const setToolSpy = vi.spyOn(editorToolService, 'setTool');
    const compiled = fixture.nativeElement as HTMLElement;
    const zoomBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Zoom'
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
    const compiled = fixture.nativeElement as HTMLElement;
    const selectorBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Selector'
    ) as HTMLElement;

    selectorBtn.click();
    fixture.detectChanges();

    expect(setToolSpy).toHaveBeenCalledWith('selector');
    expect(editorToolService.getCurrentTool()).toBe('selector');
  });

  it('should set tool to pan when Pan button is clicked', () => {
    const setToolSpy = vi.spyOn(editorToolService, 'setTool');
    const compiled = fixture.nativeElement as HTMLElement;
    const panBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim().includes('Pan')
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
    const zoomBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Zoom'
    );
    const selectorBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Selector'
    );
    expect(zoomBtn?.classList.contains('active')).toBe(true);
    expect(selectorBtn?.classList.contains('active')).toBe(false);
  });

  it('should show Pan button as active when pan tool is selected', () => {
    editorToolService.setTool('pan');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const panBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim().includes('Pan')
    );
    const selectorBtn = Array.from(compiled.querySelectorAll('.tool-btn')).find(
      (el) => (el as HTMLElement).textContent?.trim() === 'Selector'
    );
    expect(panBtn?.classList.contains('active')).toBe(true);
    expect(selectorBtn?.classList.contains('active')).toBe(false);
  });

  it('should set tool to rect when Rect button is clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rectBtn = compiled.querySelector('[data-testid="tool-rect"]') as HTMLElement;
    expect(rectBtn).toBeTruthy();

    rectBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('rect');
  });

  it('should set tool to ellipse when Ellipse button is clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const ellipseBtn = compiled.querySelector('[data-testid="tool-ellipse"]') as HTMLElement;
    expect(ellipseBtn).toBeTruthy();

    ellipseBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('ellipse');
  });

  it('should set tool to line when Line button is clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const lineBtn = compiled.querySelector('[data-testid="tool-line"]') as HTMLElement;
    expect(lineBtn).toBeTruthy();

    lineBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('line');
  });

  it('isCreationTool() returns true for rect, ellipse, and line', () => {
    expect(editorToolService.isCreationTool('rect')).toBe(true);
    expect(editorToolService.isCreationTool('ellipse')).toBe(true);
    expect(editorToolService.isCreationTool('line')).toBe(true);
  });

  it('isCreationTool() returns false for selector, zoom, pan, and pen', () => {
    expect(editorToolService.isCreationTool('selector')).toBe(false);
    expect(editorToolService.isCreationTool('zoom')).toBe(false);
    expect(editorToolService.isCreationTool('pan')).toBe(false);
    expect(editorToolService.isCreationTool('pen')).toBe(false);
  });

  it('should set tool to pen when Pen button is clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const penBtn = compiled.querySelector('[data-testid="tool-pen"]') as HTMLElement;
    expect(penBtn).toBeTruthy();

    penBtn.click();
    fixture.detectChanges();

    expect(editorToolService.getCurrentTool()).toBe('pen');
  });
});
