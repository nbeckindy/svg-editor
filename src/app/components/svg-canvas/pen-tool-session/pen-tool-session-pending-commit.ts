import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { PEN_CLOSE_CURVE_PREVIEW_RELEASE_NEAR_MOVETO_MAX_SQ } from './pen-tool-session-constants';
import {
  PenSession,
  lastCommittedVertex,
  penCubicSmoothReflectP1Usable,
  penFirstAnchorMirroredHandleControlsFromDrag,
  penCloseNoPreviewDragCurrentForOpenExplicitC,
  penLastDrawableOutgoingCubicHandlePresentAtTip,
  penLastIncomingSegmentIsCubicCurved,
  penPathSegmentsAreValid,
  penReflectStateAfterCommitted,
  penStartingLegIsCubic,
  penSvgDistanceSq,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { clearPendingSegmentFields, type PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

/**
 * Mutable pen draft slice + delegates for {@link commitPenPendingSegmentForView} /
 * {@link flushPenPendingAsCurrentPointerForView}. Built by {@link PenToolSession} via a private factory.
 */
export interface PenPendingCommitView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: PenSession;

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

  pathStartMv(): { x: number; y: number } | null;
  pathCloseTargetMv(): { x: number; y: number } | null;
  pendingShowsCurvePreview(): boolean;
  pendingMousedownInCloseRadius(): boolean;
  pendingResolvedEndForCommit(
    pending: PenPendingSegmentForPreview,
    releaseSvg: { x: number; y: number } | null | undefined
  ): { x: number; y: number };
  pendingIsFirstFromMoveto(): boolean;
  pendingChordColocated(): boolean;
  pendingStartNearPathMoveto(): boolean;
  pendingStartNearPathCloseTarget(): boolean;
  pendingCubicAltEndOnly(): boolean;
  isPrependContinuationCloseAtFrozenTail(): boolean;
  isPointerWithinCloseRadius(clientX: number, clientY: number): boolean;

  clearFirstAnchorAwaitingDraft(): void;

  get colocatedDraft(): PenFirstAnchorP3Draft | null;
  set colocatedDraft(v: PenFirstAnchorP3Draft | null);
  get awaitingColocatedEndpoint(): boolean;
  set awaitingColocatedEndpoint(v: boolean);

  get firstAnchorP3Draft(): PenFirstAnchorP3Draft | null;
  set firstAnchorP3Draft(v: PenFirstAnchorP3Draft | null);

  tryCommitFirstSegmentCurveFromPendingDraft(
    clientX: number,
    clientY: number,
    ctrlKey: boolean,
    pendingSeg: PenPendingSegmentForPreview,
    releaseSvg: { x: number; y: number } | null | undefined,
    segs: readonly PenPathSegment[]
  ): boolean;

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

  tryFinishPath(closePath: boolean): void;
  markForCheck(): void;
}

type PendingSegmentPointerSample = Pick<MouseEvent, 'clientX' | 'clientY'>;

type ResolveAndCommitPendingSegmentOpts = {
  /** Mouseup restores pointer at anchor and clears first-anchor draft on zero-drag first `M` segment. */
  firstMovetoZeroDragCancel: 'mouseup' | 'flush';
  /** Mouseup calls {@link PenPendingCommitView.markForCheck} after colocated zero-drag cancel. */
  markForCheckOnColocatedZeroDragCancel: boolean;
  /** Mouseup-only: freeze first-segment curve draft after handle drag. */
  freezeFirstAnchorCurveDraft: boolean;
};

function shouldSnapPendingSegmentEndToCloseTarget(
  v: PenPendingCommitView,
  pointer: PendingSegmentPointerSample
): boolean {
  if (!v.pathCloseTargetMv()) return false;
  if (v.pendingStartNearPathMoveto() || v.pendingStartNearPathCloseTarget()) return true;
  return v.isPrependContinuationCloseAtFrozenTail() && v.isPointerWithinCloseRadius(pointer.clientX, pointer.clientY);
}

function freezeCurveDraftFromPendingDrag(
  pendingSeg: PenPendingSegmentForPreview,
  startSvg: { x: number; y: number },
  freezeDrag: { x: number; y: number },
  v: PenPendingCommitView
): PenFirstAnchorP3Draft {
  const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
    { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y },
    freezeDrag,
    v.pendingShiftAngleSnap
  );
  return {
    placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
    dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
    ctrlCurve: pendingSeg.ctrlCurve,
    curveAltChord: v.pendingCurveAltChord,
    shiftAngleSnap: v.pendingShiftAngleSnap,
    frozenOutgoingP1Svg: v.pendingCubicAltEndOnly() ? undefined : { x: mirrored.x1, y: mirrored.y1 }
  };
}

function commitPendingSegmentDragToSession(
  v: PenPendingCommitView,
  args: {
    anchor: { x: number; y: number };
    resolvedEnd: { x: number; y: number };
    startSvg: { x: number; y: number };
    dragCurrent: { x: number; y: number };
    ctrl: boolean;
    placementDrag: { x: number; y: number } | undefined;
    pointer: PendingSegmentPointerSample;
    screenDist: number;
  }
): void {
  const { anchor, resolvedEnd, startSvg, dragCurrent, ctrl, placementDrag, pointer, screenDist } = args;
  const end = resolvedEnd;
  if (screenDist < MARQUEE_MIN_DRAG_PX) {
    const segs = v.penSession.getSegments();
    const st = penReflectStateAfterCommitted(segs);
    const mClose = v.pathCloseTargetMv();
    if (shouldSnapPendingSegmentEndToCloseTarget(v, pointer) && mClose) {
      const dragCurrentClose = v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrentClose, ctrl, mClose, placementDrag);
    } else if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
      v.penSession.appendCubic(
        2 * anchor.x - st.cubicCp2X,
        2 * anchor.y - st.cubicCp2Y,
        end.x,
        end.y,
        end.x,
        end.y
      );
    } else {
      v.penSession.addLinePoint(end.x, end.y);
    }
  } else {
    const mClose = v.pathCloseTargetMv();
    if (shouldSnapPendingSegmentEndToCloseTarget(v, pointer) && mClose) {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, mClose, placementDrag);
    } else {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, undefined, placementDrag);
    }
  }
}

function tryCommitPendingSegmentCloseFromStart(v: PenPendingCommitView, event: MouseEvent): boolean {
  if (!penPathSegmentsAreValid(v.penSession.getSegments()) || !v.pendingMousedownInCloseRadius()) {
    return false;
  }
  const closeTarget = v.pathCloseTargetMv();
  if (closeTarget && v.pendingShowsCurvePreview() && v.pendingSegment) {
    const releaseSvg =
      v.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ??
      v.pendingDragSvg ??
      v.pendingSegment.startSvg;
    const pending = v.pendingSegment;
    clearPendingSegmentFields(v);
    const committed = v.penSession.getSegments();
    const dragClose =
      committed.length >= 2 && committed[1]!.type === 'C'
        ? penCloseNoPreviewDragCurrentForOpenExplicitC(
            committed,
            closeTarget,
            releaseSvg,
            PEN_CLOSE_CURVE_PREVIEW_RELEASE_NEAR_MOVETO_MAX_SQ
          )
        : releaseSvg;
    v.commitDraggedCurve(pending.anchor, pending.startSvg, dragClose, pending.ctrlCurve, closeTarget);
    v.tryFinishPath(true);
    return true;
  }
  if (v.pendingSegment && closeTarget) {
    const pending = v.pendingSegment;
    const releaseSvg =
      v.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ?? v.pendingDragSvg ?? pending.startSvg;
    const { anchor, startClient, startSvg } = pending;
    const committed = v.penSession.getSegments();
    const closeClickWithoutDrag =
      Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) < MARQUEE_MIN_DRAG_PX;

    clearPendingSegmentFields(v);

    if (penSvgDistanceSq(anchor, closeTarget) > 1e-12) {
      if (closeClickWithoutDrag) {
        if (penLastDrawableOutgoingCubicHandlePresentAtTip(committed)) {
          /**
           * `P2 === closeTarget` so the closing segment’s incoming handle sits on the close vertex (not a
           * symmetric chord-third interior point from zero drag at the target).
           */
          v.commitDraggedCurve(anchor, startSvg, closeTarget, pending.ctrlCurve, closeTarget, undefined, undefined, true);
        } else {
          v.penSession.addLinePoint(closeTarget.x, closeTarget.y);
        }
      } else if (penStartingLegIsCubic(committed) || penLastIncomingSegmentIsCubicCurved(committed)) {
        const dragClose =
          committed.length >= 2 && committed[1]!.type === 'C'
            ? penCloseNoPreviewDragCurrentForOpenExplicitC(committed, closeTarget, releaseSvg)
            : releaseSvg;
        v.commitDraggedCurve(anchor, startSvg, dragClose, pending.ctrlCurve, closeTarget);
      } else {
        v.penSession.addLinePoint(closeTarget.x, closeTarget.y);
      }
    }
    v.tryFinishPath(true);
    return true;
  }
  clearPendingSegmentFields(v);
  v.tryFinishPath(true);
  return true;
}

/**
 * Shared pending-segment resolve + commit path for mouseup ({@link commitPenPendingSegmentForView})
 * and Enter/finish flush ({@link flushPenPendingAsCurrentPointerForView}).
 */
function resolveAndCommitPendingSegment(
  v: PenPendingCommitView,
  pendingSeg: PenPendingSegmentForPreview,
  pointer: PendingSegmentPointerSample,
  releaseSvg: { x: number; y: number } | null | undefined,
  ctrlKey: boolean,
  opts: ResolveAndCommitPendingSegmentOpts
): void {
  const { anchor, startClient, startSvg } = pendingSeg;
  const segs = v.penSession.getSegments();
  if (
    v.tryCommitFirstSegmentCurveFromPendingDraft(
      pointer.clientX,
      pointer.clientY,
      ctrlKey,
      pendingSeg,
      releaseSvg,
      segs
    )
  ) {
    return;
  }

  const resolvedEnd = v.pendingResolvedEndForCommit(pendingSeg, releaseSvg);
  const placementDrag =
    v.pendingIsFirstFromMoveto() || v.pendingChordColocated() ? startSvg : undefined;

  if (v.pendingIsFirstFromMoveto()) {
    const screenDist0 = Math.hypot(pointer.clientX - startClient.x, pointer.clientY - startClient.y);
    if (screenDist0 < MARQUEE_MIN_DRAG_PX) {
      if (opts.firstMovetoZeroDragCancel === 'mouseup') {
        v.clearFirstAnchorAwaitingDraft();
        clearPendingSegmentFields(v);
        v.pointerSvg = { x: anchor.x, y: anchor.y };
        v.markForCheck();
      } else {
        clearPendingSegmentFields(v);
      }
      return;
    }
  }

  if (
    !v.pendingIsFirstFromMoveto() &&
    penSvgDistanceSq(anchor, startSvg) < 1e-12 &&
    penSvgDistanceSq(anchor, resolvedEnd) < 1e-12 &&
    Math.hypot(pointer.clientX - startClient.x, pointer.clientY - startClient.y) < MARQUEE_MIN_DRAG_PX &&
    !v.pendingShowsCurvePreview()
  ) {
    clearPendingSegmentFields(v);
    if (opts.markForCheckOnColocatedZeroDragCancel) {
      v.markForCheck();
    }
    return;
  }

  if (v.pendingChordColocated() && v.pendingShowsCurvePreview()) {
    const freezeDrag = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
    v.colocatedDraft = freezeCurveDraftFromPendingDrag(pendingSeg, startSvg, freezeDrag, v);
    v.awaitingColocatedEndpoint = true;
    clearPendingSegmentFields(v);
    const tip = lastCommittedVertex(v.penSession.getSegments());
    if (tip) {
      v.pointerSvg = { x: tip.x, y: tip.y };
    }
    v.markForCheck();
    return;
  }

  if (opts.freezeFirstAnchorCurveDraft && v.pendingIsFirstFromMoveto() && v.pendingShowsCurvePreview()) {
    const freezeDrag = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
    v.firstAnchorP3Draft = freezeCurveDraftFromPendingDrag(pendingSeg, startSvg, freezeDrag, v);
    clearPendingSegmentFields(v);
    v.markForCheck();
    return;
  }

  const screenDist = Math.hypot(pointer.clientX - startClient.x, pointer.clientY - startClient.y);
  const dragCurrent = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
  commitPendingSegmentDragToSession(v, {
    anchor,
    resolvedEnd,
    startSvg,
    dragCurrent,
    ctrl: pendingSeg.ctrlCurve,
    placementDrag,
    pointer,
    screenDist
  });
  clearPendingSegmentFields(v);
  const tip = lastCommittedVertex(v.penSession.getSegments());
  if (tip) {
    v.pointerSvg = { x: tip.x, y: tip.y };
  }
  v.markForCheck();
}

export function commitPenPendingSegmentForView(v: PenPendingCommitView, event: MouseEvent): void {
  if (!v.pendingSegment) return;
  if (tryCommitPendingSegmentCloseFromStart(v, event)) return;

  resolveAndCommitPendingSegment(v, v.pendingSegment, event, v.ports.clientToEditorSvgPoint(event.clientX, event.clientY), event.ctrlKey, {
    firstMovetoZeroDragCancel: 'mouseup',
    markForCheckOnColocatedZeroDragCancel: true,
    freezeFirstAnchorCurveDraft: true
  });
}

export function flushPenPendingAsCurrentPointerForView(v: PenPendingCommitView): void {
  if (!v.pendingSegment || !v.pointerSvg) {
    clearPendingSegmentFields(v);
    return;
  }
  const pendingSeg = v.pendingSegment;
  const pointerClient = v.pendingLastClient ?? pendingSeg.startClient;
  resolveAndCommitPendingSegment(
    v,
    pendingSeg,
    { clientX: pointerClient.x, clientY: pointerClient.y },
    null,
    false,
    {
      firstMovetoZeroDragCancel: 'flush',
      markForCheckOnColocatedZeroDragCancel: false,
      freezeFirstAnchorCurveDraft: false
    }
  );
}
