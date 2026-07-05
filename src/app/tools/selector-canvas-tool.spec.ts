import { describe, it, expect, vi } from 'vitest';
import { DragGesture } from '../components/svg-canvas/gestures/drag-gesture';
import { ResizeGesture } from '../components/svg-canvas/gestures/resize-gesture';
import { RotateGesture } from '../components/svg-canvas/gestures/rotate-gesture';
import { SelectionMarqueeGesture } from '../components/svg-canvas/gestures/selection-marquee-gesture';
import { SkewGesture } from '../components/svg-canvas/gestures/skew-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import type { SelectorKeyboardActionsPort } from '../components/svg-canvas/selector-canvas-tool-keyboard';
import {
  createSelectorCanvasTool,
  registerSelectorCanvasTools,
  type SelectorCanvasToolDeps
} from './selector-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';

const emptyRt = {
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  transformDoc: {} as GestureRuntimeContext['transformDoc'],
  snap: {} as GestureRuntimeContext['snap']
};

function makeSelectorDeps(over: Partial<SelectorCanvasToolDeps> = {}): () => SelectorCanvasToolDeps {
  const selectionMarquee = new SelectionMarqueeGesture();
  const resize = new ResizeGesture();
  const skew = new SkewGesture();
  const rotate = new RotateGesture();
  const drag = new DragGesture();

  return () => ({
    getGestures: () => ({ selectionMarquee, resize, skew, rotate, drag }),
    getRuntime: () => emptyRt,
    isCanvasReady: () => true,
    hasPathNodeEditState: () => false,
    tryStartPathNodeDrag: () => false,
    isEditorContentShapeTarget: () => false,
    clientToEditorSvgPoint: () => ({ x: 0, y: 0 }),
    isShapeSelected: () => true,
    getNearestGroupAncestorId: () => null,
    getSelectedShapeIds: () => ['a'],
    getExpandedDragShapeIds: () => ['a'],
    isSelectionMarquee: () => false,
    isResizingSelection: () => false,
    isSkewingSelection: () => false,
    isRotatingSelection: () => false,
    isDraggingShape: () => false,
    getSvgInstance: () => null,
    getShapeProperties: () => ({ id: 'a', type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }),
    getSelectorSelectionForShape: () => [],
    selectShapes: vi.fn(),
    toggleShapeGroupInSelection: vi.fn(),
    clearSelection: vi.fn(),
    clearHighlight: vi.fn(),
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    isGroupAClipMaskCarrier: () => false,
    consumeSelectionMarqueeJustEnded: () => false,
    shouldSkipEmptyHitSelectionClear: () => false,
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
      }) satisfies SelectorKeyboardActionsPort,
    ...over
  });
}

describe('createSelectorCanvasTool', () => {
  it('starts selection marquee on background mousedown', () => {
    const deps = makeSelectorDeps();
    const tool = createSelectorCanvasTool('selector', deps);
    vi.spyOn(deps().getGestures().selectionMarquee, 'startAt');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const consumed = tool.onPointerDown?.(
      { button: 0, clientX: 2, clientY: 3, target: bg } as unknown as MouseEvent,
      { x: 0, y: 0 }
    );

    expect(consumed).toBe(true);
    expect(deps().getGestures().selectionMarquee.startAt).toHaveBeenCalledWith(2, 3);
  });

  it('routes active marquee move through onPointerMove', () => {
    const deps = makeSelectorDeps({ isSelectionMarquee: () => true });
    const tool = createSelectorCanvasTool('selector', deps);
    vi.spyOn(deps().getGestures().selectionMarquee, 'move');

    const consumed = tool.onPointerMove?.({ clientX: 4, clientY: 5, shiftKey: false } as MouseEvent, {
      x: 0,
      y: 0
    });

    expect(consumed).toBe(true);
    expect(deps().getGestures().selectionMarquee.move).toHaveBeenCalledWith(4, 5, emptyRt);
  });

  it('registers selector and node-edit-selector in ToolRegistryService', () => {
    const registry = new ToolRegistryService();
    registerSelectorCanvasTools(registry, makeSelectorDeps());
    expect(registry.has('selector')).toBe(true);
    expect(registry.has('node-edit-selector')).toBe(true);
  });

  it('clears selection on empty hit via onClick', () => {
    const clearSelection = vi.fn();
    const deps = makeSelectorDeps({ clearSelection });
    const tool = createSelectorCanvasTool('selector', deps);

    const consumed = tool.onClick?.(
      { target: document.createElement('svg') } as unknown as MouseEvent,
      { x: 0, y: 0 }
    );

    expect(consumed).toBe(true);
    expect(clearSelection).toHaveBeenCalled();
  });
});
