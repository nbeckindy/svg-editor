/**
 * Constructs pointer **gesture runtime**, {@link PointerGestureRouter}, and {@link PenToolSession}
 * in one place so the **Canvas adapter** constructor stays wiring-only. Interaction policy stays in
 * {@link ./svg-canvas-keyboard.controller} and gesture classes; this **Module** is assembly only.
 */
import type { ChangeDetectorRef, Signal } from '@angular/core';
import type { ElementRef } from '@angular/core';
import type { SvgManipulationService } from '../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { EditorHistoryService } from '../../services/editor-history.service';
import type { SnapCandidateShape, SnapService } from '../../services/snap.service';
import type { GestureRuntimeContext } from './gestures/gesture-context';
import type { Rect } from './gestures/gesture-context';
import {
  DragGesture,
  ResizeGesture,
  RotateGesture,
  SkewGesture,
  CreationGesture,
  SelectionMarqueeGesture,
  ZoomMarqueeGesture,
  PointerGestureRouter
} from './gestures';
import { PenToolSession, type PenToolSessionPorts } from './pen-tool-session/pen-tool-session';

export interface SvgCanvasPointerStack {
  readonly gestureRuntime: GestureRuntimeContext;
  readonly pointerGestureRouter: PointerGestureRouter;
  readonly penTool: PenToolSession;
  readonly drag: DragGesture;
  readonly resize: ResizeGesture;
  readonly rotate: RotateGesture;
  readonly skew: SkewGesture;
  readonly creation: CreationGesture;
  readonly selectionMarquee: SelectionMarqueeGesture;
  readonly zoomMarquee: ZoomMarqueeGesture;
}

export interface CreateSvgCanvasPointerStackArgs {
  cdr: ChangeDetectorRef;
  highlightOverlayContainer: Signal<ElementRef<HTMLElement> | undefined>;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  snap: SnapService;
  clientToEditorSvgPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  svgBboxToOverlayPixels: (bbox: Rect) => Rect;
  invalidateHighlightCache: () => void;
  setLastBbox: (bbox: Rect | null) => void;
  getSmartGuideCandidates: () => SnapCandidateShape[];
  isSnapTemporarilyDisabled: () => boolean;
  createPenToolSessionPorts: () => PenToolSessionPorts;
}

export function createSvgCanvasPointerStack(args: CreateSvgCanvasPointerStackArgs): SvgCanvasPointerStack {
  const drag = new DragGesture();
  const resize = new ResizeGesture();
  const rotate = new RotateGesture();
  const skew = new SkewGesture();
  const creation = new CreationGesture();
  const selectionMarquee = new SelectionMarqueeGesture();
  const zoomMarquee = new ZoomMarqueeGesture();

  const doc = {
    svgManipulation: args.svgManipulation,
    shapeSelection: args.shapeSelection,
    editorHistory: args.editorHistory
  };

  const gestureRuntime: GestureRuntimeContext = {
    pointer: {
      cdr: args.cdr,
      highlightOverlayContainer: args.highlightOverlayContainer,
      clientToEditorSvgPoint: (cx, cy) => args.clientToEditorSvgPoint(cx, cy),
      svgBboxToOverlayPixels: (bbox) => args.svgBboxToOverlayPixels(bbox),
      invalidateHighlightCache: () => args.invalidateHighlightCache(),
      setLastBbox: (bbox) => args.setLastBbox(bbox)
    },
    doc,
    transformDoc: doc,
    snap: {
      snap: args.snap,
      getSmartGuideCandidates: () => args.getSmartGuideCandidates(),
      isSnapTemporarilyDisabled: () => args.isSnapTemporarilyDisabled()
    }
  };

  const pointerGestureRouter = new PointerGestureRouter(
    {
      creation,
      selectionMarquee,
      zoomMarquee,
      resize,
      skew,
      rotate,
      drag
    },
    args.cdr
  );

  const penTool = new PenToolSession(args.createPenToolSessionPorts());

  return {
    gestureRuntime,
    pointerGestureRouter,
    penTool,
    drag,
    resize,
    rotate,
    skew,
    creation,
    selectionMarquee,
    zoomMarquee
  };
}
