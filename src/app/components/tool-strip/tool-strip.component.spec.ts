import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToolStripComponent } from './tool-strip.component';
import { EditorToolService } from '../../services/editor-tool.service';

describe('ToolStripComponent', () => {
  let component: ToolStripComponent;
  let fixture: ComponentFixture<ToolStripComponent>;
  let editorToolService: EditorToolService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolStripComponent],
      providers: [EditorToolService]
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

  it('should display Selector, Zoom, and Pan buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const buttons = compiled.querySelectorAll('.tool-btn');
    expect(buttons.length).toBe(3);
    expect((buttons[0] as HTMLElement).textContent?.trim()).toBe('Selector');
    expect((buttons[1] as HTMLElement).textContent?.trim()).toBe('Zoom');
    expect((buttons[2] as HTMLElement).textContent?.trim()).toContain('Pan');
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
});
