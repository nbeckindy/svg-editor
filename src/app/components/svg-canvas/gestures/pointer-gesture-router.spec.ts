import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
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
import type { CanvasTool } from '../../../tools/canvas-tool.interface';
import { createPenCanvasTool } from '../../../tools/pen-canvas-tool';
import type { PenToolSession } from '../pen-tool-session/pen-tool-session';

const emptyRt = {
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  transformDoc: {} as GestureRuntimeContext['transformDoc'],
  snap: {} as GestureRuntimeContext['snap']
};

function makeHost(over: Partial<SvgCanvasPointerGestureHost>): SvgCanvasPointerGestureHost {
  const base: SvgCanvasPointerGestureHost = {
    gestureRuntime: emptyRt,
    isCreatingShape: false,
    getPathNodeDragSession: () => null,
    updatePathNodeDrag: vi.fn(),
    isSelectionMarquee: false,
    isZoomMarquee: false,
    isResizingSelection: false,
    isSkewingSelection: false,
    isRotatingSelection: false,
    isPanning: false,
    applyPanDragFromEvent: vi.fn(),
    isDraggingShape: false,
    updateTextToolPreviewFromClient: vi.fn(),
    recordInsertAnchorFromClient: vi.fn(),
    finishPathNodeDrag: vi.fn(),
    commitZoomMarquee: vi.fn(),
    clearPanningFlag: vi.fn(),
    svgContentValue: '',
    canvasViewInitialized: true,
    beginPanSession: vi.fn(),
    isCreationToolActive: () => false,
    getCurrentTool: () => 'selector',
    hasPathNodeEditState: () => false,
    tryStartPathNodeDrag: () => false,
    isEditorContentShapeTarget: () => true,
    clientToEditorSvgPointForDrag: () => ({ x: 0, y: 0 }),
    isShapeSelected: () => true,
    getNearestGroupAncestorId: () => null,
    getSelectedShapeIds: () => ['a']
  };
  return { ...base, ...over };
}

describe('PointerGestureRouter', () => {
  let router: PointerGestureRouter;
  let creation: CreationGesture;
  let selectionMarquee: SelectionMarqueeGesture;
  let zoomMarquee: ZoomMarqueeGesture;
  let resize: ResizeGesture;
  let skew: SkewGesture;
  let rotate: RotateGesture;
  let drag: DragGesture;
  let cdr: Pick<ChangeDetectorRef, 'detectChanges'>;

  beforeEach(() => {
    creation = new CreationGesture();
    selectionMarquee = new SelectionMarqueeGesture();
    zoomMarquee = new ZoomMarqueeGesture();
    resize = new ResizeGesture();
    skew = new SkewGesture();
    rotate = new RotateGesture();
    drag = new DragGesture();
    cdr = { detectChanges: vi.fn() };
    vi.spyOn(creation, 'move');
    vi.spyOn(creation, 'end');
    vi.spyOn(selectionMarquee, 'move');
    vi.spyOn(zoomMarquee, 'move');
    vi.spyOn(resize, 'move');
    vi.spyOn(skew, 'move');
    vi.spyOn(rotate, 'move');
    vi.spyOn(drag, 'move');
    router = new PointerGestureRouter(
      {
        creation,
        selectionMarquee,
        zoomMarquee,
        resize,
        skew,
        rotate,
        drag
      },
      cdr as ChangeDetectorRef
    );
  });

  it('onDocumentMouseMove prefers creation over selection marquee', () => {
    const host = makeHost({ isCreatingShape: true, isSelectionMarquee: true, getCurrentTool: () => 'rect' });
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(creation.move).toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers registered tool onPointerMove over legacy creation when creating', () => {
    const registry = new ToolRegistryService();
    const onPointerMove = vi.fn();
    registry.register({
      toolId: 'rect',
      onActivate: () => {},
      onDeactivate: () => {},
      onPointerMove
    });
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({
      isCreatingShape: true,
      isSelectionMarquee: true,
      getCurrentTool: () => 'rect'
    });
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onPointerMove).toHaveBeenCalled();
    expect(creation.move).not.toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove routes to selection marquee when active', () => {
    const host = makeHost({ isSelectionMarquee: true });
    router.onDocumentMouseMove(host, { clientX: 5, clientY: 6, shiftKey: false } as MouseEvent);
    expect(selectionMarquee.move).toHaveBeenCalledWith(5, 6, emptyRt);
  });

  it('onDocumentMouseUp prefers path node drag over creation', () => {
    const host = makeHost({
      getPathNodeDragSession: () => ({}),
      isCreatingShape: true
    });
    router.onDocumentMouseUp(host, { button: 0 } as MouseEvent);
    expect(host.finishPathNodeDrag).toHaveBeenCalled();
    expect(creation.end).not.toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts zoom marquee when zoom tool is active', () => {
    const host = makeHost({ getCurrentTool: () => 'zoom' });
    const ev = { button: 0, clientX: 10, clientY: 20, preventDefault: vi.fn() } as unknown as MouseEvent;
    vi.spyOn(zoomMarquee, 'startAt');
    router.onCanvasMouseDownPrimary(host, ev);
    expect(zoomMarquee.startAt).toHaveBeenCalledWith(10, 20);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers path node drag session over selector marquee', () => {
    const host = makeHost({
      getPathNodeDragSession: () => ({}),
      isSelectionMarquee: true,
      updatePathNodeDrag: vi.fn()
    });
    router.onDocumentMouseMove(host, { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent);
    expect(host.updatePathNodeDrag).toHaveBeenCalledWith(3, 4);
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove routes registered pen when active session is moveto-only (first-segment pending)', () => {
    const registry = new ToolRegistryService();
    const onDocumentMouseMovePen = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      isPenInsertOnPathDragActive: false,
      onDocumentMouseMovePen
    } as unknown as PenToolSession;
    registry.register(
      createPenCanvasTool(() => ({
        getPenTool: () => penTool,
        getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
        hasPathNodeEditState: () => false,
        tryStartPathNodeDrag: () => false,
        isCanvasReady: () => true,
        scheduleInsertHoverCursorHitTest: vi.fn()
      }))
    );
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({ getCurrentTool: () => 'pen' });
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onDocumentMouseMovePen).toHaveBeenCalled();
  });

  it('onDocumentMouseMove prefers registered pen session over selection marquee', () => {
    const registry = new ToolRegistryService();
    const onDocumentMouseMovePen = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      isPenInsertOnPathDragActive: false,
      onDocumentMouseMovePen
    } as unknown as PenToolSession;
    registry.register(
      createPenCanvasTool(() => ({
        getPenTool: () => penTool,
        getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
        hasPathNodeEditState: () => false,
        tryStartPathNodeDrag: () => false,
        isCanvasReady: () => true,
        scheduleInsertHoverCursorHitTest: vi.fn()
      }))
    );
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({
      getCurrentTool: () => 'pen',
      isSelectionMarquee: true
    });
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(onDocumentMouseMovePen).toHaveBeenCalled();
    expect(selectionMarquee.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls zoomMarquee.move and detectChanges when zoom marquee is active', () => {
    const host = makeHost({ isZoomMarquee: true });
    router.onDocumentMouseMove(host, { clientX: 7, clientY: 8, shiftKey: false } as MouseEvent);
    expect(zoomMarquee.move).toHaveBeenCalledWith(7, 8);
    expect(cdr.detectChanges).toHaveBeenCalled();
  });

  it('onDocumentMouseMove routes to resize before skew, rotate, pan, and drag', () => {
    const ev = { clientX: 1, clientY: 2, altKey: true, shiftKey: true } as MouseEvent;
    const applyPanDragFromEvent = vi.fn();
    const host = makeHost({
      isResizingSelection: true,
      isSkewingSelection: true,
      isRotatingSelection: true,
      isPanning: true,
      isDraggingShape: true,
      applyPanDragFromEvent
    });
    router.onDocumentMouseMove(host, ev);
    expect(resize.move).toHaveBeenCalledWith(emptyRt, 1, 2, true, true);
    expect(skew.move).not.toHaveBeenCalled();
    expect(rotate.move).not.toHaveBeenCalled();
    expect(applyPanDragFromEvent).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls pan drag when panning and not resizing', () => {
    const applyPanDragFromEvent = vi.fn();
    const host = makeHost({ isPanning: true, applyPanDragFromEvent });
    router.onDocumentMouseMove(host, { clientX: 0, clientY: 0, shiftKey: false } as MouseEvent);
    expect(applyPanDragFromEvent).toHaveBeenCalled();
    expect(drag.move).not.toHaveBeenCalled();
  });

  it('onDocumentMouseMove calls drag when dragging shape and not panning', () => {
    const host = makeHost({ isDraggingShape: true });
    router.onDocumentMouseMove(host, { clientX: 9, clientY: 10, shiftKey: true } as MouseEvent);
    expect(drag.move).toHaveBeenCalledWith(emptyRt, 9, 10, true);
  });

  it('onDocumentMouseMove always asks host to update text tool preview', () => {
    const updateTextToolPreviewFromClient = vi.fn();
    const host = makeHost({ updateTextToolPreviewFromClient });
    router.onDocumentMouseMove(host, { clientX: 11, clientY: 12, shiftKey: false } as MouseEvent);
    expect(updateTextToolPreviewFromClient).toHaveBeenCalledWith(11, 12);
  });

  it('onDocumentMouseMove always asks host to record insert anchor', () => {
    const recordInsertAnchorFromClient = vi.fn();
    const host = makeHost({ recordInsertAnchorFromClient });
    router.onDocumentMouseMove(host, { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent);
    expect(recordInsertAnchorFromClient).toHaveBeenCalledWith(3, 4);
  });

  it('onDocumentMouseUp ignores non-primary button', () => {
    vi.spyOn(drag, 'end');
    const host = makeHost({ isDraggingShape: true, getPathNodeDragSession: () => null });
    router.onDocumentMouseUp(host, { button: 1 } as MouseEvent);
    expect(drag.end).not.toHaveBeenCalled();
    expect(host.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onDocumentMouseUp ends resize when resizing with selector tool', () => {
    vi.spyOn(resize, 'end');
    const host = makeHost({ isResizingSelection: true });
    router.onDocumentMouseUp(host, { button: 0, altKey: true } as MouseEvent);
    expect(resize.end).toHaveBeenCalledWith(emptyRt, true);
    expect(host.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onDocumentMouseUp ends skew and rotate when active', () => {
    vi.spyOn(skew, 'end');
    vi.spyOn(rotate, 'end');
    router.onDocumentMouseUp(makeHost({ isSkewingSelection: true }), { button: 0 } as MouseEvent);
    expect(skew.end).toHaveBeenCalledWith(emptyRt);
    router.onDocumentMouseUp(makeHost({ isRotatingSelection: true }), { button: 0 } as MouseEvent);
    expect(rotate.end).toHaveBeenCalledWith(emptyRt);
  });

  it('onDocumentMouseUp ends drag when dragging shape', () => {
    vi.spyOn(drag, 'end');
    const host = makeHost({ isDraggingShape: true });
    router.onDocumentMouseUp(host, { button: 0, clientX: 4, clientY: 5, shiftKey: false } as MouseEvent);
    expect(drag.end).toHaveBeenCalledWith(emptyRt, 4, 5, false);
  });

  it('onDocumentMouseUp commits zoom marquee before clearPanningFlag branch', () => {
    const host = makeHost({ isZoomMarquee: true, commitZoomMarquee: vi.fn() });
    router.onDocumentMouseUp(host, { button: 0 } as MouseEvent);
    expect(host.commitZoomMarquee).toHaveBeenCalled();
    expect(host.clearPanningFlag).not.toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary begins pan when pan tool is active', () => {
    const beginPanSession = vi.fn();
    const host = makeHost({ getCurrentTool: () => 'pan', beginPanSession });
    const ev = { button: 0, preventDefault: vi.fn() } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(beginPanSession).toHaveBeenCalledWith(ev);
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary starts selection marquee on background hit with selector tool', () => {
    vi.spyOn(selectionMarquee, 'startAt');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const host = makeHost({
      svgContentValue: '<svg/>',
      canvasViewInitialized: true,
      isEditorContentShapeTarget: () => false
    });
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
    const host = makeHost({
      svgContentValue: 'x',
      canvasViewInitialized: true,
      getCurrentTool: () => 'selector'
    });
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
    const host = makeHost({
      svgContentValue: 'x',
      canvasViewInitialized: true,
      getCurrentTool: () => 'selector'
    });
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
    const host = makeHost({
      svgContentValue: 'x',
      canvasViewInitialized: true,
      getCurrentTool: () => 'selector'
    });
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
    const registry = new ToolRegistryService();
    const tryStartPathNodeDrag = vi.fn(() => true);
    const onCanvasPenPrimaryMouseDown = vi.fn(() => true);
    const penTool = {
      isPenSessionActive: false,
      isPenInsertOnPathDragActive: false,
      wouldPickUpPenOpenPathContinuationAt: () => true,
      onCanvasPenPrimaryMouseDown
    } as unknown as PenToolSession;
    registry.register(
      createPenCanvasTool(() => ({
        getPenTool: () => penTool,
        getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
        hasPathNodeEditState: () => true,
        tryStartPathNodeDrag,
        isCanvasReady: () => true,
        scheduleInsertHoverCursorHitTest: vi.fn()
      }))
    );
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({ getCurrentTool: () => 'pen' });
    const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchor.setAttribute('data-path-node-anchor-index', '0');
    anchor.setAttribute('data-path-node-path-id', 'path-a');
    const ev = {
      button: 0,
      target: anchor,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(tryStartPathNodeDrag).not.toHaveBeenCalled();
    expect(onCanvasPenPrimaryMouseDown).toHaveBeenCalledWith(ev, expect.any(Function));
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary with registered pen tries path node drag before pen mousedown when not open-path pickup', () => {
    const registry = new ToolRegistryService();
    const tryStartPathNodeDrag = vi.fn(() => true);
    const onCanvasPenPrimaryMouseDown = vi.fn(() => false);
    const penTool = {
      isPenSessionActive: false,
      isPenInsertOnPathDragActive: false,
      wouldPickUpPenOpenPathContinuationAt: () => false,
      onCanvasPenPrimaryMouseDown
    } as unknown as PenToolSession;
    registry.register(
      createPenCanvasTool(() => ({
        getPenTool: () => penTool,
        getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
        hasPathNodeEditState: () => true,
        tryStartPathNodeDrag,
        isCanvasReady: () => true,
        scheduleInsertHoverCursorHitTest: vi.fn()
      }))
    );
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({ getCurrentTool: () => 'pen' });
    const anchor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    anchor.setAttribute('data-path-node-anchor-index', '0');
    anchor.setAttribute('data-path-node-path-id', 'path-a');
    const ev = {
      button: 0,
      target: anchor,
      preventDefault: vi.fn()
    } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(tryStartPathNodeDrag).toHaveBeenCalledWith(anchor, ev);
    expect(onCanvasPenPrimaryMouseDown).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onCanvasMouseDownPrimary dispatches to registered tool before legacy zoom routing', () => {
    const registry = new ToolRegistryService();
    const onPointerDown = vi.fn(() => true);
    const tool: CanvasTool = {
      toolId: 'zoom',
      onActivate: () => {},
      onDeactivate: () => {},
      onPointerDown
    };
    registry.register(tool);
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    vi.spyOn(zoomMarquee, 'startAt');
    const host = makeHost({ getCurrentTool: () => 'zoom' });
    const ev = { button: 0, clientX: 10, clientY: 20, preventDefault: vi.fn() } as unknown as MouseEvent;
    router.onCanvasMouseDownPrimary(host, ev);
    expect(onPointerDown).toHaveBeenCalled();
    expect(zoomMarquee.startAt).not.toHaveBeenCalled();
    expect(ev.preventDefault).toHaveBeenCalled();
  });

  it('onDocumentMouseMove dispatches to registered tool onPointerMove', () => {
    const registry = new ToolRegistryService();
    const onPointerMove = vi.fn();
    registry.register({
      toolId: 'rect',
      onActivate: () => {},
      onDeactivate: () => {},
      onPointerMove
    });
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    const host = makeHost({ getCurrentTool: () => 'rect' });
    router.onDocumentMouseMove(host, { clientX: 3, clientY: 4, shiftKey: false } as MouseEvent);
    expect(onPointerMove).toHaveBeenCalled();
    expect(host.updateTextToolPreviewFromClient).not.toHaveBeenCalled();
  });

  it('onDocumentMouseUp dispatches to registered tool onPointerUp', () => {
    const registry = new ToolRegistryService();
    const onPointerUp = vi.fn();
    registry.register({
      toolId: 'rect',
      onActivate: () => {},
      onDeactivate: () => {},
      onPointerUp
    });
    router = new PointerGestureRouter(
      { creation, selectionMarquee, zoomMarquee, resize, skew, rotate, drag },
      cdr as ChangeDetectorRef,
      registry
    );
    router.onDocumentMouseUp(makeHost({ getCurrentTool: () => 'rect' }), { button: 0, clientX: 1, clientY: 2 } as MouseEvent);
    expect(onPointerUp).toHaveBeenCalled();
  });
});
