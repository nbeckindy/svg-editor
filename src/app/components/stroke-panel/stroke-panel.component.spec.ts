import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrokePanelComponent } from './stroke-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { editorPortTestProviders } from '../../testing/editor-port-test-providers';

describe('StrokePanelComponent', () => {
  let fixture: ComponentFixture<StrokePanelComponent>;
  let component: StrokePanelComponent;
  let selectedShapesSignal: WritableSignal<ShapeProperties[]>;
  let svgManipulationService: SvgManipulationService;
  let shapeSelectionService: ShapeSelectionService;

  beforeEach(async () => {
    selectedShapesSignal = signal<ShapeProperties[]>([]);
    const drawingDefaultsSignal = signal({
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 2,
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal' as const,
      textAnchor: 'start' as const
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
      updateFillOpacity: vi.fn(),
      updateStrokeOpacity: vi.fn(),
      updateStrokeDasharray: vi.fn(),
      updateStrokeDashoffset: vi.fn(),
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
      imports: [StrokePanelComponent],
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
    fixture = TestBed.createComponent(StrokePanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows empty hint when nothing is selected', () => {
    expect(fixture.nativeElement.textContent).toContain('Select a shape to edit stroke');
    expect(fixture.nativeElement.querySelector('[data-testid="stroke-paint-swatch"]')).toBeNull();
  });

  it('shows stroke width and opacity when a shape is selected', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', stroke: '#000000', strokeWidth: 2, strokeOpacity: 0.7 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="stroke-paint-swatch"]')).toBeNull();
    expect(el.querySelector('#stroke-width')).toBeTruthy();
    expect(el.querySelector('[data-testid="stroke-opacity"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Stroke color');
    expect(el.textContent).toContain('Stroke width');
    expect(el.textContent).toContain('Stroke opacity');
  });

  it('uses outline-oriented labels for text-only selection', () => {
    selectedShapesSignal.set([
      { id: 'text-1', type: 'text', textContent: 'Hi', stroke: '#000', strokeWidth: 1 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Outline width');
    expect(el.textContent).toContain('Outline opacity');
    expect(el.querySelector('[data-testid="stroke-text-outline-paint-hint"]')).toBeTruthy();
  });

  it('keeps stroke-oriented labels when selection mixes text with other shapes', () => {
    selectedShapesSignal.set([
      { id: 'text-1', type: 'text', textContent: 'Hi' },
      { id: 'r1', type: 'rect', stroke: '#000', strokeWidth: 1 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Stroke width');
    expect(el.textContent).toContain('Stroke opacity');
  });

  it('updates stroke opacity through chrome apply', () => {
    selectedShapesSignal.set([{ id: 'shape-1', type: 'rect', strokeOpacity: 1 }]);
    fixture.detectChanges();
    component.paint.onStrokeOpacityChange({ target: { value: '0.25' } } as unknown as Event);
    expect(svgManipulationService.updateStrokeOpacity).toHaveBeenCalledWith('shape-1', 0.25);
    expect(shapeSelectionService.patchAllSelected).toHaveBeenCalledWith({ strokeOpacity: 0.25 });
  });

  it('shows Mixed for stroke opacity when selection disagrees', () => {
    selectedShapesSignal.set([
      { id: 'a', type: 'rect', strokeOpacity: 0.1 },
      { id: 'b', type: 'rect', strokeOpacity: 1 }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#stroke-opacity')?.classList.contains('mixed-control')).toBe(true);
  });

  it('updates stroke width through chrome apply', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', stroke: '#000000', strokeWidth: 2 }
    ]);
    fixture.detectChanges();
    component.paint.onStrokeWidthChange({ target: { value: '4' } } as unknown as Event);
    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', 4);
  });

  it('shows dash controls when a visible stroke is present', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', stroke: '#000000', strokeWidth: 2, strokeDasharray: '8,4' }
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#dash-pattern')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#dash-offset')).toBeTruthy();
  });
});
