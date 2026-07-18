import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextPanelComponent } from './text-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { editorPortTestProviders } from '../../testing/editor-port-test-providers';

describe('TextPanelComponent', () => {
  let component: TextPanelComponent;
  let fixture: ComponentFixture<TextPanelComponent>;
  let svgManipulationService: SvgManipulationService;
  let editorToolService: EditorToolService;
  let selectedShapesSignal: WritableSignal<ShapeProperties[]>;
  let drawingDefaultsSignal: WritableSignal<{
    fill: string;
    stroke: string;
    strokeWidth: number;
    fontFamily: string;
    fontSize: number;
    fontWeight: string;
    fontStyle: 'normal' | 'italic';
    textAnchor: 'start' | 'middle' | 'end';
    dominantBaseline: 'auto' | 'middle' | 'hanging' | 'text-before-edge';
    letterSpacing: number;
    wordSpacing: number;
  }>;

  beforeEach(async () => {
    selectedShapesSignal = signal<ShapeProperties[]>([]);
    drawingDefaultsSignal = signal({
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 2,
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAnchor: 'start',
      dominantBaseline: 'auto',
      letterSpacing: 0,
      wordSpacing: 0
    });

    const editorToolSignal = signal<'selector' | 'zoom' | 'text'>('selector');

    const shapeSelectionServiceMock = {
      selectedShapes: selectedShapesSignal,
      selectedShape: computed(() => {
        const shapes = selectedShapesSignal();
        return shapes.length > 0 ? shapes[0] : null;
      }),
      selectionCount: computed(() => selectedShapesSignal().length),
      getSelectedShapes: () => selectedShapesSignal(),
      updateSelectedShape: vi.fn((updates: Partial<ShapeProperties>) => {
        const current = selectedShapesSignal();
        if (current.length > 0) {
          selectedShapesSignal.set([{ ...current[0], ...updates }, ...current.slice(1)]);
        }
      }),
      patchAllSelected: vi.fn((updates: Partial<ShapeProperties>) => {
        selectedShapesSignal.update((arr) => arr.map((s) => ({ ...s, ...updates })));
      }),
      clearSelection: vi.fn(() => selectedShapesSignal.set([])),
      selectShape: vi.fn((shape: ShapeProperties) => selectedShapesSignal.set([shape]))
    };

    const svgManipulationServiceMock = {
      getSVGInstance: vi.fn(),
      documentRevision: signal(0),
      updateTextFontFamily: vi.fn(),
      updateTextFontSize: vi.fn(),
      updateTextFontWeight: vi.fn(),
      updateTextFontStyle: vi.fn(),
      updateTextAnchor: vi.fn(),
      updateTextDominantBaseline: vi.fn(),
      updateTextLetterSpacing: vi.fn(),
      updateTextWordSpacing: vi.fn(),
      updateTextPaintOrder: vi.fn(),
      updateTextVectorEffect: vi.fn(),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
      isElementDirectLocked: vi.fn().mockReturnValue(false)
    };

    const editorToolServiceMock = {
      currentTool: editorToolSignal,
      setTool: vi.fn((tool: 'selector' | 'zoom' | 'text') => editorToolSignal.set(tool))
    };

    const drawingStyleDefaultsServiceMock = {
      defaults: computed(() => drawingDefaultsSignal()),
      fill: computed(() => drawingDefaultsSignal().fill),
      stroke: computed(() => drawingDefaultsSignal().stroke),
      strokeWidth: computed(() => drawingDefaultsSignal().strokeWidth),
      fontFamily: computed(() => drawingDefaultsSignal().fontFamily),
      fontSize: computed(() => drawingDefaultsSignal().fontSize),
      fontWeight: computed(() => drawingDefaultsSignal().fontWeight),
      fontStyle: computed(() => drawingDefaultsSignal().fontStyle),
      textAnchor: computed(() => drawingDefaultsSignal().textAnchor),
      dominantBaseline: computed(() => drawingDefaultsSignal().dominantBaseline),
      letterSpacing: computed(() => drawingDefaultsSignal().letterSpacing),
      wordSpacing: computed(() => drawingDefaultsSignal().wordSpacing),
      setDefaults: vi.fn(
        (next: {
          fill: string;
          stroke: string;
          strokeWidth: number;
          fontFamily: string;
          fontSize: number;
          fontWeight: string;
          fontStyle: 'normal' | 'italic';
          textAnchor: 'start' | 'middle' | 'end';
          dominantBaseline: 'auto' | 'middle' | 'hanging' | 'text-before-edge';
          letterSpacing: number;
          wordSpacing: number;
        }) => {
          drawingDefaultsSignal.set(next);
        }
      )
    };

    const editorHistoryRevision = signal(0);
    const editorHistoryMock = {
      revision: editorHistoryRevision,
      pushAndExecute: vi.fn((cmd: { execute(): void }) => {
        cmd.execute();
        editorHistoryRevision.update((n) => n + 1);
      }),
      canUndo: computed(() => false),
      canRedo: computed(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [TextPanelComponent],
      providers: [
        ...editorPortTestProviders,
        { provide: ShapeSelectionService, useValue: shapeSelectionServiceMock },
        { provide: SvgManipulationService, useValue: svgManipulationServiceMock },
        { provide: EditorToolService, useValue: editorToolServiceMock },
        { provide: DrawingStyleDefaultsService, useValue: drawingStyleDefaultsServiceMock },
        { provide: EditorHistoryService, useValue: editorHistoryMock }
      ]
    }).compileComponents();

    svgManipulationService = TestBed.inject(SvgManipulationService);
    editorToolService = TestBed.inject(EditorToolService);
    fixture = TestBed.createComponent(TextPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('disables typography when selected text is under a locked layer', () => {
    vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockReturnValue(true);
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const font = fixture.nativeElement.querySelector('#font-family') as HTMLSelectElement | null;
    expect(font?.disabled).toBe(true);
  });

  it('shows text controls when selection includes text shapes', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', textContent: 'Hello', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#font-family')).toBeTruthy();
    expect(el.textContent).toContain('Text Align');
  });

  it('hides text controls when no text shape is selected and text tool is inactive', () => {
    selectedShapesSignal.set([{ id: 'rect-1', type: 'rect' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#font-family')).toBeNull();
    expect(el.textContent).not.toContain('Text Align');
  });

  it('shows placement defaults when text tool is active with empty selection', () => {
    editorToolService.currentTool.set('text');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="text-tool-placement-hint"]')).toBeTruthy();
    expect(el.querySelector('#font-family')).toBeTruthy();
  });

  it('updates text font family through command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    component.onFontFamilyChange({ target: { value: 'Verdana, sans-serif' } } as unknown as Event);
    expect(svgManipulationService.updateTextFontFamily).toHaveBeenCalledWith('text-1', 'Verdana, sans-serif');
  });

  it('updates text alignment through command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', textAnchor: 'start' }]);
    fixture.detectChanges();
    component.onTextAlignChange('middle');
    expect(svgManipulationService.updateTextAnchor).toHaveBeenCalledWith('text-1', 'middle');
  });

  it('shows text outline semantics controls for text selection', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="text-outline-paint-hint"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="text-paint-order"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="text-vector-effect"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Outline color');
    expect(el.textContent).not.toContain('Stroke Color');
  });

  it('applies text paint order via command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text' }]);
    fixture.detectChanges();
    component.onTextPaintOrderChange({ target: { value: 'stroke fill' } } as unknown as Event);
    expect(svgManipulationService.updateTextPaintOrder).toHaveBeenCalledWith('text-1', 'stroke fill');
  });

  it('applies non-scaling stroke toggle via command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text' }]);
    fixture.detectChanges();
    component.onTextNonScalingStrokeChange({ target: { checked: true } } as unknown as Event);
    expect(svgManipulationService.updateTextVectorEffect).toHaveBeenCalledWith(
      'text-1',
      'non-scaling-stroke'
    );
  });

  it('applies dominant-baseline via command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text' }]);
    fixture.detectChanges();
    component.onDominantBaselineChange({ target: { value: 'middle' } } as unknown as Event);
    expect(svgManipulationService.updateTextDominantBaseline).toHaveBeenCalledWith('text-1', 'middle');
  });

  it('applies letter-spacing via command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text' }]);
    fixture.detectChanges();
    component.onLetterSpacingChange({ target: { value: '2' } } as unknown as Event);
    expect(svgManipulationService.updateTextLetterSpacing).toHaveBeenCalledWith('text-1', 2);
  });

  it('applies word-spacing via command path', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text' }]);
    fixture.detectChanges();
    component.onWordSpacingChange({ target: { value: '4' } } as unknown as Event);
    expect(svgManipulationService.updateTextWordSpacing).toHaveBeenCalledWith('text-1', 4);
  });

  it('shows Mixed for disagreeing letter-spacing', () => {
    selectedShapesSignal.set([
      { id: 'text-1', type: 'text', letterSpacing: 0 },
      { id: 'text-2', type: 'text', letterSpacing: 2 }
    ]);
    fixture.detectChanges();
    expect(component.letterSpacingsMixed()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="text-letter-spacing"]').placeholder).toBe(
      '—'
    );
  });
});
