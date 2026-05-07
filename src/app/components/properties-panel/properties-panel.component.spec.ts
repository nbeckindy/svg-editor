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
  let drawingDefaultsSignal: WritableSignal<{ fill: string; stroke: string; strokeWidth: number }>;

  beforeEach(async () => {
    selectedShapesSignal = signal<ShapeProperties[]>([]);
    drawingDefaultsSignal = signal({ fill: '#000000', stroke: '#000000', strokeWidth: 2 });

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
      clearSelection: vi.fn(() => selectedShapesSignal.set([]))
    };

    const artboardSig = signal({ ...DEFAULT_ARTBOARD });
    const editorToolSignal = signal<'selector' | 'zoom'>('selector');
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
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 50 }),
      allocateUniqueDefId: vi.fn(() => 'grad-test'),
      capturePaintGradientSnapshot: vi.fn(() => ({
        gradientId: null,
        shapePaintAttr: '#00aa00',
        gradientOuterHtml: null
      })),
      applyPaintGradientSnapshot: vi.fn()
    };
    const editorToolServiceMock = {
      currentTool: editorToolSignal
    };
    const drawingStyleDefaultsServiceMock = {
      defaults: computed(() => drawingDefaultsSignal()),
      fill: computed(() => drawingDefaultsSignal().fill),
      stroke: computed(() => drawingDefaultsSignal().stroke),
      strokeWidth: computed(() => drawingDefaultsSignal().strokeWidth),
      setDefaults: vi.fn((next: { fill: string; stroke: string; strokeWidth: number }) => {
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
      strokeWidth: 3.5
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

    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')?.textContent?.trim()).toBe(
      '1.3'
    );
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-y"]')?.textContent?.trim()).toBe(
      '2.5'
    );
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-w"]')?.textContent?.trim()).toBe(
      '10.0'
    );
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-h"]')?.textContent?.trim()).toBe(
      '20.0'
    );
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-r"]')?.textContent?.trim()).toBe(
      '30.0°'
    );
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
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')?.textContent?.trim()).toBe(
      '0.0'
    );

    const docRev = svgManipulationService.documentRevision as WritableSignal<number>;
    docRev.set(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="properties-transform-x"]')?.textContent?.trim()).toBe(
      '100.0'
    );
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

  it('shows No fill and No stroke instead of color pickers when paint is absent', () => {
    selectedShapesSignal.set([
      {
        id: 'shape-1',
        type: 'rect',
        strokeWidth: 0
      }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No fill');
    expect(el.textContent).toContain('No stroke');
    expect(el.querySelector('app-color-picker')).toBeNull();
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

  it('Set stroke button adds stroke with width 1', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', strokeWidth: 0 }]);
    fixture.detectChanges();
    component.onAddStrokeClick();
    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', 1);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      stroke: '#000000',
      strokeWidth: 1,
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
});
