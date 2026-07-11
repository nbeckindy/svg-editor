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
    isSelectionMarquee: () => false,
    isResizingSelection: () => false,
    isSkewingSelection: () => false,
    isRotatingSelection: () => false,
    isDraggingShape: () => false,
    getSvgInstance: () => null,
    enterInlineTextEditMode: vi.fn(),
    tryDeleteSelectedPathNode: () => false,
    getPathNodeDragSession: () => null,
    updatePathNodeDrag: vi.fn(),
    finishPathNodeDrag: vi.fn(),
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    isGroupAClipMaskCarrier: () => false,
    getPenClosePostNodeEditEmptyClickClearUntilMs: () => 0,
    resolveClickedContentShape: () => null,
    getShapeProperties: (el) => ({ id: el.id }) as never,
    getShapePropertiesInSameClipGroup: (el) => [{ id: el.id }] as never,
    toggleShapeGroupInSelection: vi.fn(),
    selectShapes: vi.fn(),
    clearSelection: vi.fn(),
    clearHighlight: vi.fn(),
    consumeSelectionMarqueeJustEnded: () => false,
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

  it('routes active path node drag through onPointerMove', () => {
    const updatePathNodeDrag = vi.fn();
    const deps = makeSelectorDeps({
      getPathNodeDragSession: () => ({}),
      updatePathNodeDrag
    });
    const tool = createSelectorCanvasTool('node-edit-selector', deps);

    const consumed = tool.onPointerMove?.({ clientX: 7, clientY: 8 } as MouseEvent, { x: 0, y: 0 });

    expect(consumed).toBe(true);
    expect(updatePathNodeDrag).toHaveBeenCalledWith(7, 8);
  });

  it('finishes path node drag through onPointerUp', () => {
    const finishPathNodeDrag = vi.fn();
    const deps = makeSelectorDeps({
      getPathNodeDragSession: () => ({}),
      finishPathNodeDrag
    });
    const tool = createSelectorCanvasTool('node-edit-selector', deps);

    const consumed = tool.onPointerUp?.({ clientX: 1, clientY: 2, shiftKey: false } as MouseEvent, {
      x: 0,
      y: 0
    });

    expect(consumed).toBe(true);
    expect(finishPathNodeDrag).toHaveBeenCalled();
  });

  describe('onClick', () => {
    it('selects shape on content click', () => {
      const selectShapes = vi.fn();
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.id = 'rect1';
      const deps = makeSelectorDeps({
        resolveClickedContentShape: () => rect as never,
        getShapePropertiesInSameClipGroup: () => [{ id: 'rect1' }] as never,
        selectShapes
      });
      const tool = createSelectorCanvasTool('selector', deps);

      tool.onClick?.(
        { target: rect, shiftKey: false, ctrlKey: false, metaKey: false } as unknown as MouseEvent,
        {
          x: 0,
          y: 0
        }
      );

      expect(selectShapes).toHaveBeenCalledWith([{ id: 'rect1' }]);
    });

    it('selects group when clicking child before drill-in', () => {
      const selectShapes = vi.fn();
      const setDrilledIntoGroupId = vi.fn();
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.id = 'child1';
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = 'group1';
      const deps = makeSelectorDeps({
        resolveClickedContentShape: () => rect as never,
        getNearestGroupAncestorId: () => 'group1',
        getDrilledIntoGroupId: () => null,
        setDrilledIntoGroupId,
        getShapeProperties: () => ({ id: 'group1' }) as never,
        getSvgInstance: () => ({ findOne: () => ({ node: group }) }) as never,
        selectShapes
      });
      const tool = createSelectorCanvasTool('selector', deps);

      tool.onClick?.(
        { target: rect, shiftKey: false, ctrlKey: false, metaKey: false } as unknown as MouseEvent,
        {
          x: 0,
          y: 0
        }
      );

      expect(selectShapes).toHaveBeenCalledWith([{ id: 'group1' }]);
      expect(setDrilledIntoGroupId).toHaveBeenCalledWith(null);
    });

    it('clears selection on empty canvas click', () => {
      const clearSelection = vi.fn();
      const clearHighlight = vi.fn();
      const setDrilledIntoGroupId = vi.fn();
      const deps = makeSelectorDeps({
        resolveClickedContentShape: () => null,
        clearSelection,
        clearHighlight,
        setDrilledIntoGroupId
      });
      const tool = createSelectorCanvasTool('selector', deps);

      tool.onClick?.({ target: document.createElement('div') } as unknown as MouseEvent, { x: 0, y: 0 });

      expect(clearSelection).toHaveBeenCalled();
      expect(clearHighlight).toHaveBeenCalled();
      expect(setDrilledIntoGroupId).toHaveBeenCalledWith(null);
    });

    it('skips clear when marquee just ended', () => {
      const clearSelection = vi.fn();
      const deps = makeSelectorDeps({
        consumeSelectionMarqueeJustEnded: () => true,
        clearSelection
      });
      const tool = createSelectorCanvasTool('selector', deps);

      tool.onClick?.({ target: document.createElement('div') } as unknown as MouseEvent, { x: 0, y: 0 });

      expect(clearSelection).not.toHaveBeenCalled();
    });
  });

  describe('onDoubleClick', () => {
    function makeSvgInstanceFor(id: string, node: Element): any {
      return { findOne: (sel: string) => (sel === `#${id}` ? { node } : null) };
    }

    it('enters inline text edit mode when selected shape is <text>', () => {
      const enterInlineTextEditMode = vi.fn();
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.id = 'txt1';
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => ['txt1'],
        getSvgInstance: () => makeSvgInstanceFor('txt1', textEl),
        enterInlineTextEditMode
      });
      const tool = createSelectorCanvasTool('selector', deps);

      const consumed = tool.onDoubleClick?.({} as MouseEvent, { x: 0, y: 0 });

      expect(consumed).toBe(true);
      expect(enterInlineTextEditMode).toHaveBeenCalledWith('txt1');
    });

    it('returns false when no shapes are selected', () => {
      const enterInlineTextEditMode = vi.fn();
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => [],
        enterInlineTextEditMode
      });
      const tool = createSelectorCanvasTool('selector', deps);

      const consumed = tool.onDoubleClick?.({} as MouseEvent, { x: 0, y: 0 });

      expect(consumed).toBe(false);
      expect(enterInlineTextEditMode).not.toHaveBeenCalled();
    });

    it('returns false when selected shape is not text or tspan', () => {
      const enterInlineTextEditMode = vi.fn();
      const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectEl.id = 'rect1';
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => ['rect1'],
        getSvgInstance: () => makeSvgInstanceFor('rect1', rectEl),
        enterInlineTextEditMode
      });
      const tool = createSelectorCanvasTool('selector', deps);

      const consumed = tool.onDoubleClick?.({} as MouseEvent, { x: 0, y: 0 });

      expect(consumed).toBe(false);
      expect(enterInlineTextEditMode).not.toHaveBeenCalled();
    });

    it('resolves tspan to parent text element id', () => {
      const enterInlineTextEditMode = vi.fn();
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.id = 'txt1';
      const tspanEl = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspanEl.id = 'tspan1';
      textEl.appendChild(tspanEl);
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => ['tspan1'],
        getSvgInstance: () => makeSvgInstanceFor('tspan1', tspanEl),
        enterInlineTextEditMode
      });
      const tool = createSelectorCanvasTool('selector', deps);

      const consumed = tool.onDoubleClick?.({} as MouseEvent, { x: 0, y: 0 });

      expect(consumed).toBe(true);
      expect(enterInlineTextEditMode).toHaveBeenCalledWith('txt1');
    });

    it('drills into group on double-click and selects clicked child', () => {
      const setDrilledIntoGroupId = vi.fn();
      const selectShapes = vi.fn();
      const childRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      childRect.id = 'child1';
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = 'group1';
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => ['group1'],
        getSvgInstance: () =>
          ({
            findOne: (sel: string) => {
              if (sel === '#group1') return { node: group };
              if (sel === '#child1') return childRect;
              return null;
            }
          }) as never,
        setDrilledIntoGroupId,
        getShapePropertiesInSameClipGroup: () => [{ id: 'child1' }] as never,
        selectShapes
      });
      const tool = createSelectorCanvasTool('selector', deps);

      const consumed = tool.onDoubleClick?.(
        { target: childRect } as unknown as MouseEvent,
        { x: 0, y: 0 }
      );

      expect(consumed).toBe(true);
      expect(setDrilledIntoGroupId).toHaveBeenCalledWith('group1');
      expect(selectShapes).toHaveBeenCalledWith([{ id: 'child1' }]);
    });

    it('does not drill into group for node-edit-selector', () => {
      const setDrilledIntoGroupId = vi.fn();
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.id = 'group1';
      const deps = makeSelectorDeps({
        getSelectedShapeIds: () => ['group1'],
        getSvgInstance: () => makeSvgInstanceFor('group1', group),
        setDrilledIntoGroupId
      });
      const tool = createSelectorCanvasTool('node-edit-selector', deps);

      const consumed = tool.onDoubleClick?.({ target: group } as unknown as MouseEvent, { x: 0, y: 0 });

      expect(consumed).toBe(false);
      expect(setDrilledIntoGroupId).not.toHaveBeenCalled();
    });
  });
});
