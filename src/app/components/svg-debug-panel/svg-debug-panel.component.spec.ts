import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { SvgDebugPanelComponent } from './svg-debug-panel.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorPointerIntentDebugService } from '../../services/editor-pointer-intent-debug.service';
import { vi } from 'vitest';

describe('SvgDebugPanelComponent', () => {
  let fixture: ComponentFixture<SvgDebugPanelComponent>;
  let documentRevision: WritableSignal<number>;
  let exportSVG: ReturnType<typeof vi.fn>;
  let pointerIntentDebug: EditorPointerIntentDebugService;

  beforeEach(async () => {
    documentRevision = signal(0);
    exportSVG = vi.fn(() => '');

    await TestBed.configureTestingModule({
      imports: [SvgDebugPanelComponent],
      providers: [
        { provide: SvgManipulationService, useValue: { documentRevision, exportSVG } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SvgDebugPanelComponent);
    pointerIntentDebug = TestBed.inject(EditorPointerIntentDebugService);
  });

  function expandPanel(): void {
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.debug-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('keeps pointer-intent sampling disabled while collapsed', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.isCollapsed()).toBe(true);
    expect(pointerIntentDebug.samplingEnabled()).toBe(false);
  });

  it('enables pointer-intent sampling when expanded and disables when collapsed', () => {
    fixture.detectChanges();
    expandPanel();
    expect(pointerIntentDebug.samplingEnabled()).toBe(true);

    const button = fixture.nativeElement.querySelector('.debug-toggle') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(pointerIntentDebug.samplingEnabled()).toBe(false);
  });

  it('should show empty state when exportSVG is empty', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="svg-debug-editor"]')).toBeNull();
    expandPanel();
    expect(el.querySelector('.debug-panel-empty')).toBeTruthy();
    expect(el.querySelector('[data-testid="svg-debug-editor"]')).toBeNull();
  });

  it('should show editable XML when exportSVG returns content', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle id="c1" cx="5" cy="5" r="2" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();

    expandPanel();
    const editor = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-editor"]'
    ) as HTMLTextAreaElement;
    expect(editor).toBeTruthy();
    expect(editor.value).toContain('<circle');
    expect(editor.value).toContain('id="c1"');
  });

  it('should collapse and expand debug content', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="0" cy="0" r="1" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('.debug-toggle') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(el.querySelector('[data-testid="svg-debug-editor"]')).toBeNull();
    expect(button.textContent).toContain('Expand');

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="svg-debug-editor"]')).toBeTruthy();
    expect(button.textContent).toContain('Collapse');

    button.click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="svg-debug-editor"]')).toBeNull();
    expect(button.textContent).toContain('Expand');
  });

  it('should emit svgContentApplied when apply is clicked with valid edits', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle id="c1" cx="5" cy="5" r="2" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();
    expandPanel();

    const emitted: string[] = [];
    fixture.componentInstance.svgContentApplied.subscribe((value) => emitted.push(value));

    const editor = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-editor"]'
    ) as HTMLTextAreaElement;
    editor.value = editor.value.replace('r="2"', 'r="4"');
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const apply = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-apply"]'
    ) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    apply.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toContain('r="4"');
    expect(fixture.componentInstance.isDirty()).toBe(false);
  });

  it('should show parse error and not emit when apply is clicked with invalid XML', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="0" cy="0" r="1" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();
    expandPanel();

    const emitted: string[] = [];
    fixture.componentInstance.svgContentApplied.subscribe((value) => emitted.push(value));

    const editor = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-editor"]'
    ) as HTMLTextAreaElement;
    editor.value = '<svg><unclosed>';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const apply = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-apply"]'
    ) as HTMLButtonElement;
    apply.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('[data-testid="svg-debug-parse-error"]')).toBeTruthy();
  });

  it('should revert draft to exported XML', () => {
    exportSVG.mockReturnValue(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="0" cy="0" r="1" /></svg>'
    );
    documentRevision.set(1);
    fixture.detectChanges();
    expandPanel();

    const editor = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-editor"]'
    ) as HTMLTextAreaElement;
    const original = editor.value;
    editor.value = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const revert = fixture.nativeElement.querySelector(
      '[data-testid="svg-debug-revert"]'
    ) as HTMLButtonElement;
    revert.click();
    fixture.detectChanges();

    expect(editor.value).toBe(original);
    expect(fixture.componentInstance.isDirty()).toBe(false);
  });
});
