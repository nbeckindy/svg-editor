import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { Matrix } from '@svgdotjs/svg.js';
import { PropertiesPanelComponent } from './properties-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { DEFAULT_ARTBOARD, ArtboardResizeAnchor } from '../../models/artboard.model';
import { editorPortTestProviders } from '../../testing/editor-port-test-providers';
import { vi } from 'vitest';

describe('PropertiesPanelComponent', () => {
  let component: PropertiesPanelComponent;
  let fixture: ComponentFixture<PropertiesPanelComponent>;
  let shapeSelectionService: ShapeSelectionService;
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
      textAnchor: 'start'
    });

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

    const artboardSig = signal({ ...DEFAULT_ARTBOARD });
    const editorToolSignal = signal<'selector' | 'zoom' | 'text'>('selector');
    const svgManipulationServiceMock = {
      updateFillColor: vi.fn(),
      updateStrokeColor: vi.fn(),
      addStroke: vi.fn(),
      removeStroke: vi.fn(),
      updateOpacity: vi.fn(),
      updateFillOpacity: vi.fn(),
      updateStrokeOpacity: vi.fn(),
      clearHighlight: vi.fn(),
      getNearestGroupAncestorId: vi.fn(() => null),
      bakeEffectiveFillToLocal: vi.fn(),
      bakeEffectiveStrokeToLocal: vi.fn(),
      getSVGInstance: vi.fn(),
      getShapeProperties: vi.fn(),
      artboard: computed(() => artboardSig()),
      artboardResizeAnchor: computed(() => 'top-left' as ArtboardResizeAnchor),
      getArtboard: () => artboardSig(),
      setArtboardSize: vi.fn(),
      setArtboardResizeAnchor: vi.fn(),
      setBackgroundColor: vi.fn(),
      documentRevision: signal(0),
      updateStrokeDasharray: vi.fn(),
      updateStrokeDashoffset: vi.fn(),
      updateTextFontFamily: vi.fn(),
      updateTextFontSize: vi.fn(),
      updateTextFontWeight: vi.fn(),
      updateTextFontStyle: vi.fn(),
      updateTextAnchor: vi.fn(),
      updateTextPaintOrder: vi.fn(),
      updateTextVectorEffect: vi.fn(),
      updateRectCornerRadius: vi.fn(),
      restoreRectCornerRadii: vi.fn(),
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 50 }),
      snapshotSelectionTransforms: vi.fn(() => new Map<string, Matrix>()),
      snapshotVectorEffectsForShapes: vi.fn(() => new Map<string, (string | null)[]>()),
      translateShape: vi.fn(),
      applyUnionScaleFromSnapshot: vi.fn(),
      applyUnionRotationFromSnapshot: vi.fn(),
      getSelectionRotationPivot: vi.fn(() => null),
      allocateUniqueDefId: vi.fn(() => 'grad-test'),
      ensureDedicatedPaintGradient: vi.fn(),
      readEditableGradientModelById: vi.fn(() => null),
      capturePaintGradientSnapshot: vi.fn(() => ({
        gradientId: null,
        shapePaintAttr: '#00aa00',
        gradientOuterHtml: null
      })),
      applyPaintGradientSnapshot: vi.fn(),
      countPaintUrlReferencesToDefId: vi.fn().mockReturnValue(0),
      removeGradientDefById: vi.fn(),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
      isElementDirectLocked: vi.fn().mockReturnValue(false),
      setLayerLocked: vi.fn(),
      moveElementBeforeNextSibling: vi.fn().mockReturnValue(true)
    };
    const editorToolServiceMock = {
      currentTool: editorToolSignal
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
      setDefaults: vi.fn((next: {
        fill: string;
        stroke: string;
        strokeWidth: number;
        fontFamily: string;
        fontSize: number;
        fontWeight: string;
        fontStyle: 'normal' | 'italic';
        textAnchor: 'start' | 'middle' | 'end';
      }) => {
        drawingDefaultsSignal.set(next);
      })
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
      imports: [PropertiesPanelComponent],
      providers: [
        ...editorPortTestProviders,
        { provide: ShapeSelectionService, useValue: shapeSelectionServiceMock },
        { provide: SvgManipulationService, useValue: svgManipulationServiceMock },
        { provide: EditorToolService, useValue: editorToolServiceMock },
        { provide: DrawingStyleDefaultsService, useValue: drawingStyleDefaultsServiceMock },
        { provide: EditorHistoryService, useValue: editorHistoryMock }
      ]
    }).compileComponents();

    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    svgManipulationService = TestBed.inject(SvgManipulationService);
    editorToolService = TestBed.inject(EditorToolService);
    fixture = TestBed.createComponent(PropertiesPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
  it('should display empty-state hint when no shape is selected', () => {
    const compiled = fixture.nativeElement;

    const allEmptyStates = compiled.querySelectorAll('.empty-state');
    const hintState = Array.from(allEmptyStates).find(
      (el: any) => el.textContent.includes('Click on a shape')
    );
    expect(hintState).toBeTruthy();
    expect(compiled.querySelector('[data-testid="document-settings-panel"]')).toBeNull();
  });
  it('should display properties when a shape is selected', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'circle',
      fill: '#ff0000',
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 0.8
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.properties-content')).toBeTruthy();
    expect(compiled.textContent).toContain('circle');
    expect(compiled.textContent).toContain('shape-1');
    expect(compiled.querySelector('[data-testid="document-settings-panel"]')).toBeNull();
  });
  it('should show selected shape properties without skew or clear-selection chrome', () => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#000000',
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1
    };
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 5, y: 10, width: 80, height: 40 });

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="properties-transform-x"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-skew-x"]')).toBeNull();
    expect(el.querySelector('[data-testid="properties-skew-y"]')).toBeNull();
    expect(el.textContent).not.toContain('Clear Selection');
    expect(svgManipulationService.getUnionBBox).toHaveBeenCalledWith(['rect-1']);
  });
  it('commits numeric X via translate commands and history', () => {
    const m = new Matrix();
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 10, y: 20, width: 30, height: 40 });
    vi.mocked(svgManipulationService.snapshotSelectionTransforms).mockReturnValue(
      new Map([
        ['a', m.clone()],
        ['b', m.clone()]
      ])
    );
    selectedShapesSignal.set([
      { id: 'a', type: 'rect', fill: '#000' },
      { id: 'b', type: 'rect', fill: '#000' }
    ]);
    fixture.detectChanges();

    const xIn = fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]') as HTMLInputElement;
    xIn.value = '15';
    xIn.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(svgManipulationService.translateShape).toHaveBeenCalledWith('a', 5, 0);
    expect(svgManipulationService.translateShape).toHaveBeenCalledWith('b', 5, 0);
    const history = TestBed.inject(EditorHistoryService) as unknown as { pushAndExecute: ReturnType<typeof vi.fn> };
    expect(history.pushAndExecute).toHaveBeenCalled();
  });
  it('commits numeric width via union scale (east handle)', () => {
    const m = new Matrix();
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 0, y: 0, width: 100, height: 50 });
    vi.mocked(svgManipulationService.snapshotSelectionTransforms).mockReturnValue(new Map([['r1', m.clone()]]));
    vi.mocked(svgManipulationService.snapshotVectorEffectsForShapes).mockReturnValue(new Map());
    selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#000' }]);
    fixture.detectChanges();

    const wIn = fixture.nativeElement.querySelector('[data-testid="properties-transform-w"]') as HTMLInputElement;
    wIn.value = '200';
    wIn.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(svgManipulationService.applyUnionScaleFromSnapshot).toHaveBeenCalledTimes(1);
    const args = vi.mocked(svgManipulationService.applyUnionScaleFromSnapshot).mock.calls[0];
    expect(args[0]).toEqual(['r1']);
    expect(args[1]).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(args[2]).toEqual({ x: 0, y: 0, width: 200, height: 50 });
    expect(args[4]).toBe('e');
  });
  it('rejects invalid width (non-positive)', () => {
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 0, y: 0, width: 100, height: 50 });
    vi.mocked(svgManipulationService.snapshotSelectionTransforms).mockReturnValue(new Map());
    selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#000' }]);
    fixture.detectChanges();

    const wIn = fixture.nativeElement.querySelector('[data-testid="properties-transform-w"]') as HTMLInputElement;
    wIn.value = '0';
    wIn.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(svgManipulationService.applyUnionScaleFromSnapshot).not.toHaveBeenCalled();
  });
  it('should show X/Y/W/H from getUnionBBox and R from matrix atan2 decomposition', () => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#000000',
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1
    };
    const m = new Matrix().rotate(30, 0, 0);
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 1.25, y: 2.5, width: 10, height: 20 });
    vi.mocked(svgManipulationService.getSVGInstance).mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '#rect-1') {
          return { matrix: () => m.clone() };
        }
        return null;
      })
    } as any);

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const xIn = fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]') as HTMLInputElement;
    expect(xIn.tagName).toBe('INPUT');
    expect(Number.parseFloat(xIn.value)).toBeCloseTo(1.25, 5);
    expect(Number.parseFloat((fixture.nativeElement.querySelector('[data-testid="properties-transform-y"]') as HTMLInputElement).value)).toBeCloseTo(2.5, 5);
    expect(Number.parseFloat((fixture.nativeElement.querySelector('[data-testid="properties-transform-w"]') as HTMLInputElement).value)).toBeCloseTo(10, 5);
    expect(Number.parseFloat((fixture.nativeElement.querySelector('[data-testid="properties-transform-h"]') as HTMLInputElement).value)).toBeCloseTo(20, 5);
    expect(Number.parseFloat((fixture.nativeElement.querySelector('[data-testid="properties-transform-r"]') as HTMLInputElement).value)).toBeCloseTo(30, 5);
    expect(svgManipulationService.getUnionBBox).toHaveBeenCalledWith(['rect-1']);
  });
  it('should show Mixed for R when multi-select rotations differ', () => {
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 0, y: 0, width: 50, height: 50 });
    vi.mocked(svgManipulationService.getSVGInstance).mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '#a') {
          return { matrix: () => new Matrix().rotate(0, 0, 0) };
        }
        if (sel === '#b') {
          return { matrix: () => new Matrix().rotate(45, 0, 0) };
        }
        return null;
      })
    } as any);

    selectedShapesSignal.set([
      { id: 'a', type: 'rect', fill: '#000' },
      { id: 'b', type: 'rect', fill: '#000' }
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-r"]')?.textContent?.trim()).toBe(
      'Mixed'
    );
    expect(svgManipulationService.getUnionBBox).toHaveBeenCalledWith(['a', 'b']);
  });
  it('should refresh transform readout when documentRevision bumps', () => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#000000',
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1
    };
    vi.mocked(svgManipulationService.getUnionBBox)
      .mockReturnValueOnce({ x: 0, y: 0, width: 10, height: 10 })
      .mockReturnValue({ x: 100, y: 0, width: 10, height: 10 });
    vi.mocked(svgManipulationService.getSVGInstance).mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '#rect-1') {
          return { matrix: () => new Matrix() };
        }
        return null;
      })
    } as any);

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();
    const xIn0 = fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]') as HTMLInputElement;
    expect(xIn0.tagName).toBe('INPUT');
    expect(Number.parseFloat(xIn0.value)).toBeCloseTo(0, 5);

    const docRev = svgManipulationService.documentRevision as WritableSignal<number>;
    docRev.set(1);
    fixture.detectChanges();
    const xIn1 = fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]') as HTMLInputElement;
    expect(Number.parseFloat(xIn1.value)).toBeCloseTo(100, 5);
  });

  it('should reflect selected shape from signal', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-2',
      type: 'circle',
      fill: '#00ff00'
    };

    expect(component.selectedShape()).toBeNull();

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    expect(component.selectedShape()).toEqual(mockShape);
  });
  describe('layer lock disables inspector inputs', () => {
    it('disables typography when selected text is under a locked layer', () => {
      vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockReturnValue(true);
      selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
      fixture.detectChanges();
      const font = fixture.nativeElement.querySelector('#font-family') as HTMLSelectElement | null;
      expect(font?.disabled).toBe(true);
    });
  });
  it('shows transform readouts for any tool when a shape is selected', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')).toBeTruthy();

    editorToolService.currentTool.set('zoom');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-w"]')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Align');
  });
  it('does not host align/distribute controls (moved to Align & distribute section)', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect' },
      { id: 'shape-2', type: 'rect' },
      { id: 'shape-3', type: 'rect' }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button[title*="Align left"]')).toBeNull();
    expect(el.querySelector('button[title*="Distribute horizontally"]')).toBeNull();
  });
  it('shows text controls when selection includes text shapes', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', textContent: 'Hello', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#font-family')).toBeTruthy();
    expect(el.textContent).toContain('Text Align');
  });
  it('hides text controls when no text shape is selected', () => {
    selectedShapesSignal.set([{ id: 'rect-1', type: 'rect' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#font-family')).toBeNull();
    expect(el.textContent).not.toContain('Text Align');
  });
  it('shows corner radius control when a rect is selected', () => {
    selectedShapesSignal.set([
      { id: 'rect-1', type: 'rect', rx: 4, ry: 4, rectMaxCornerRadius: 15 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const slider = el.querySelector('#properties-rect-corner-radius') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(slider.max).toBe('15');
    const numberInput = el.querySelector(
      '[data-testid="properties-rect-corner-radius"]'
    ) as HTMLInputElement;
    expect(numberInput.value).toBe('4');
    expect(numberInput.max).toBe('15');
  });
  it('hides corner radius control when selection is not a rect', () => {
    selectedShapesSignal.set([{ id: 'ellipse-1', type: 'ellipse', rx: 10, ry: 5 }]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="properties-rect-corner-radius"]')
    ).toBeNull();
  });
  it('shows mixed corner radius when rects disagree', () => {
    selectedShapesSignal.set([
      { id: 'rect-1', type: 'rect', rx: 4, ry: 4, rectMaxCornerRadius: 15 },
      { id: 'rect-2', type: 'rect', rx: 8, ry: 8, rectMaxCornerRadius: 20 }
    ]);
    fixture.detectChanges();
    expect(component.rectCornerRadiiMixed()).toBe(true);
    const input = fixture.nativeElement.querySelector(
      '[data-testid="properties-rect-corner-radius"]'
    ) as HTMLInputElement;
    expect(input.placeholder).toBe('—');
  });
  it('uses the smallest rect clamp limit as the corner radius slider max', () => {
    selectedShapesSignal.set([
      { id: 'rect-1', type: 'rect', rectMaxCornerRadius: 15 },
      { id: 'rect-2', type: 'rect', rectMaxCornerRadius: 40 }
    ]);
    expect(component.rectCornerRadiusSliderMax()).toBe(15);
  });
  it('updates rect corner radius through command path', () => {
    selectedShapesSignal.set([{ id: 'rect-1', type: 'rect' }]);
    fixture.detectChanges();
    component.onRectCornerRadiusChange({ target: { value: '6' } } as unknown as Event);
    expect(svgManipulationService.updateRectCornerRadius).toHaveBeenCalledWith('rect-1', 6);
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
    expect(el.querySelector('[data-testid="properties-text-outline-paint-hint"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-text-paint-order"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-text-vector-effect"]')).toBeTruthy();
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
    expect(svgManipulationService.updateTextVectorEffect).toHaveBeenCalledWith('text-1', 'non-scaling-stroke');
  });

  it('does not host fill/stroke paint controls (moved to Colors and Stroke sections)', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', fill: '#ff0000', stroke: '#000', strokeWidth: 2 }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="properties-fill-paint-swatch"]')).toBeNull();
    expect(el.querySelector('[data-testid="properties-stroke-paint-swatch"]')).toBeNull();
    expect(el.querySelector('#stroke-width')).toBeNull();
    expect(el.querySelector('#opacity')).toBeNull();
    expect(el.textContent).not.toContain('Fill Color');
    expect(el.textContent).not.toContain('Stroke Color');
  });
});
