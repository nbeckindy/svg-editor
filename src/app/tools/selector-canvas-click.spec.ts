import { describe, it, expect, vi } from 'vitest';
import { PathNodeEditSession } from '../components/svg-canvas/path-node-edit-session/path-node-edit-session';
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

describe('PathNodeEditSession.maybeExitOnOutsideClick', () => {
  function makePathNodeSession(
    getCurrentTool: () => import('../../services/editor-tool.service').EditorTool = () => 'node-edit-selector'
  ): PathNodeEditSession {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.id = 'path1';
    path.setAttribute('d', 'M 10 10 L 20 20');
    const ports = {
      markForCheck: vi.fn(),
      setDrilledIntoGroupId: vi.fn(),
      getCurrentTool,
      syncPathNodeEditBridgeChrome: vi.fn(),
      clientToEditorSvgPoint: () => ({ x: 0, y: 0 }),
      svgBboxToOverlayPixels: (bbox: { x: number; y: number; width: number; height: number }) => bbox,
      svgManipulation: {
        getSVGInstance: () =>
          ({
            findOne: (sel: string) => (sel === '#path1' ? { node: path } : null)
          }) as never,
        isElementOrAncestorLocked: () => false,
        getPathNodeHandleLinkRaw: () => null,
        setPathNodeHandleLinkRaw: vi.fn(),
        mapPathLocalToRootUser: () => ({ x: 0, y: 0 }),
        mapRootUserToPathLocal: () => ({ x: 0, y: 0 }),
        updatePathData: vi.fn(),
        getShapeBBox: () => null,
        getShapeProperties: () => ({ id: 'path1' }) as never
      },
      shapeSelection: { selectShape: vi.fn() },
      editorHistory: { pushAndExecute: vi.fn() },
      pathNodeEditBridge: {
        setChrome: vi.fn()
      }
    };
    const session = new PathNodeEditSession(ports as never);
    session.enterPathNodeEditMode(['path1']);
    return session;
  }

  it('exits path-node edit when clicking outside edit targets', () => {
    const session = makePathNodeSession();
    const other = document.createElement('rect');
    other.id = 'other';

    const exited = session.maybeExitOnOutsideClick({
      clickTarget: other,
      penClosePostNodeEditEmptyClickClearUntilMs: 0,
      hasResolvedContentShape: true
    });

    expect(exited).toBe(true);
    expect(session.hasPathNodeEditState()).toBe(false);
  });

  it('does not exit while pen tool is active', () => {
    const session = makePathNodeSession(() => 'pen');
    const other = document.createElement('rect');

    const exited = session.maybeExitOnOutsideClick({
      clickTarget: other,
      penClosePostNodeEditEmptyClickClearUntilMs: 0,
      hasResolvedContentShape: false
    });

    expect(exited).toBe(false);
    expect(session.hasPathNodeEditState()).toBe(true);
  });

  it('skips exit for trailing pen-close empty click', () => {
    const session = makePathNodeSession();
    const futureMs = Date.now() + 5000;

    const exited = session.maybeExitOnOutsideClick({
      clickTarget: document.createElement('div'),
      penClosePostNodeEditEmptyClickClearUntilMs: futureMs,
      hasResolvedContentShape: false
    });

    expect(exited).toBe(false);
    expect(session.hasPathNodeEditState()).toBe(true);
  });
});
