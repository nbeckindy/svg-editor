import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ColorsPanelComponent } from './colors-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { editorPortTestProviders } from '../../testing/editor-port-test-providers';

describe('ColorsPanelComponent', () => {
  let fixture: ComponentFixture<ColorsPanelComponent>;
  let component: ColorsPanelComponent;
  let selectedShapesSignal: WritableSignal<ShapeProperties[]>;
  let svgManipulationService: SvgManipulationService;
  let shapeSelectionService: ShapeSelectionService;
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
      updateSelectedShape: vi.fn(),
      patchAllSelected: vi.fn((updates: Partial<ShapeProperties>) => {
        selectedShapesSignal.update((arr) => arr.map((s) => ({ ...s, ...updates })));
      }),
      clearSelection: vi.fn(() => selectedShapesSignal.set([])),
      selectShape: vi.fn((shape: ShapeProperties) => selectedShapesSignal.set([shape]))
    };

    const svgManipulationServiceMock = {
      updateFillColor: vi.fn(),
      updateStrokeColor: vi.fn(),
      addStroke: vi.fn(),
      removeStroke: vi.fn(),
      updateOpacity: vi.fn(),
      getSVGInstance: vi.fn(),
      documentRevision: signal(0),
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
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false)
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
      setDefaults: vi.fn((next: typeof drawingDefaultsSignal extends WritableSignal<infer T> ? T : never) => {
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
      imports: [ColorsPanelComponent],
      providers: [
        ...editorPortTestProviders,
        { provide: ShapeSelectionService, useValue: shapeSelectionServiceMock },
        { provide: SvgManipulationService, useValue: svgManipulationServiceMock },
        { provide: DrawingStyleDefaultsService, useValue: drawingStyleDefaultsServiceMock },
        { provide: EditorHistoryService, useValue: editorHistoryMock }
      ]
    }).compileComponents();

    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    svgManipulationService = TestBed.inject(SvgManipulationService);
    fixture = TestBed.createComponent(ColorsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows empty hint when nothing is selected', () => {
    expect(fixture.nativeElement.textContent).toContain('Select a shape to edit fill and opacity');
    expect(fixture.nativeElement.querySelector('[data-testid="colors-fill-paint-swatch"]')).toBeNull();
  });

  it('shows fill swatch and opacity when a shape is selected', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', fill: '#ff0000', opacity: 0.8 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="colors-fill-paint-swatch"]')).toBeTruthy();
    expect(el.querySelector('#colors-opacity')).toBeTruthy();
    expect(el.textContent).toContain('Fill');
    expect(el.textContent).toContain('Opacity');
  });

  it('updates fill color through chrome apply', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', fill: '#ff0000' }]);
    fixture.detectChanges();
    component.paint.onFillColorChange('#112233');
    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', '#112233');
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({
      fill: '#112233',
      fillPaintType: 'solid',
      fillUrl: undefined,
      fillSource: { kind: 'presentation-attr' }
    });
  });

  it('updates opacity through chrome apply', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', opacity: 1 }]);
    fixture.detectChanges();
    component.paint.onOpacityChange({ target: { value: '0.5' } } as unknown as Event);
    expect(svgManipulationService.updateOpacity).toHaveBeenCalledWith('shape-1', 0.5);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({ opacity: 0.5 });
  });

  it('routes fill gradient mode through chrome apply', () => {
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', fill: '#00aa00', fillPaintType: 'solid' }
    ]);
    fixture.detectChanges();
    component.paint.onFillPaintModeChange('linear');
    expect(svgManipulationService.allocateUniqueDefId).toHaveBeenCalled();
    expect(svgManipulationService.capturePaintGradientSnapshot).toHaveBeenCalledWith('shape-1', 'fill');
    expect(history.pushAndExecute).toHaveBeenCalled();
  });

  it('renders gradient fill editor for single gradient selection', () => {
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
    (svgManipulationService.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({
      findOne: vi.fn(() => ({ attr: vi.fn(() => 'url(#g1)') }))
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
    expect(fixture.nativeElement.querySelector('[data-testid="colors-gradient-fill-details"]')).toBeTruthy();
    expect(svgManipulationService.ensureDedicatedPaintGradient).toHaveBeenCalledWith('shape-1', 'fill');
  });

  it('disables fill swatch when selection is locked', () => {
    vi.mocked(svgManipulationService.isElementOrAncestorLocked).mockReturnValue(true);
    selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#aabbcc' }]);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector(
      '[data-testid="colors-fill-paint-swatch"]'
    ) as HTMLElement | null;
    const inner = host?.querySelector('[data-testid="paint-swatch-popover"]') as HTMLElement | null;
    expect(inner?.classList.contains('paint-swatch-popover--disabled')).toBe(true);
  });

  it('shows pattern fill hint for pattern paints', () => {
    selectedShapesSignal.set([
      {
        id: 'r1',
        type: 'rect',
        fillPaintType: 'pattern',
        fillUrl: 'url(#pat1)'
      } as ShapeProperties
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pattern fill');
  });
});
