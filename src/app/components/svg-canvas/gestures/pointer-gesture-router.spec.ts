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

const emptyRt = {
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  snap: {} as GestureRuntimeContext['snap']
};

function makeHost(over: Partial<SvgCanvasPointerGestureHost>): SvgCanvasPointerGestureHost {
  const base: SvgCanvasPointerGestureHost = {
    gestureRuntime: emptyRt,
    isCreatingShape: false,
    getPathNodeDragSession: () => null,
    updatePathNodeDrag: vi.fn(),
    isPenToolWithActiveSession: () => false,
    onPenDocumentMouseMove: vi.fn(),
    isSelectionMarquee: false,
    isZoomMarquee: false,
    isResizingSelection: false,
    isSkewingSelection: false,
    isRotatingSelection: false,
    isPanning: false,
    applyPanDragFromEvent: vi.fn(),
    isDraggingShape: false,
    updateTextToolPreviewFromClient: vi.fn(),
    finishPathNodeDrag: vi.fn(),
    onPenDocumentMouseUp: vi.fn(),
    commitZoomMarquee: vi.fn(),
    clearPanningFlag: vi.fn(),
    svgContentValue: '',
    canvasViewInitialized: true,
    beginPanSession: vi.fn(),
    onCanvasPenPrimaryMouseDown: vi.fn(() => false),
    isCreationToolActive: () => false,
    getCurrentTool: () => 'selector',
    isSelectorInteractionTool: () => true,
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
    const host = makeHost({ isCreatingShape: true, isSelectionMarquee: true });
    router.onDocumentMouseMove(host, { clientX: 1, clientY: 2, shiftKey: false } as MouseEvent);
    expect(creation.move).toHaveBeenCalled();
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
});
