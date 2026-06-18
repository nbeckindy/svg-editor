import {
  PenSession,
  lastCommittedVertex,
  penLastOutgoingHandleSvg,
  movePenLastOutgoingHandleTo,
  penPathOnlyMoveto,
  penSvgDistanceSq,
  snapVectorTo45DegFrom,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import {
  updatePenInsertOnPathDragPointer,
  type PenInsertOnPathDragMutable
} from './pen-tool-session-insert-on-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import type { PenContinuingPathRewrite } from './pen-tool-session-path-continuation';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

/**
 * Narrow surface for canvas primary / document pointer routing extracted from {@link PenToolSession}.
 * Implemented by a private factory on the session class.
 */
export interface PenCanvasInputView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: PenSession;
  readonly insertOnPathMutable: PenInsertOnPathDragMutable;

  get outgoingHandleDrag(): { segmentIndex: number; before: PenPathSegment } | null;
  set outgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null);

  get pendingSegment(): PenPendingSegmentForPreview | null;
  set pendingSegment(v: PenPendingSegmentForPreview | null);

  get pendingLastClient(): { x: number; y: number } | null;
  set pendingLastClient(v: { x: number; y: number } | null);

  get pendingDragSvg(): { x: number; y: number } | null;
  set pendingDragSvg(v: { x: number; y: number } | null);

  get pendingCurveAltChord(): boolean;
  set pendingCurveAltChord(v: boolean);

  get pendingShiftAngleSnap(): boolean;
  set pendingShiftAngleSnap(v: boolean);

  get pointerSvg(): { x: number; y: number } | null;
  set pointerSvg(v: { x: number; y: number } | null);

  get penContinuingPathRewrite(): PenContinuingPathRewrite | null;
  set penContinuingPathRewrite(v: PenContinuingPathRewrite | null);

  get awaitingColocatedEndpoint(): boolean;
  get colocatedDraft(): PenFirstAnchorP3Draft | null;
  get awaitingFirstP3(): boolean;
  get firstAnchorP3Draft(): PenFirstAnchorP3Draft | null;

  clearFirstAnchorAwaitingDraft(): void;
  clearColocatedDraft(): void;

  setHoverClientPx(x: number, y: number): void;

  tryPickUpPenOpenPathContinuation(event: MouseEvent): boolean;
  tryFinishPenPath(close: boolean): void;
  commitDraggedCurve(
    anchor: { x: number; y: number },
    chordEndSvg: { x: number; y: number },
    dragCurrent: { x: number; y: number },
    ctrlCurve: boolean,
    segmentEnd?: { x: number; y: number },
    placementDragStartSvg?: { x: number; y: number },
    frozenOutgoingP1Svg?: { x: number; y: number },
    zeroIncomingAtSegmentEnd?: boolean
  ): void;

  setColocatedDraft(v: PenFirstAnchorP3Draft | null): void;

  pendingIsFirstFromMoveto(): boolean;
  pendingChordColocated(): boolean;

  markForCheck(): void;
  commitPenPendingSegment(event: MouseEvent): void;
  finishPenOutgoingHandleDrag(): void;
  finishPenInsertOnPathDrag(event: MouseEvent): void;
  isPenSessionActive(): boolean;
}

export function handlePenCanvasMouseDownForView(v: PenCanvasInputView, event: MouseEvent, pt: { x: number; y: number }): void {
  if (event.detail >= 2) {
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    v.clearFirstAnchorAwaitingDraft();
    v.clearColocatedDraft();
    if (v.penSession.getSegments().length === 0) {
      v.ports.clearPenPostInsertAnchorOverlay();
      v.ports.clearSelectionForPenBackgroundStroke();
      v.penSession.beginPath(pt.x, pt.y);
      v.pointerSvg = { x: pt.x, y: pt.y };
      v.markForCheck();
      return;
    }
    if (penPathOnlyMoveto(v.penSession.getSegments())) {
      v.penSession.addLinePoint(pt.x, pt.y);
    }
    v.tryFinishPenPath(true);
    return;
  }
  const segs = v.penSession.getSegments();
  if (segs.length === 0) {
    v.penContinuingPathRewrite = null;
    if (v.tryPickUpPenOpenPathContinuation(event)) {
      v.markForCheck();
      return;
    }
    v.ports.clearPenPostInsertAnchorOverlay();
    v.ports.clearSelectionForPenBackgroundStroke();
    v.penSession.beginPath(pt.x, pt.y);
    v.pointerSvg = { x: pt.x, y: pt.y };
    v.pendingSegment = {
      anchor: { x: pt.x, y: pt.y },
      startClient: { x: event.clientX, y: event.clientY },
      startSvg: { x: pt.x, y: pt.y },
      ctrlCurve: v.ports.isPenAltCurveMode() || event.ctrlKey
    };
    v.pendingLastClient = { x: event.clientX, y: event.clientY };
    v.pendingDragSvg = { x: pt.x, y: pt.y };
    v.markForCheck();
    return;
  }
  if (v.awaitingColocatedEndpoint && v.colocatedDraft && event.detail < 2) {
    const draft = v.colocatedDraft;
    const tip = lastCommittedVertex(segs);
    if (draft && tip) {
      v.commitDraggedCurve(
        tip,
        pt,
        draft.dragCommitSvg,
        draft.ctrlCurve,
        undefined,
        draft.placementDragStartSvg,
        draft.frozenOutgoingP1Svg
      );
    }
    v.clearColocatedDraft();
    v.ports.clearPenPostInsertAnchorOverlay();
    const lv = lastCommittedVertex(v.penSession.getSegments()) ?? { x: pt.x, y: pt.y };
    v.pendingSegment = {
      anchor: { x: lv.x, y: lv.y },
      startClient: { x: event.clientX, y: event.clientY },
      startSvg: { x: pt.x, y: pt.y },
      ctrlCurve: v.ports.isPenAltCurveMode() || event.ctrlKey
    };
    v.pendingLastClient = { x: event.clientX, y: event.clientY };
    v.pendingDragSvg = { x: pt.x, y: pt.y };
    v.pointerSvg = { x: pt.x, y: pt.y };
    v.markForCheck();
    return;
  }
  const anchor = lastCommittedVertex(segs);
  if (!anchor) return;
  v.ports.clearPenPostInsertAnchorOverlay();
  v.pendingSegment = {
    anchor: { x: anchor.x, y: anchor.y },
    startClient: { x: event.clientX, y: event.clientY },
    startSvg: { x: pt.x, y: pt.y },
    ctrlCurve: v.ports.isPenAltCurveMode() || event.ctrlKey
  };
  if (penPathOnlyMoveto(segs) && v.firstAnchorP3Draft) {
    const m0 = segs[0];
    if (
      m0?.type === 'M' &&
      penSvgDistanceSq(anchor, { x: m0.x, y: m0.y }) < 1e-12
    ) {
      v.pendingSegment = {
        ...v.pendingSegment!,
        firstSegmentCurveDraft: { ...v.firstAnchorP3Draft }
      };
      v.clearFirstAnchorAwaitingDraft();
    }
  }
  v.pendingLastClient = { x: event.clientX, y: event.clientY };
  v.pendingDragSvg = { x: pt.x, y: pt.y };
  v.pointerSvg = { x: pt.x, y: pt.y };
  v.markForCheck();
}

export function onDocumentMouseMovePenForView(
  v: PenCanvasInputView,
  event: MouseEvent,
  getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
): void {
  v.setHoverClientPx(event.clientX, event.clientY);
  if (v.insertOnPathMutable.drag) {
    updatePenInsertOnPathDragPointer(v.ports, v.insertOnPathMutable, event);
    return;
  }
  if (v.outgoingHandleDrag) {
    const raw = v.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (raw) {
      let hx = raw.x;
      let hy = raw.y;
      if (event.shiftKey) {
        const h0 = penLastOutgoingHandleSvg(v.penSession.getSegments());
        if (h0) {
          const s = snapVectorTo45DegFrom({ x: h0.anchorX, y: h0.anchorY }, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
      }
      const next = movePenLastOutgoingHandleTo(v.penSession.getSegments(), hx, hy);
      if (next) {
        v.penSession.restoreDrawableSegments(next);
      }
      v.markForCheck();
    }
    return;
  }
  if (v.awaitingFirstP3) {
    const p = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
    if (p) {
      v.pointerSvg = { x: p.x, y: p.y };
      v.markForCheck();
    }
    return;
  }
  if (v.awaitingColocatedEndpoint) {
    const p = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
    if (p) {
      v.pointerSvg = { x: p.x, y: p.y };
      v.markForCheck();
    }
    return;
  }
  v.pendingCurveAltChord = !!v.pendingSegment && event.altKey;
  v.pendingShiftAngleSnap = !!v.pendingSegment && event.shiftKey;
  if (v.pendingSegment) {
    v.pendingLastClient = { x: event.clientX, y: event.clientY };
  }
  const pt = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
  if (pt) {
    if (v.pendingSegment) {
      v.pendingDragSvg = { x: pt.x, y: pt.y };
      if (v.pendingIsFirstFromMoveto() || v.pendingChordColocated()) {
        v.pointerSvg = { x: pt.x, y: pt.y };
      } else {
        const pend = v.pendingSegment;
        v.pointerSvg = { x: pend.startSvg.x, y: pend.startSvg.y };
      }
    } else {
      v.pointerSvg = { x: pt.x, y: pt.y };
    }
    v.markForCheck();
  }
}

export function onDocumentMouseUpPenForView(v: PenCanvasInputView, event: MouseEvent): void {
  if (v.insertOnPathMutable.drag) {
    v.finishPenInsertOnPathDrag(event);
    return;
  }
  if (v.outgoingHandleDrag) {
    v.finishPenOutgoingHandleDrag();
    return;
  }
  if (v.pendingSegment) {
    v.commitPenPendingSegment(event);
  }
}

export function onCanvasPenPrimaryMouseDownForView(
  v: PenCanvasInputView,
  event: MouseEvent,
  getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null,
  tryBeginInsert: (penTarget: Element, event: MouseEvent) => boolean
): boolean {
  if (!v.ports.isCanvasReadyForPenInput()) return false;
  const outgoingKnob = (event.target as Element | null)?.closest?.('[data-pen-outgoing-handle]');
  if (outgoingKnob && v.isPenSessionActive() && !v.pendingSegment) {
    if (penLastOutgoingHandleSvg(v.penSession.getSegments())) {
      const segs = v.penSession.getSegments();
      const last = segs[segs.length - 1];
      v.outgoingHandleDrag = { segmentIndex: segs.length - 1, before: { ...last } as PenPathSegment };
      return true;
    }
  }
  const penTarget = event.target as Element | null;
  if (penTarget && v.ports.isEditorContentShapeTarget(penTarget)) {
    if (v.penSession.getSegments().length === 0 && !v.pendingSegment) {
      if (v.tryPickUpPenOpenPathContinuation(event)) {
        return true;
      }
      if (tryBeginInsert(penTarget, event)) {
        return true;
      }
    }
    return false;
  }
  const pt = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
  if (!pt) return false;
  handlePenCanvasMouseDownForView(v, event, pt);
  return true;
}
