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

  it('should display document settings and hint when no shape is selected', () => {
    const compiled = fixture.nativeElement;
    const docSettings = compiled.querySelector('[data-testid="document-settings-panel"]');
    expect(docSettings).toBeTruthy();

    const allEmptyStates = compiled.querySelectorAll('.empty-state');
    const hintState = Array.from(allEmptyStates).find(
      (el: any) => el.textContent.includes('Click on a shape')
    );
    expect(hintState).toBeTruthy();
  });

  it('keeps fill/stroke controls visible with no selection', () => {
    selectedShapesSignal.set([]);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Fill Color');
    expect(compiled.textContent).toContain('Stroke Color');
    expect(compiled.textContent).toContain('Target: New shapes');
  });

  it('updates defaults when paint controls are used with no selection', () => {
    selectedShapesSignal.set([]);
    fixture.detectChanges();
    component.onFillColorChange('#112233');
    component.onStrokeColorChange('#445566');
    component.onStrokeWidthChange({ target: { value: '3.5' } } as unknown as Event);
    expect(drawingDefaultsSignal()).toEqual({
      fill: '#112233',
      stroke: '#445566',
      strokeWidth: 3.5,
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAnchor: 'start'
    });
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
    expect(compiled.querySelector('[data-testid="document-settings-panel"]')).toBeTruthy();
  });

  it('should show Skew X/Y from shape transform matrix', () => {
    const mockShape: ShapeProperties = {
      id: 'rect-1',
      type: 'rect',
      fill: '#000000',
      stroke: 'none',
      strokeWidth: 0,
      opacity: 1
    };
    const m = new Matrix().skewX(12, 40, 25);
    vi.mocked(svgManipulationService.getUnionBBox).mockReturnValue({ x: 5, y: 10, width: 80, height: 40 });
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

    const elX = fixture.nativeElement.querySelector('[data-testid="properties-skew-x"]');
    const elY = fixture.nativeElement.querySelector('[data-testid="properties-skew-y"]');
    expect(elX?.textContent?.trim()).toContain('12');
    expect(elY?.textContent?.trim()).toMatch(/0\.0/);
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

  it('shows paint segment controls even when shape has paint source metadata', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'circle',
      fill: '#ff0000',
      fillSource: { kind: 'class-or-stylesheet', classNames: ['accent'] },
      stroke: '#000000',
      strokeWidth: 2,
      strokeSource: { kind: 'presentation-attr' }
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.textContent).toContain('Fill Color');
    expect(compiled.textContent).toContain('Stroke Color');
    expect(compiled.querySelectorAll('app-color-picker').length).toBeGreaterThan(0);
  });

  it('should update fill color when color picker changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      fill: '#ff0000'
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const newColor = '#00ff00';

    component.onFillColorChange(newColor);
    fixture.detectChanges();

    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', newColor);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      fill: newColor,
      fillSource: { kind: 'presentation-attr' }
    });
    expect(drawingDefaultsSignal().fill).toBe(newColor);
  });

  it('should apply fill change to every shape when multiple are selected', () => {
    selectedShapesSignal.set([
      { id: 'a', type: 'rect', fill: '#f00' },
      { id: 'b', type: 'circle', fill: '#0f0' }
    ]);
    fixture.detectChanges();

    component.onFillColorChange('#123456');

    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('a', '#123456');
    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('b', '#123456');
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalled();
  });

  it('should update stroke color when color picker changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const newColor = '#0000ff';

    component.onStrokeColorChange(newColor);
    fixture.detectChanges();

    expect(svgManipulationService.updateStrokeColor).toHaveBeenCalledWith('shape-1', newColor);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      stroke: newColor,
      strokeSource: { kind: 'presentation-attr' }
    });
    expect(drawingDefaultsSignal().stroke).toBe(newColor);
  });

  it('should clear fill when fill is set to none', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      fill: '#ff0000'
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    component.onFillColorChange('none');
    fixture.detectChanges();

    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', 'none');
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      fill: undefined,
      fillSource: { kind: 'default' }
    });
    expect(drawingDefaultsSignal().fill).toBe('none');
  });

  it('should remove stroke when stroke color is set to "none"', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    component.onStrokeColorChange('none');
    fixture.detectChanges();

    expect(svgManipulationService.removeStroke).toHaveBeenCalledWith('shape-1');
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      stroke: undefined,
      strokeWidth: 0,
      strokeSource: { kind: 'default' }
    });
  });

  it('should update stroke width when slider changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const newWidth = 5;
    const event = { target: { value: newWidth.toString() } } as unknown as Event;

    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', newWidth);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      strokeWidth: newWidth,
      strokeSource: { kind: 'presentation-attr' }
    });
    expect(drawingDefaultsSignal().strokeWidth).toBe(newWidth);
  });

  it('should remove stroke when stroke width is set to 0', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const event = { target: { value: '0' } } as unknown as Event;

    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.removeStroke).toHaveBeenCalledWith('shape-1');
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      strokeWidth: 0,
      stroke: undefined,
      strokeSource: { kind: 'default' }
    });
  });

  it('should update opacity when slider changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      opacity: 1
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const newOpacity = 0.5;
    const event = { target: { value: newOpacity.toString() } } as unknown as Event;

    component.onOpacityChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.updateOpacity).toHaveBeenCalledWith('shape-1', newOpacity);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({ opacity: newOpacity });
  });

  it('should clear selection when clear button is clicked', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect'
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    component.onClearSelection();
    fixture.detectChanges();

    expect(shapeSelectionService.clearSelection).toHaveBeenCalled();
    expect(svgManipulationService.clearHighlight).toHaveBeenCalled();
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

  it('should use default stroke color when adding stroke without existing stroke', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      strokeWidth: 0
    };

    selectedShapesSignal.set([mockShape]);
    fixture.detectChanges();

    const newWidth = 3;
    const event = { target: { value: newWidth.toString() } } as unknown as Event;

    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', newWidth);
  });

  describe('paintSourceText', () => {
    it('maps paint source kinds to short labels', () => {
      expect(component.paintSourceText({ kind: 'inline-style' })).toBe('Inline style');
      expect(component.paintSourceText({ kind: 'presentation-attr' })).toBe('On this shape');
      expect(component.paintSourceText({ kind: 'class-or-stylesheet' })).toBe('From CSS class or stylesheet');
      expect(component.paintSourceText({ kind: 'inherited' })).toBe('From parent');
      expect(component.paintSourceText({ kind: 'default' })).toBe('Default');
      expect(component.paintSourceText({ kind: 'unknown' })).toBe('Unknown');
      expect(component.paintSourceText(undefined)).toBe('Unknown');
    });
  });

  describe('isClassControlled', () => {
    it('is true only for class-or-stylesheet', () => {
      expect(component.isClassControlled({ kind: 'class-or-stylesheet' })).toBe(true);
      expect(component.isClassControlled({ kind: 'presentation-attr' })).toBe(false);
      expect(component.isClassControlled(undefined)).toBe(false);
    });
  });

  describe('hasFillColor / hasStrokeColor', () => {
    it('hasFillColor is false when fill is missing or none', () => {
      expect(component.hasFillColor({ id: 'a', type: 'rect' })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: undefined })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: 'none' })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: '#ff0000' })).toBe(true);
    });

    it('hasStrokeColor is false when stroke is missing or none', () => {
      expect(component.hasStrokeColor({ id: 'a', type: 'rect' })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: undefined })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: 'none' })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: '#000000' })).toBe(true);
    });
  });

  it('shows color pickers with empty stroke/fill when paint is absent', () => {
    selectedShapesSignal.set([
      {
        id: 'shape-1',
        type: 'rect',
        strokeWidth: 0
      }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="properties-fill-color-picker"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-stroke-color-picker"]')).toBeTruthy();
  });

  describe('layer lock disables inspector inputs', () => {
    function fillColorPickerRoot(): HTMLElement | null {
      const host = fixture.nativeElement.querySelector(
        '[data-testid="properties-fill-color-picker"]'
      ) as HTMLElement | null;
      return host?.querySelector('[data-testid="color-picker"]') as HTMLElement | null;
    }

    it('uses read-only fill swatch when selection is under a locked layer', () => {
      vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockReturnValue(true);
      selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#aabbcc' }]);
      fixture.detectChanges();
      const inner = fillColorPickerRoot();
      expect(inner?.classList.contains('color-picker--disabled')).toBe(true);
    });

    it('uses interactive fill picker when selection is not locked', () => {
      selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#aabbcc' }]);
      fixture.detectChanges();
      const inner = fillColorPickerRoot();
      expect(inner?.tagName.toLowerCase()).toBe('details');
    });

    it('disables paint controls but keeps typography enabled when only non-text shapes are locked', () => {
      vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockImplementation((id: string) =>
        id === 'r1' ? true : false
      );
      selectedShapesSignal.set([
        { id: 'r1', type: 'rect', fill: '#000000' },
        { id: 't1', type: 'text', fontFamily: 'Arial, sans-serif' }
      ]);
      fixture.detectChanges();
      const inner = fillColorPickerRoot();
      expect(inner?.classList.contains('color-picker--disabled')).toBe(true);
      const font = fixture.nativeElement.querySelector('#font-family') as HTMLSelectElement | null;
      expect(font?.disabled).toBe(false);
    });

    it('disables typography when selected text is under a locked layer', () => {
      vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockReturnValue(true);
      selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
      fixture.detectChanges();
      const font = fixture.nativeElement.querySelector('#font-family') as HTMLSelectElement | null;
      expect(font?.disabled).toBe(true);
    });
  });

  it('Set fill button applies black fill via manipulation service', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect' }]);
    fixture.detectChanges();
    component.onFillColorChange('#000000');
    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', '#000000');
  });

  it('onCreateGradientFill captures snapshot and pushes history', () => {
    const history = TestBed.inject(EditorHistoryService) as unknown as { pushAndExecute: ReturnType<typeof vi.fn> };
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', fill: '#00aa00', fillPaintType: 'solid' }
    ]);
    fixture.detectChanges();
    component.onCreateGradientFill(selectedShapesSignal()[0]);
    expect(svgManipulationService.allocateUniqueDefId).toHaveBeenCalled();
    expect(svgManipulationService.capturePaintGradientSnapshot).toHaveBeenCalledWith('shape-1', 'fill');
    expect(history.pushAndExecute).toHaveBeenCalled();
  });

  it('canCreateGradientFill is false for gradient or pattern fills', () => {
    selectedShapesSignal.set([{ id: 'x', type: 'rect', fillPaintType: 'gradient' } as ShapeProperties]);
    fixture.detectChanges();
    expect(component.canCreateGradientFill(selectedShapesSignal()[0])).toBe(false);
    selectedShapesSignal.set([{ id: 'x', type: 'rect', fillPaintType: 'pattern' } as ShapeProperties]);
    fixture.detectChanges();
    expect(component.canCreateGradientFill(selectedShapesSignal()[0])).toBe(false);
  });

  it('canCreateGradientFill is true for single solid rect', () => {
    selectedShapesSignal.set([{ id: 'x', type: 'rect', fillPaintType: 'solid' } as ShapeProperties]);
    fixture.detectChanges();
    expect(component.canCreateGradientFill(selectedShapesSignal()[0])).toBe(true);
  });

  describe('gradient / pattern paint UI (a19)', () => {
    it('paintDefIdFromUrl parses def id from url()', () => {
      expect(component.paintDefIdFromUrl('url(#myGrad)')).toBe('myGrad');
      expect(component.paintDefIdFromUrl(undefined)).toBeNull();
    });

    it('shows fill paint def id for gradient fill from fillUrl', () => {
      selectedShapesSignal.set([
        {
          id: 'r1',
          type: 'rect',
          fillPaintType: 'gradient',
          fillUrl: 'url(#gradA)'
        } as ShapeProperties
      ]);
      fixture.detectChanges();
      const code = fixture.nativeElement.querySelector(
        '[data-testid="properties-fill-paint-def-id"]'
      ) as HTMLElement | null;
      expect(code?.textContent?.trim()).toBe('#gradA');
      expect(fixture.nativeElement.textContent).toContain('Solid color picker does not apply');
    });

    it('shows fill paint def id for pattern fill', () => {
      selectedShapesSignal.set([
        {
          id: 'r1',
          type: 'rect',
          fillPaintType: 'pattern',
          fillUrl: 'url(#pat1)'
        } as ShapeProperties
      ]);
      fixture.detectChanges();
      const code = fixture.nativeElement.querySelector(
        '[data-testid="properties-fill-paint-def-id"]'
      ) as HTMLElement | null;
      expect(code?.textContent?.trim()).toBe('#pat1');
      expect(fixture.nativeElement.textContent).toContain('Pattern fill');
    });

    it('shows stroke paint def id for gradient stroke', () => {
      selectedShapesSignal.set([
        {
          id: 'r1',
          type: 'rect',
          fill: '#000000',
          strokePaintType: 'gradient',
          strokeUrl: 'url(#sg1)',
          strokeWidth: 2
        } as ShapeProperties
      ]);
      fixture.detectChanges();
      const code = fixture.nativeElement.querySelector(
        '[data-testid="properties-stroke-paint-def-id"]'
      ) as HTMLElement | null;
      expect(code?.textContent?.trim()).toBe('#sg1');
    });

    it('shows Add gradient fill when single solid rect is selected', () => {
      selectedShapesSignal.set([
        { id: 'shape-1', type: 'rect', fill: '#00aa00', fillPaintType: 'solid' } as ShapeProperties
      ]);
      fixture.detectChanges();
      const btn = fixture.nativeElement.querySelector(
        '[data-testid="properties-add-gradient-fill"]'
      ) as HTMLButtonElement | null;
      expect(btn).toBeTruthy();
      expect(btn?.textContent?.trim()).toContain('Add gradient fill');
    });

    it('renders gradient fill editor when single selection has gradient fill', () => {
      const model = {
        id: 'g1',
        kind: 'linear' as const,
        gradientUnits: 'objectBoundingBox' as const,
        x1: '0%',
        y1: '0%',
        x2: '100%',
        y2: '0%',
        stops: [
          { offset: '0%', color: '#000000' },
          { offset: '100%', color: '#ffffff' }
        ]
      };
      const shapeStub = { attr: vi.fn(() => 'url(#g1)') };
      (svgManipulationService.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({
        findOne: vi.fn(() => shapeStub)
      });
      (svgManipulationService.readEditableGradientModelById as ReturnType<typeof vi.fn>).mockReturnValue(model);

      selectedShapesSignal.set([
        {
          id: 'shape-1',
          type: 'rect',
          fillPaintType: 'gradient',
          fillUrl: 'url(#g1)'
        } as ShapeProperties
      ]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="properties-gradient-fill-details"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('[data-testid="gradient-fill-editor-root"]')).toBeTruthy();
      expect(svgManipulationService.ensureDedicatedPaintGradient).toHaveBeenCalled();
    });

    it('does not render gradient fill editor when multiple shapes are selected', () => {
      (svgManipulationService.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({
        findOne: vi.fn(() => ({ attr: vi.fn(() => 'url(#g1)') }))
      });
      (svgManipulationService.readEditableGradientModelById as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'g1',
        kind: 'linear',
        gradientUnits: 'objectBoundingBox',
        stops: [
          { offset: '0%', color: '#000' },
          { offset: '100%', color: '#fff' }
        ]
      });

      selectedShapesSignal.set([
        {
          id: 'a',
          type: 'rect',
          fillPaintType: 'gradient',
          fillUrl: 'url(#g1)'
        } as ShapeProperties,
        { id: 'b', type: 'rect', fillPaintType: 'solid', fill: '#000000' } as ShapeProperties
      ]);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="properties-gradient-fill-details"]')).toBeNull();
    });
  });

  it('choosing stroke color on shape without stroke uses addStroke with default width', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', strokeWidth: 0 }]);
    fixture.detectChanges();
    component.onStrokeColorChange('#112233');
    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#112233', 2);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      stroke: '#112233',
      strokeWidth: 2,
      strokeSource: { kind: 'presentation-attr' }
    });
  });

  it('reports fillMixed when two selected shapes have different fills', () => {
    selectedShapesSignal.set([
      { id: 'a', type: 'rect', fill: '#ff0000' },
      { id: 'b', type: 'rect', fill: '#00ff00' }
    ]);
    fixture.detectChanges();
    expect(component.fillMixed()).toBe(true);
  });

  it('shows align/distribute controls only in selector mode', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect' }]);
    fixture.detectChanges();
    let el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Align');
    expect(el.textContent).toContain('Distribute');
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')).toBeTruthy();

    editorToolService.currentTool.set('zoom');
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('Distribute');
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')).toBeNull();
  });

  it('disables align buttons for fewer than 2 selected shapes', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const leftBtn = el.querySelector('button[title*="Align left"]') as HTMLButtonElement | null;
    expect(leftBtn).toBeTruthy();
    expect(leftBtn?.disabled).toBe(true);
  });

  it('enables align and distribute based on selection count thresholds', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect' },
      { id: 'shape-2', type: 'rect' },
      { id: 'shape-3', type: 'rect' }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const leftBtn = el.querySelector('button[title*="Align left"]') as HTMLButtonElement | null;
    const distHBtn = el.querySelector('button[title*="Distribute horizontally"]') as HTMLButtonElement | null;
    expect(leftBtn?.disabled).toBe(false);
    expect(distHBtn?.disabled).toBe(false);
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

  it('uses outline-oriented labels when selection is text-only', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', textContent: 'Hi', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Outline color');
    expect(el.textContent).toContain('Outline width');
  });

  it('keeps stroke-oriented labels when selection mixes text with other shapes', () => {
    selectedShapesSignal.set([
      { id: 'text-1', type: 'text', textContent: 'Hi', fontFamily: 'Arial, sans-serif' },
      { id: 'r1', type: 'rect' }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Stroke Color');
    expect(el.textContent).toContain('Stroke Width');
  });

  it('shows text outline semantics controls for text selection', () => {
    selectedShapesSignal.set([{ id: 'text-1', type: 'text', fontFamily: 'Arial, sans-serif' }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="properties-text-outline-paint-hint"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-text-paint-order"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="properties-text-vector-effect"]')).toBeTruthy();
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
});
