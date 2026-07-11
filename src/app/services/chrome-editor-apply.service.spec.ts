import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { vi } from 'vitest';
import { ChromeEditorApplyService } from './chrome-editor-apply.service';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  EDITOR_SHAPE_LIFECYCLE_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from './chrome-apply/chrome-apply.tokens';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { SelectionTransformReadoutService } from './selection-transform-readout.service';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../models/drawing-style-defaults';
import { ShapeProperties } from '../models/shape-properties.interface';

describe('ChromeEditorApplyService', () => {
  let service: ChromeEditorApplyService;
  const selectedShapesSignal = signal<ShapeProperties[]>([]);
  const drawingDefaultsSignal = signal<DrawingStyleDefaults>({ ...BASE_DRAWING_STYLE_DEFAULTS });

  beforeEach(async () => {
    const shapeSelectionMock = {
      getSelectedShapes: () => selectedShapesSignal(),
      patchAllSelected: vi.fn((u: Partial<ShapeProperties>) => {
        selectedShapesSignal.update((arr) => arr.map((s) => ({ ...s, ...u })));
      }),
      selectShapes: vi.fn((next: ShapeProperties[]) => selectedShapesSignal.set(next)),
      selectShape: vi.fn((shape: ShapeProperties) => selectedShapesSignal.set([shape])),
      clearSelection: vi.fn(() => selectedShapesSignal.set([]))
    };

    const svgMock = {
      getSVGInstance: vi.fn(),
      getShapeProperties: vi.fn(),
      getUnionBBox: vi.fn().mockReturnValue(null),
      findOne: vi.fn(),
      addStroke: vi.fn(),
      removeStroke: vi.fn(),
      updateStrokeDasharray: vi.fn(),
      updateStrokeDashoffset: vi.fn(),
      moveElementForward: vi.fn(),
      moveElementBackward: vi.fn(),
      moveElementToFront: vi.fn(),
      moveElementToBack: vi.fn(),
      toggleLayerVisibility: vi.fn(),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
      isElementDirectLocked: vi.fn().mockReturnValue(false),
      setLayerLocked: vi.fn(),
      moveElementBeforeNextSibling: vi.fn().mockReturnValue(true),
      groupSelectedElements: vi.fn(),
      ungroupElement: vi.fn(),
      ungroupElements: vi.fn(),
      updateTextFontFamily: vi.fn(),
      updateTextFontSize: vi.fn(),
      updateTextFontWeight: vi.fn(),
      updateTextFontStyle: vi.fn(),
      updateTextAnchor: vi.fn(),
      updateTextPaintOrder: vi.fn(),
      updateTextVectorEffect: vi.fn(),
      bakeEffectiveFillToLocal: vi.fn(),
      restoreBakedFillPresentation: vi.fn(),
      bakeEffectiveStrokeToLocal: vi.fn(),
      restoreBakedStrokePresentation: vi.fn(),
      applyPaintGradientSnapshot: vi.fn(),
      allocateUniqueDefId: vi.fn(),
      capturePaintGradientSnapshot: vi.fn(),
      alignShapes: vi.fn(),
      distributeShapes: vi.fn(),
      translateShape: vi.fn(),
      applyUnionScaleFromSnapshot: vi.fn(),
      restoreVectorEffectsForShapeSubtrees: vi.fn(),
      applyUnionRotationFromSnapshot: vi.fn(),
      snapshotSelectionTransforms: vi.fn(),
      snapshotVectorEffectsForShapes: vi.fn(),
      getSelectionRotationPivot: vi.fn(),
      getNearestGroupAncestorId: vi.fn(() => null),
      clearHighlight: vi.fn()
    };

    const drawingDefaultsMock = {
      defaults: computed(() => drawingDefaultsSignal()),
      strokeWidth: computed(() => drawingDefaultsSignal().strokeWidth),
      setDefaults: vi.fn((next: DrawingStyleDefaults) => {
          drawingDefaultsSignal.set(next);
        })
    };

    const historyMock = {
      pushAndExecute: vi.fn((cmd: { execute(): void }) => cmd.execute())
    };

    const editorToolMock = {
      currentTool: () => 'selector' as const
    };

    const transformReadoutMock = {
      selectionBBoxFieldModel: () => null
    };

    await TestBed.configureTestingModule({
      providers: [
        ChromeEditorApplyService,
        { provide: ShapeSelectionService, useValue: shapeSelectionMock },
        { provide: SvgManipulationService, useValue: svgMock },
        { provide: CHROME_EDITOR_APPLY_SVG_PORT, useValue: svgMock },
        { provide: PROPERTIES_PANEL_SVG_PORT, useValue: svgMock },
        { provide: LAYER_REORDER_GROUP_SVG_PORT, useValue: svgMock },
        { provide: SELECTION_TRANSFORM_APPLY_SVG_PORT, useValue: svgMock },
        { provide: EDITOR_SHAPE_LIFECYCLE_SVG_PORT, useValue: svgMock },
        { provide: DrawingStyleDefaultsService, useValue: drawingDefaultsMock },
        { provide: EditorHistoryService, useValue: historyMock },
        { provide: EditorToolService, useValue: editorToolMock },
        { provide: SelectionTransformReadoutService, useValue: transformReadoutMock }
      ]
    }).compileComponents();

    service = TestBed.inject(ChromeEditorApplyService);
    selectedShapesSignal.set([]);
    vi.clearAllMocks();
  });

  it('applyStrokeWidth pushes history and updates selection when DOM sync returns new props', () => {
    selectedShapesSignal.set([
      { id: 's1', type: 'rect', fill: '#000', stroke: '#111', strokeWidth: 1 }
    ]);
    const svg = {
      findOne: vi.fn(() => ({ node: {} }))
    };
    const manip = TestBed.inject(SvgManipulationService) as unknown as {
      addStroke: ReturnType<typeof vi.fn>;
      getSVGInstance: ReturnType<typeof vi.fn>;
      getShapeProperties: ReturnType<typeof vi.fn>;
    };
    manip.getSVGInstance.mockReturnValue(svg as never);
    manip.getShapeProperties.mockReturnValue({
      id: 's1',
      type: 'rect',
      fill: '#000',
      stroke: '#111',
      strokeWidth: 4
    });

    service.applyStrokeWidth(4);

    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    expect(history.pushAndExecute).toHaveBeenCalled();
    expect(manip.addStroke).toHaveBeenCalledWith('s1', '#111', 4);
    expect(selectedShapesSignal()[0].strokeWidth).toBe(4);
  });

  it('applyStrokeWidth does nothing when width is not finite', () => {
    selectedShapesSignal.set([{ id: 's1', type: 'rect', fill: '#000', stroke: '#111', strokeWidth: 1 }]);
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    service.applyStrokeWidth(Number.NaN);
    expect(history.pushAndExecute).not.toHaveBeenCalled();
  });

  it('applyOpacity does nothing when opacity is not finite', () => {
    selectedShapesSignal.set([{ id: 's1', type: 'rect', fill: '#000', stroke: '#111', strokeWidth: 1 }]);
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    service.applyOpacity(Number.NaN);
    expect(history.pushAndExecute).not.toHaveBeenCalled();
  });

  it('applyStrokeDashoffset does nothing when offset is not finite', () => {
    selectedShapesSignal.set([{ id: 's1', type: 'rect', fill: '#000', stroke: '#111', strokeWidth: 1 }]);
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    service.applyStrokeDashoffset(Number.POSITIVE_INFINITY);
    expect(history.pushAndExecute).not.toHaveBeenCalled();
  });

  it('syncSelectedShapesFromDom returns early when there is no SVG instance', () => {
    selectedShapesSignal.set([{ id: 's1', type: 'rect', fill: '#000', stroke: '#111', strokeWidth: 1 }]);
    const shapeSelection = TestBed.inject(ShapeSelectionService) as unknown as {
      selectShapes: ReturnType<typeof vi.fn>;
    };
    const manip = TestBed.inject(SvgManipulationService) as unknown as {
      getSVGInstance: ReturnType<typeof vi.fn>;
    };
    manip.getSVGInstance.mockReturnValue(null);
    service.syncSelectedShapesFromDom();
    expect(shapeSelection.selectShapes).not.toHaveBeenCalled();
  });

  it('applyFillColor still updates drawing defaults when nothing is selected', () => {
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    service.applyFillColor('#ff00ff');
    expect(history.pushAndExecute).toHaveBeenCalled();
  });

  it('applyAlignFromChrome does not push when fewer than two shape ids', () => {
    const history = TestBed.inject(EditorHistoryService) as unknown as {
      pushAndExecute: ReturnType<typeof vi.fn>;
    };
    service.applyAlignFromChrome('left', ['only-one']);
    expect(history.pushAndExecute).not.toHaveBeenCalled();
  });

  it('clearInspectorSelection clears selection and editor highlight', () => {
    const shapeSelection = TestBed.inject(ShapeSelectionService) as unknown as {
      clearSelection: ReturnType<typeof vi.fn>;
    };
    const manip = TestBed.inject(SvgManipulationService) as unknown as {
      clearHighlight: ReturnType<typeof vi.fn>;
    };
    service.clearInspectorSelection();
    expect(shapeSelection.clearSelection).toHaveBeenCalled();
    expect(manip.clearHighlight).toHaveBeenCalled();
  });

  it('getNearestGroupAncestorId delegates to manipulation façade', () => {
    const manip = TestBed.inject(SvgManipulationService) as unknown as {
      getNearestGroupAncestorId: ReturnType<typeof vi.fn>;
    };
    vi.mocked(manip.getNearestGroupAncestorId).mockReturnValue('g1');
    expect(service.getNearestGroupAncestorId('s1')).toBe('g1');
    expect(manip.getNearestGroupAncestorId).toHaveBeenCalledWith('s1');
  });
});
