import { describe, it, expect, vi } from 'vitest';
import { handleSelectorCanvasClick, type SelectorCanvasClickDeps } from './selector-canvas-click';
import { registerSelectorCanvasTools } from './selector-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';

function makeClickDeps(over: Partial<SelectorCanvasClickDeps> = {}): SelectorCanvasClickDeps {
  return {
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    isGroupAClipMaskCarrier: () => false,
    getPenClosePostNodeEditEmptyClickClearUntilMs: () => 0,
    getNearestGroupAncestorId: () => null,
    getSvgInstance: () => null,
    resolveClickedContentShape: () => null,
    getShapeProperties: (el) => ({ id: el.id }) as never,
    getShapePropertiesInSameClipGroup: (el) => [{ id: el.id }] as never,
    toggleShapeGroupInSelection: vi.fn(),
    selectShapes: vi.fn(),
    clearSelection: vi.fn(),
    clearHighlight: vi.fn(),
    consumeSelectionMarqueeJustEnded: () => false,
    ...over
  };
}

describe('handleSelectorCanvasClick', () => {
  it('selects shape on content click', () => {
    const selectShapes = vi.fn();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'rect1';
    const deps = makeClickDeps({
      resolveClickedContentShape: () => rect,
      getShapePropertiesInSameClipGroup: () => [{ id: 'rect1' }] as never,
      selectShapes
    });

    handleSelectorCanvasClick(deps, {
      target: rect,
      shiftKey: false,
      ctrlKey: false,
      metaKey: false
    } as MouseEvent);

    expect(selectShapes).toHaveBeenCalledWith([{ id: 'rect1' }]);
  });

  it('toggles selection on shift-click', () => {
    const toggleShapeGroupInSelection = vi.fn();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'rect1';
    const deps = makeClickDeps({
      resolveClickedContentShape: () => rect,
      getShapePropertiesInSameClipGroup: () => [{ id: 'rect1' }] as never,
      toggleShapeGroupInSelection
    });

    handleSelectorCanvasClick(deps, {
      target: rect,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false
    } as MouseEvent);

    expect(toggleShapeGroupInSelection).toHaveBeenCalledWith([{ id: 'rect1' }]);
  });

  it('clears selection on empty canvas click', () => {
    const clearSelection = vi.fn();
    const clearHighlight = vi.fn();
    const setDrilledIntoGroupId = vi.fn();
    const deps = makeClickDeps({
      clearSelection,
      clearHighlight,
      setDrilledIntoGroupId
    });

    handleSelectorCanvasClick(deps, { target: document.createElement('div') } as unknown as MouseEvent);

    expect(clearSelection).toHaveBeenCalled();
    expect(clearHighlight).toHaveBeenCalled();
    expect(setDrilledIntoGroupId).toHaveBeenCalledWith(null);
  });
});

describe('registry-routed selector onClick', () => {
  it('routes click through ToolRegistryService to selection handlers', () => {
    const selectShapes = vi.fn();
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.id = 'rect1';

    const registry = new ToolRegistryService();
    const getDeps = () =>
      ({
        getGestures: () => ({
          selectionMarquee: {},
          resize: {},
          skew: {},
          rotate: {},
          drag: {}
        }),
        getRuntime: () => ({
          pointer: {},
          doc: {},
          transformDoc: {},
          snap: {}
        }),
        isCanvasReady: () => true,
        hasPathNodeEditState: () => false,
        tryStartPathNodeDrag: () => false,
        isEditorContentShapeTarget: () => false,
        clientToEditorSvgPoint: () => ({ x: 0, y: 0 }),
        isShapeSelected: () => false,
        getNearestGroupAncestorId: () => null,
        getSelectedShapeIds: () => [],
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
        resolveClickedContentShape: () => rect,
        getShapeProperties: (el: SVGElement) => ({ id: el.id }) as never,
        getShapePropertiesInSameClipGroup: () => [{ id: 'rect1' }] as never,
        toggleShapeGroupInSelection: vi.fn(),
        selectShapes,
        clearSelection: vi.fn(),
        clearHighlight: vi.fn(),
        consumeSelectionMarqueeJustEnded: () => false,
        getKeyboardActions: () =>
          ({
            getSvgContent: () => 'svg',
            svgManipulation: {},
            shapeSelection: {},
            editorHistory: {},
            selectAllShapesFromDocument: vi.fn(),
            copySelectionToClipboard: vi.fn(() => false),
            cutSelectionToClipboard: vi.fn(() => false),
            pasteFromClipboard: vi.fn(() => false),
            duplicateSelection: vi.fn(() => false),
            groupSelectedShapes: vi.fn(),
            ungroupSelectedShape: vi.fn(),
            handleAlignmentShortcut: vi.fn(() => false)
          }) as never
      }) as never;

    registerSelectorCanvasTools(registry, getDeps);
    const tool = registry.get('selector');
    expect(tool).toBeTruthy();

    const consumed = tool!.onClick?.(
      { target: rect, shiftKey: false, ctrlKey: false, metaKey: false } as MouseEvent,
      { x: 0, y: 0 }
    );

    expect(consumed).toBe(true);
    expect(selectShapes).toHaveBeenCalledWith([{ id: 'rect1' }]);
  });
});
