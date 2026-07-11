import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import { DragGesture } from '../components/svg-canvas/gestures/drag-gesture';
import { ResizeGesture } from '../components/svg-canvas/gestures/resize-gesture';
import { RotateGesture } from '../components/svg-canvas/gestures/rotate-gesture';
import { SelectionMarqueeGesture } from '../components/svg-canvas/gestures/selection-marquee-gesture';
import { SkewGesture } from '../components/svg-canvas/gestures/skew-gesture';
import { ZoomMarqueeGesture } from '../components/svg-canvas/gestures/zoom-marquee-gesture';
import { ToolRegistryService } from './tool-registry.service';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import type { SelectorKeyboardActionsPort } from '../components/svg-canvas/selector-canvas-tool-keyboard';

const emptyRt = {
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  transformDoc: {} as GestureRuntimeContext['transformDoc'],
  snap: {} as GestureRuntimeContext['snap']
};

function makeSelectorDeps() {
  return {
    getGestures: () => ({
      selectionMarquee: new SelectionMarqueeGesture(),
      resize: new ResizeGesture(),
      skew: new SkewGesture(),
      rotate: new RotateGesture(),
      drag: new DragGesture()
    }),
    getRuntime: () => emptyRt,
    isCanvasReady: () => true,
    hasPathNodeEditState: () => false,
    tryStartPathNodeDrag: () => false,
    isEditorContentShapeTarget: () => false,
    clientToEditorSvgPoint: () => ({ x: 0, y: 0 }),
    isShapeSelected: () => false,
    getNearestGroupAncestorId: () => null,
    getSelectedShapeIds: () => [],
    getExpandedDragShapeIds: () => [],
    isSelectionMarquee: () => false,
    isResizingSelection: () => false,
    isSkewingSelection: () => false,
    isRotatingSelection: () => false,
    isDraggingShape: () => false,
    getSvgInstance: () => null,
    isGroupAClipMaskCarrier: () => false,
    getShapeProperties: () => ({}) as never,
    getSelectorSelectionForShape: () => [],
    selectShapes: vi.fn(),
    toggleShapeGroupInSelection: vi.fn(),
    clearSelection: vi.fn(),
    clearHighlight: vi.fn(),
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    consumeSelectionMarqueeJustEnded: () => false,
    shouldSkipEmptyHitSelectionClear: () => false,
    enterInlineTextEditMode: vi.fn(),
    getKeyboardActions: () =>
      ({
        getSvgContent: () => 'svg',
        svgManipulation: {} as SelectorKeyboardActionsPort['svgManipulation'],
        shapeSelection: {} as SelectorKeyboardActionsPort['shapeSelection'],
        editorHistory: {} as SelectorKeyboardActionsPort['editorHistory'],
        selectAllShapesFromDocument: vi.fn(),
        copySelectionToClipboard: vi.fn(() => false),
        cutSelectionToClipboard: vi.fn(() => false),
        pasteFromClipboard: vi.fn(() => false),
        duplicateSelection: vi.fn(() => false),
        groupSelectedShapes: vi.fn(),
        ungroupSelectedShape: vi.fn(),
        handleAlignmentShortcut: vi.fn(() => false)
      }) satisfies SelectorKeyboardActionsPort
  };
}

describe('CanvasBoundToolRegistrar', () => {
  let registry: ToolRegistryService;
  let registrar: CanvasBoundToolRegistrar;
  let creation: CreationGesture;

  beforeEach(() => {
    registry = new ToolRegistryService();
    registrar = new CanvasBoundToolRegistrar(registry);
    creation = new CreationGesture();
  });

  it('registers creation tools once when bound', () => {
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(registry.has('rect')).toBe(true);
    expect(registry.has('ellipse')).toBe(true);
    expect(registry.has('line')).toBe(true);

    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(registry.get('rect')).toBeDefined();
  });

  it('attach can re-target a different registry instance', () => {
    const otherRegistry = new ToolRegistryService();
    registrar.attach(otherRegistry);
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    expect(otherRegistry.has('rect')).toBe(true);
    expect(registry.has('rect')).toBe(false);
  });

  it('creation adapter onPointerMove delegates to CreationGesture.move', () => {
    vi.spyOn(creation, 'move');
    registrar.registerCreationTools(creation, () => emptyRt, () => true);
    const tool = registry.get('rect');
    tool?.onPointerMove?.({ clientX: 4, clientY: 5, shiftKey: true } as MouseEvent, { x: 0, y: 0 });
    expect(creation.move).toHaveBeenCalledWith(emptyRt, 4, 5, true);
  });

  it('registers pen tool once when bound', () => {
    registrar.registerPenTool(() => ({
      getPenTool: () => ({}) as never,
      getSnappedPenPoint: (x, y) => ({ x, y }),
      hasPathNodeEditState: () => false,
      tryStartPathNodeDrag: () => false,
      isCanvasReady: () => true,
      scheduleInsertHoverCursorHitTest: vi.fn()
    }));
    expect(registry.has('pen')).toBe(true);

    registrar.registerPenTool(() => ({
      getPenTool: () => ({}) as never,
      getSnappedPenPoint: (x, y) => ({ x, y }),
      hasPathNodeEditState: () => false,
      tryStartPathNodeDrag: () => false,
      isCanvasReady: () => true,
      scheduleInsertHoverCursorHitTest: vi.fn()
    }));
    expect(registry.get('pen')).toBeDefined();
  });

  it('registers selector tools once when bound', () => {
    registrar.registerSelectorTools(makeSelectorDeps);
    expect(registry.has('selector')).toBe(true);
    expect(registry.has('node-edit-selector')).toBe(true);

    registrar.registerSelectorTools(makeSelectorDeps);
    expect(registry.get('selector')).toBeDefined();
  });

  it('registers view utility tools once when bound', () => {
    registrar.registerViewUtilityTools({
      getZoomDeps: () => ({
        getZoomMarquee: () => new ZoomMarqueeGesture(),
        isZoomMarquee: () => false,
        commitZoomMarquee: vi.fn(),
        isCanvasReady: () => true,
        consumeZoomMarqueeJustEnded: () => false,
        screenToSvg: () => null,
        zoomInAt: vi.fn(),
        zoomOutAt: vi.fn(),
        refreshViewAfterZoomClick: vi.fn()
      }),
      getPanDeps: () => ({
        beginPanSession: vi.fn(),
        isPanning: () => false,
        applyPanDragFromEvent: vi.fn(),
        clearPanningFlag: vi.fn()
      }),
      getTextDeps: () => ({
        isCanvasReady: () => true,
        updateTextToolPreviewFromClient: vi.fn(),
        createTextAtPoint: vi.fn().mockReturnValue(undefined),
        tryEnterTextEditAfterCreate: vi.fn(),
        destroyTextToolPreview: vi.fn()
      }),
      getEyedropperDeps: () => ({
        isCanvasReady: () => true,
        sampleAt: vi.fn()
      })
    });
    expect(registry.has('zoom')).toBe(true);
    expect(registry.has('pan')).toBe(true);
    expect(registry.has('text')).toBe(true);
    expect(registry.has('eyedropper')).toBe(true);
  });
});
