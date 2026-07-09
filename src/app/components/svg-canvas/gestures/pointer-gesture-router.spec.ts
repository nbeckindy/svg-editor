import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PointerGestureRouter, type SvgCanvasPointerGestureHost } from './pointer-gesture-router';
import type { GestureRuntimeContext } from './gesture-context';
import { CreationGesture } from './creation-gesture';
import { SelectionMarqueeGesture } from './selection-marquee-gesture';
import { ZoomMarqueeGesture } from './zoom-marquee-gesture';
import { ResizeGesture } from './resize-gesture';
import { SkewGesture } from './skew-gesture';
import { RotateGesture } from './rotate-gesture';
import { DragGesture } from './drag-gesture';
import { ToolRegistryService } from '../../../tools/tool-registry.service';
import type { PenToolSession } from '../pen-tool-session/pen-tool-session';
import {
  patchRegisteredCanvasTool,
  registerAllCanvasToolsForTest,
  type CanvasToolsTestHostState
} from '../../../tools/register-all-canvas-tools-for-test';

function applyHostStateOverrides(
  hostState: CanvasToolsTestHostState,
  over: {
    isSelectionMarquee?: boolean;
    isZoomMarquee?: boolean;
    isResizingSelection?: boolean;
    isSkewingSelection?: boolean;
    isRotatingSelection?: boolean;
    isPanning?: boolean;
    isDraggingShape?: boolean;
    hasPathNodeEditState?: boolean;
    tryStartPathNodeDrag?: (target: Element, event: MouseEvent) => boolean;
    isEditorContentShapeTarget?: (target: Element) => boolean;
    isShapeSelected?: (id: string) => boolean;
    getNearestGroupAncestorId?: (id: string) => string | null;
    getSelectedShapeIds?: () => string[];
    beginPanSession?: (event: MouseEvent) => void;
    applyPanDragFromEvent?: (event: MouseEvent) => void;
    clearPanningFlag?: () => void;
    commitZoomMarquee?: () => void;
    updateTextToolPreviewFromClient?: (clientX: number, clientY: number) => void;
    isCanvasReady?: boolean;
  }
): void {
  if (over.isSelectionMarquee !== undefined) hostState.isSelectionMarquee = over.isSelectionMarquee;
  if (over.isZoomMarquee !== undefined) hostState.isZoomMarquee = over.isZoomMarquee;
  if (over.isResizingSelection !== undefined) hostState.isResizingSelection = over.isResizingSelection;
  if (over.isSkewingSelection !== undefined) hostState.isSkewingSelection = over.isSkewingSelection;
  if (over.isRotatingSelection !== undefined) hostState.isRotatingSelection = over.isRotatingSelection;
  if (over.isPanning !== undefined) hostState.isPanning = over.isPanning;
  if (over.isDraggingShape !== undefined) hostState.isDraggingShape = over.isDraggingShape;
  if (over.hasPathNodeEditState !== undefined) hostState.hasPathNodeEditState = over.hasPathNodeEditState;
  if (over.tryStartPathNodeDrag !== undefined) hostState.tryStartPathNodeDrag = over.tryStartPathNodeDrag;
  if (over.isEditorContentShapeTarget !== undefined) {
    hostState.isEditorContentShapeTarget = over.isEditorContentShapeTarget;
  }
  if (over.isShapeSelected !== undefined) hostState.isShapeSelected = over.isShapeSelected;
  if (over.getNearestGroupAncestorId !== undefined) {
    hostState.getNearestGroupAncestorId = over.getNearestGroupAncestorId;
  }
  if (over.getSelectedShapeIds !== undefined) hostState.getSelectedShapeIds = over.getSelectedShapeIds;
  if (over.beginPanSession !== undefined) hostState.beginPanSession = over.beginPanSession;
  if (over.applyPanDragFromEvent !== undefined) hostState.applyPanDragFromEvent = over.applyPanDragFromEvent;
  if (over.clearPanningFlag !== undefined) hostState.clearPanningFlag = over.clearPanningFlag;
  if (over.commitZoomMarquee !== undefined) hostState.commitZoomMarquee = over.commitZoomMarquee;
  if (over.updateTextToolPreviewFromClient !== undefined) {
    hostState.updateTextToolPreviewFromClient = over.updateTextToolPreviewFromClient;
  }
  if (over.isCanvasReady === false) hostState.isCanvasReady = false;
}

function makeHost(
  over: Partial<SvgCanvasPointerGestureHost> & {
    getPathNodeDragSession?: () => unknown | null;
    updatePathNodeDrag?: (clientX: number, clientY: number) => void;
    finishPathNodeDrag?: () => void;
  } = {},
  hostState?: CanvasToolsTestHostState
): SvgCanvasPointerGestureHost {
  if (hostState) applyHostStateOverrides(hostState, over as Parameters<typeof applyHostStateOverrides>[1]);
  const base: SvgCanvasPointerGestureHost = {
    getPathNodeDragSession: () => null,
    updatePathNodeDrag: vi.fn(),
    finishPathNodeDrag: vi.fn(),
    getCurrentTool: () => 'selector',
    clientToEditorSvgPoint: () => ({ x: 0, y: 0 })
  };
  return { ...base, ...over };
}

let emptyRt: GestureRuntimeContext;

describe('PointerGestureRouter', () => {
  let router: PointerGestureRouter;
  let creation: CreationGesture;
  let selectionMarquee: SelectionMarqueeGesture;
  let zoomMarquee: ZoomMarqueeGesture;
  let resize: ResizeGesture;
  let skew: SkewGesture;
  let rotate: RotateGesture;
  let drag: DragGesture;
  let registry: ToolRegistryService;
  let hostState: CanvasToolsTestHostState;

  beforeEach(() => {
    creation = new CreationGesture();
    selectionMarquee = new SelectionMarqueeGesture();
    zoomMarquee = new ZoomMarqueeGesture();
    resize = new ResizeGesture();
    skew = new SkewGesture();
    rotate = new RotateGesture();
    drag = new DragGesture();
    vi.spyOn(creation, 'move');
    vi.spyOn(creation, 'end');
    vi.spyOn(selectionMarquee, 'move');
    vi.spyOn(zoomMarquee, 'move');
    vi.spyOn(resize, 'move');
    vi.spyOn(skew, 'move');
    vi.spyOn(rotate, 'move');
    vi.spyOn(drag, 'move');

    const boot = registerAllCanvasToolsForTest({
      gestures: { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag }
    });
    registry = boot.registry;
    hostState = boot.hostState;
    emptyRt = boot.runtime;

    router = new PointerGestureRouter(registry);
  });

  it('onDocumentMouseMove prefers creation over selection marquee', () => {
    const host = makeHost({ getCurrentTool: () => 'rect' }, hostState);
    hostState.isSelectionMarquee = true;
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(creation.move).toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers registered tool onPointerMove over default creation move', () => {
    const onPointerMove = vi.fn();
    patchRegisteredCanvasTool(registry, 'rect', { onPointerMove });
    const host = makeHost({ getCurrentTool: () => 'rect' }, hostState);
    hostState.isSelectionMarquee = true;
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onPointerMove).toHaveBeenCalled();
    expect(creation.move).not.toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove routes to selection marquee when active', () => {
    const host = makeHost({}, hostState);
    hostState.isSelectionMarquee = true;
    router.onDocumentMouseMove(host, { clientX: 5, clientY: 6, shiftKey: false } as MouseEvent);
    expect(selectionMarquee.move).toHaveBeenCalledWith(5, 6, emptyRt);
  });

  it('onDocumentMouseUp prefers path node drag over creation', () => {
    const finishPathNodeDrag = vi.fn();
    const host = makeHost({
      getPathNodeDragSession: () => ({}),
      finishPathNodeDrag
    });
    router.onDocumentMouseUp(host, { button: 0 } as MouseEvent);
    expect(finishPathNodeDrag).toHaveBeenCalled();
    expect(creation.end).not.toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts zoom marquee when zoom tool is active', () => {
    const host = makeHost({ getCurrentTool: () => 'zoom' }, hostState);
    const ev = { button: 0, clientX: 10, clientY: 20, preventDefault: vi.fn() } as unknown as MouseEvent;
    vi.spyOn(zoomMarquee, 'startAt');
    router.onCanvasMouseDownPrimary(host, ev);
    expect(zoomMarquee.startAt).toHaveBeenCalledWith(10, 20);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers path node drag session over selector marquee', () => {
    const updatePathNodeDrag = vi.fn();
    const host = makeHost({
      getPathNodeDragSession: () => ({}),
      updatePathNodeDrag
    });
    hostState.isSelectionMarquee = true;
    router.onDocumentMouseMove(host, { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent);
    expect(updatePathNodeDrag).toHaveBeenCalledWith(3, 4);
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove routes registered pen when active session is moveto-only (first-segment pending)', () => {
    const onDocumentMouseMovePen = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      isPenInsertOnPathDragActive: false,
      onDocumentMouseMovePen
    } as unknown as PenToolSession;
    const boot = registerAllCanvasToolsForTest({
      gestures: { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      penTool
    });
    const penRouter = new PointerGestureRouter(boot.registry);
    const host = makeHost({ getCurrentTool: () => 'pen' }, boot.hostState);
    penRouter.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onDocumentMouseMovePen).toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers registered pen session over selection marquee', () => {
    const onDocumentMouseMovePen = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      isPenInsertOnPathDragActive: false,
      onDocumentMouseMovePen
    } as unknown as PenToolSession;
    const boot = registerAllCanvasToolsForTest({
      gestures: { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      penTool
    });
    const penRouter = new PointerGestureRouter(boot.registry);
    const host = makeHost({ getCurrentTool: () => 'pen' }, boot.hostState);
    boot.hostState.isSelectionMarquee = true;
    penRouter.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onDocumentMouseMovePen).toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls zoomMarquee.move when zoom marquee is active', () => {
    const host = makeHost({ getCurrentTool: () => 'zoom' }, hostState);
    hostState.isZoomMarquee = true;
    router.onDocumentMouseMove(host, { clientX: 7, clientY: 8, shiftKey: false } as MouseEvent);
    expect(zoomMarquee.move).toHaveBeenCalledWith(7, 8);
  });

  it('onDocumentMouseMove routes to resize before skew, rotate, pan, and drag', () => {
    const ev = { clientX: 1, clientY: 2, altKey: true, shiftKey: true } as MouseEvent;
    const applyPanDragFromEvent = vi.fn();
    const host = makeHost({}, hostState);
    hostState.isResizingSelection = true;
    hostState.isSkewingSelection = true;
    hostState.isRotatingSelection = true;
    hostState.isPanning = true;
    hostState.isDraggingShape = true;
    hostState.applyPanDragFromEvent = applyPanDragFromEvent;
    router.onDocumentMouseMove(host, ev);
    expect(resize.move).toHaveBeenCalledWith(emptyRt, 1, 2, true, true);
    expect(skew.move).not.toHaveBeenCalled();
    expect(rotate.move).not.toHaveBeenCalled();
    expect(applyPanDragFromEvent).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls pan drag when panning and not resizing', () => {
    const applyPanDragFromEvent = vi.fn();
    const host = makeHost({ getCurrentTool: () => 'pan' }, hostState);
    hostState.isPanning = true;
    hostState.applyPanDragFromEvent = applyPanDragFromEvent;
    router.onDocumentMouseMove(host, { clientX: 0, clientY: 0, shiftKey: false } as MouseEvent);
    expect(applyPanDragFromEvent).toHaveBeenCalled();
    expect(drag.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls drag when dragging shape and not panning', () => {
    const host = makeHost({}, hostState);
    hostState.isDraggingShape = true;
    router.onDocumentMouseMove(host, { clientX: 9, clientY: 10, shiftKey: true } as MouseEvent);
    expect(drag.move).toHaveBeenCalledWith(emptyRt, 9, 10, true);
  });

  it('onDocumentMouseMove asks hostState to update text tool preview via registered text tool', () => {
    const updateTextToolPreviewFromClient = vi.fn();
    const host = makeHost({ getCurrentTool: () => 'text' }, hostState);
    hostState.updateTextToolPreviewFromClient = updateTextToolPreviewFromClient;
    router.onDocumentMouseMove(host, { clientX: 11, clientY: 12, shiftKey: false } as MouseEvent);
    expect(updateTextToolPreviewFromClient).toHaveBeenCalledWith(11, 12);
  });

  it('onDocumentMouseUp ignores non-primary button', () => {
    vi.spyOn(drag, 'end');
    const host = makeHost({ getPathNodeDragSession: () => null }, hostState);
    hostState.isDraggingShape = true;
    router.onDocumentMouseUp(host, { button: 1 } as MouseEvent);
    expect(drag.end).not.toHaveBeenCalled();
    expect(hostState.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onDocumentMouseUp ends resize when resizing with selector tool', () => {
    vi.spyOn(resize, 'end');
    const host = makeHost({}, hostState);
    hostState.isResizingSelection = true;
    router.onDocumentMouseUp(host, { button: 0, altKey: true } as MouseEvent);
    expect(resize.end).toHaveBeenCalledWith(emptyRt, true);
    expect(hostState.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onDocumentMouseUp ends skew and rotate when active', () => {
    vi.spyOn(skew, 'end');
    vi.spyOn(rotate, 'end');
    hostState.isSkewingSelection = true;
    router.onDocumentMouseUp(makeHost({}, hostState), { button: 0 } as MouseEvent);
    expect(skew.end).toHaveBeenCalledWith(emptyRt);
    hostState.isSkewingSelection = false;
    hostState.isRotatingSelection = true;
    router.onDocumentMouseUp(makeHost({}, hostState), { button: 0 } as MouseEvent);
    expect(rotate.end).toHaveBeenCalledWith(emptyRt);
  });

  it('onDocumentMouseUp ends drag when dragging shape', () => {
    vi.spyOn(drag, 'end');
    const host = makeHost({}, hostState);
    hostState.isDraggingShape = true;
    router.onDocumentMouseUp(host, { button: 0, clientX: 4, clientY: 5, shiftKey: false } as MouseEvent);
    expect(drag.end).toHaveBeenCalledWith(emptyRt, 4, 5, false);
  });

  it('onDocumentMouseUp commits zoom marquee before clearPanningFlag branch', () => {
    const commitZoomMarquee = vi.fn();
    const host = makeHost({ getCurrentTool: () => 'zoom' }, hostState);
    hostState.isZoomMarquee = true;
    hostState.commitZoomMarquee = commitZoomMarquee;
    router.onDocumentMouseUp(host, { button: 0 } as MouseEvent);
    expect(commitZoomMarquee).toHaveBeenCalled();
    expect(hostState.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary begins pan when pan tool is active', () => {
    const beginPanSession = vi.fn();
    const host = makeHost({ getCurrentTool: () => 'pan' }, hostState);
    hostState.beginPanSession = beginPanSession;
    const ev = { button: 0, preventDefault: vi.fn() } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(beginPanSession).toHaveBeenCalledWith(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts selection marquee on background hit with selector tool', () => {
    vi.spyOn(selectionMarquee, 'startAt');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const host = makeHost({}, hostState);
    hostState.isEditorContentShapeTarget = () => false;
    const ev = {
      button: 0,
      clientX: 2,
      clientY: 3,
      target: bg,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(selectionMarquee.startAt).toHaveBeenCalledWith(2, 3);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts resize when mousedown on data-resize-handle', () => {
    vi.spyOn(resize, 'start').mockReturnValue(true);
    const handle = document.createElement('div');
    handle.setAttribute('data-resize-handle', 'se');
    const host = makeHost({ getCurrentTool: () => 'selector' }, hostState);
    const ev = {
      button: 0,
      target: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(resize.start).toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts skew when mousedown on data-skew-handle', () => {
    vi.spyOn(skew, 'start').mockReturnValue(true);
    const handle = document.createElement('div');
    handle.setAttribute('data-skew-handle', 'n');
    const host = makeHost({ getCurrentTool: () => 'selector' }, hostState);
    const ev = {
      button: 0,
      target: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(skew.start).toHaveBeenCalledWith(emptyRt, 'n', ev);
  });

  it('onCanvasMouseDownPrimary starts rotate from data-rotate-handle', () => {
    vi.spyOn(rotate, 'start').mockReturnValue(true);
    const handle = document.createElement('div');
    handle.setAttribute('data-rotate-handle', '1');
    const host = makeHost({ getCurrentTool: () => 'selector' }, hostState);
    const ev = {
      button: 0,
      target: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(rotate.start).toHaveBeenCalledWith(emptyRt, ev);
  });

  it('onCanvasMouseDownPrimary with registered pen prefers open-path continuation over path node drag', () => {
    const tryStartPathNodeDrag = vi.fn(() => true);
    const onCanvasPenPrimaryMouseDown = vi.fn(() => true);
    const penTool = {
      isPenSessionActive: false,
      isPenInsertOnPathDragActive: false,
      wouldPickUpPenOpenPathContinuationAt: () => true,
      onCanvasPenPrimaryMouseDown
    } as unknown as PenToolSession;
    const boot = registerAllCanvasToolsForTest({
      gestures: { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      penTool,
      hostState: { tryStartPathNodeDrag, hasPathNodeEditState: true }
    });
    const penRouter = new PointerGestureRouter(boot.registry);
    const host = makeHost({ getCurrentTool: () => 'pen' }, boot.hostState);
    const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchor.setAttribute('data-path-node-anchor-index', '0');
    anchor.setAttribute('data-path-node-path-id', 'path-a');
    const ev = {
      button: 0,
      target: anchor,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    penRouter.onCanvasMouseDownPrimary(host, ev);
    expect(tryStartPathNodeDrag).not.toHaveBeenCalled();
    expect(onCanvasPenPrimaryMouseDown).toHaveBeenCalledWith(ev, expect.any(Function));
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary with registered pen tries path node drag before pen mousedown when not open-path pickup', () => {
    const tryStartPathNodeDrag = vi.fn(() => true);
    const onCanvasPenPrimaryMouseDown = vi.fn(() => false);
    const penTool = {
      isPenSessionActive: false,
      isPenInsertOnPathDragActive: false,
      wouldPickUpPenOpenPathContinuationAt: () => false,
      onCanvasPenPrimaryMouseDown
    } as unknown as PenToolSession;
    const boot = registerAllCanvasToolsForTest({
      gestures: { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      penTool,
      hostState: { tryStartPathNodeDrag, hasPathNodeEditState: true }
    });
    const penRouter = new PointerGestureRouter(boot.registry);
    const host = makeHost({ getCurrentTool: () => 'pen' }, boot.hostState);
    const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchor.setAttribute('data-path-node-anchor-index', '0');
    anchor.setAttribute('data-path-node-path-id', 'path-a');
    const ev = {
      button: 0,
      target: anchor,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    penRouter.onCanvasMouseDownPrimary(host, ev);
    expect(tryStartPathNodeDrag).toHaveBeenCalledWith(anchor, ev);
    expect(onCanvasPenPrimaryMouseDown).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary dispatches to registered tool onPointerDown', () => {
    const onPointerDown = vi.fn(() => true);
    patchRegisteredCanvasTool(registry, 'zoom', { onPointerDown });
    vi.spyOn(zoomMarquee, 'startAt');
    const host = makeHost({ getCurrentTool: () => 'zoom' }, hostState);
    const ev = { button: 0, clientX: 10, clientY: 20, preventDefault: vi.fn() } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(onPointerDown).toHaveBeenCalled();
    expect(zoomMarquee.startAt).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onDocumentMouseMove dispatches to registered tool onPointerMove', () => {
    const onPointerMove = vi.fn();
    patchRegisteredCanvasTool(registry, 'rect', { onPointerMove });
    const host = makeHost({ getCurrentTool: () => 'rect' }, hostState);
    router.onDocumentMouseMove(host, { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent);
    expect(onPointerMove).toHaveBeenCalled();
  });

  it('onDocumentMouseMove passes document SVG coordinates to registered tool onPointerMove', () => {
    const onPointerMove = vi.fn();
    patchRegisteredCanvasTool(registry, 'rect', { onPointerMove });
    const clientToEditorSvgPoint = vi.fn((clientX: number, clientY: number) => ({
      x: clientX + 100,
      y: clientY + 200
    }));
    const host = makeHost(
      { getCurrentTool: () => 'rect', clientToEditorSvgPoint },
      hostState
    );
    const event = { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent;
    router.onDocumentMouseMove(host, event);
    expect(clientToEditorSvgPoint).toHaveBeenCalledWith(3, 4);
    expect(onPointerMove).toHaveBeenCalledWith(event, { x: 103, y: 204 });
  });

  it('onDocumentMouseUp dispatches to registered tool onPointerUp', () => {
    const onPointerUp = vi.fn();
    patchRegisteredCanvasTool(registry, 'rect', { onPointerUp });
    router.onDocumentMouseUp(makeHost({ getCurrentTool: () => 'rect' }, hostState), {
      button: 0,
      clientX: 1,
      clientY: 2
    } as MouseEvent);
    expect(onPointerUp).toHaveBeenCalled();
  });

  it('onDocumentMouseUp passes document SVG coordinates to registered tool onPointerUp', () => {
    const onPointerUp = vi.fn();
    patchRegisteredCanvasTool(registry, 'rect', { onPointerUp });
    const clientToEditorSvgPoint = vi.fn((clientX: number, clientY: number) => ({
      x: clientX + 50,
      y: clientY + 60
    }));
    const host = makeHost(
      { getCurrentTool: () => 'rect', clientToEditorSvgPoint },
      hostState
    );
    const event = { button: 0, clientX: 1, clientY: 2 } as MouseEvent;
    router.onDocumentMouseUp(host, event);
    expect(clientToEditorSvgPoint).toHaveBeenCalledWith(1, 2);
    expect(onPointerUp).toHaveBeenCalledWith(event, { x: 51, y: 62 });
  });
});
