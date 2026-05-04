import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorTopBarComponent } from './editor-top-bar.component';
import { EditorToolService } from '../../services/editor-tool.service';

describe('EditorTopBarComponent', () => {
  let fixture: ComponentFixture<EditorTopBarComponent>;
  let editorTool: EditorToolService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorTopBarComponent],
      providers: [EditorToolService]
    }).compileComponents();

    fixture = TestBed.createComponent(EditorTopBarComponent);
    fixture.componentRef.setInput('hasSvgContent', false);
    editorTool = TestBed.inject(EditorToolService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should toggle snap menu when Snap button is clicked', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const btn = compiled.querySelector('[data-testid="editor-snap-menu-button"]') as HTMLElement;

    expect(fixture.componentInstance.snapMenuOpen()).toBe(false);
    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.snapMenuOpen()).toBe(true);

    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.snapMenuOpen()).toBe(false);
  });

  it('should sync grid snap checkbox with EditorToolService', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const btn = compiled.querySelector('[data-testid="editor-snap-menu-button"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();

    const gridCb = compiled.querySelector(
      '[data-testid="editor-snap-grid-checkbox"]'
    ) as HTMLInputElement;
    expect(gridCb.checked).toBe(false);

    gridCb.click();
    fixture.detectChanges();

    expect(editorTool.isGridSnapEnabled()).toBe(true);
    expect(gridCb.checked).toBe(true);

    gridCb.click();
    fixture.detectChanges();

    expect(editorTool.isGridSnapEnabled()).toBe(false);
  });

  it('should sync shape snap checkbox with EditorToolService', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const btn = compiled.querySelector('[data-testid="editor-snap-menu-button"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();

    const shapeCb = compiled.querySelector(
      '[data-testid="editor-snap-shape-checkbox"]'
    ) as HTMLInputElement;

    shapeCb.click();
    fixture.detectChanges();

    expect(editorTool.isShapeSnapEnabled()).toBe(true);

    shapeCb.click();
    fixture.detectChanges();

    expect(editorTool.isShapeSnapEnabled()).toBe(false);
  });

  it('should close snap menu on document click outside snap menu root', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const btn = compiled.querySelector('[data-testid="editor-snap-menu-button"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.snapMenuOpen()).toBe(true);

    document.body.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.snapMenuOpen()).toBe(false);
  });
});
