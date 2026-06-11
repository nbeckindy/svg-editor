import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import {
  PenSession,
  lastCommittedVertex,
  penCubicSmoothReflectP1Usable,
  penFirstAnchorMirroredHandleControlsFromDrag,
  penPathSegmentsAreValid,
  penReflectStateAfterCommitted,
  penStartingLegIsCubic,
  penSvgDistanceSq,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

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
  pendingShowsCurvePreview(): boolean;
  pendingMousedownInCloseRadius(): boolean;
  pendingResolvedEndForCommit(
    pending: PenPendingSegmentForPreview,
    releaseSvg: { x: number; y: number } | null | undefined
  ): { x: number; y: number };
  pendingIsFirstFromMoveto(): boolean;
  pendingChordColocated(): boolean;
  pendingStartNearPathMoveto(): boolean;
  pendingCubicAltEndOnly(): boolean;

  clearFirstAnchorAwaitingDraft(): void;

  get colocatedDraft(): PenFirstAnchorP3Draft | null;
  set colocatedDraft(v: PenFirstAnchorP3Draft | null);
  get awaitingColocatedEndpoint(): boolean;
  set awaitingColocatedEndpoint(v: boolean);

  get firstAnchorP3Draft(): PenFirstAnchorP3Draft | null;
  set firstAnchorP3Draft(v: PenFirstAnchorP3Draft | null);
  get awaitingFirstSegmentP3AfterDraft(): boolean;
  set awaitingFirstSegmentP3AfterDraft(v: boolean);

  commitFirstSegmentP3IfApplicable(
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

export function commitPenPendingSegmentForView(v: PenPendingCommitView, event: MouseEvent): void {
  if (!v.pendingSegment) return;

  if (penPathSegmentsAreValid(v.penSession.getSegments()) && v.pendingMousedownInCloseRadius()) {
    const m = v.pathStartMv();
    if (m && v.pendingShowsCurvePreview() && v.pendingSegment) {
      const releaseSvg =
        v.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ??
        v.pendingDragSvg ??
        v.pendingSegment.startSvg;
      const pending = v.pendingSegment;
      v.pendingSegment = null;
      v.pendingLastClient = null;
      v.pendingDragSvg = null;
      v.pendingCurveAltChord = false;
      v.pendingShiftAngleSnap = false;
      v.commitDraggedCurve(pending.anchor, pending.startSvg, releaseSvg, pending.ctrlCurve, m);
      v.tryFinishPath(true);
      return;
    }
    if (v.pendingSegment && m) {
      const pending = v.pendingSegment;
      const releaseSvg =
        v.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ?? v.pendingDragSvg ?? pending.startSvg;
      v.pendingSegment = null;
      v.pendingLastClient = null;
      v.pendingDragSvg = null;
      v.pendingCurveAltChord = false;
      v.pendingShiftAngleSnap = false;
      const { anchor, startSvg } = pending;
      if (penSvgDistanceSq(anchor, m) > 1e-12) {
        const committed = v.penSession.getSegments();
        if (penStartingLegIsCubic(committed)) {
          v.commitDraggedCurve(anchor, startSvg, releaseSvg, pending.ctrlCurve, m);
        } else {
          v.penSession.addLinePoint(m.x, m.y);
        }
      }
      v.tryFinishPath(true);
      return;
    }
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    v.tryFinishPath(true);
    return;
  }

  const pendingSeg = v.pendingSegment;
  const { anchor, startClient, startSvg } = pendingSeg;
  const releaseSvg = v.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
  const segsForP3 = v.penSession.getSegments();
  if (
    v.commitFirstSegmentP3IfApplicable(
      event.clientX,
      event.clientY,
      event.ctrlKey,
      pendingSeg,
      releaseSvg,
      segsForP3
    )
  ) {
    return;
  }
  const resolvedEnd = v.pendingResolvedEndForCommit(pendingSeg, releaseSvg);
  const dragCurrent = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
  const placementDrag =
    v.pendingIsFirstFromMoveto() || v.pendingChordColocated() ? startSvg : undefined;

  if (v.pendingIsFirstFromMoveto()) {
    const screenDist0 = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
    if (screenDist0 < MARQUEE_MIN_DRAG_PX) {
      v.clearFirstAnchorAwaitingDraft();
      v.pendingSegment = null;
      v.pendingLastClient = null;
      v.pendingDragSvg = null;
      v.pendingCurveAltChord = false;
      v.pendingShiftAngleSnap = false;
      v.pointerSvg = { x: anchor.x, y: anchor.y };
      v.markForCheck();
      return;
    }
  }

  if (
    !v.pendingIsFirstFromMoveto() &&
    penSvgDistanceSq(anchor, startSvg) < 1e-12 &&
    penSvgDistanceSq(anchor, resolvedEnd) < 1e-12 &&
    Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) < MARQUEE_MIN_DRAG_PX &&
    !v.pendingShowsCurvePreview()
  ) {
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    v.markForCheck();
    return;
  }
  if (v.pendingChordColocated() && v.pendingShowsCurvePreview()) {
    const freezeDrag = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
    const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
      { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y },
      freezeDrag,
      v.pendingShiftAngleSnap
    );
    v.colocatedDraft = {
      placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
      dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
      ctrlCurve: pendingSeg.ctrlCurve,
      curveAltChord: v.pendingCurveAltChord,
      shiftAngleSnap: v.pendingShiftAngleSnap,
      frozenOutgoingP1Svg: v.pendingCubicAltEndOnly() ? undefined : { x: mirrored.x1, y: mirrored.y1 }
    };
    v.awaitingColocatedEndpoint = true;
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    const tip = lastCommittedVertex(v.penSession.getSegments());
    if (tip) {
      v.pointerSvg = { x: tip.x, y: tip.y };
    }
    v.markForCheck();
    return;
  }
  if (v.pendingIsFirstFromMoveto() && v.pendingShowsCurvePreview()) {
    const freezeDrag = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
    const anchorMv = { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y };
    const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
      anchorMv,
      freezeDrag,
      v.pendingShiftAngleSnap
    );
    v.firstAnchorP3Draft = {
      placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
      dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
      ctrlCurve: pendingSeg.ctrlCurve,
      curveAltChord: v.pendingCurveAltChord,
      shiftAngleSnap: v.pendingShiftAngleSnap,
      frozenOutgoingP1Svg: v.pendingCubicAltEndOnly() ? undefined : { x: mirrored.x1, y: mirrored.y1 }
    };
    v.awaitingFirstSegmentP3AfterDraft = true;
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    v.markForCheck();
    return;
  }
  const screenDist = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
  const end = resolvedEnd;
  const ctrl = v.pendingSegment.ctrlCurve;
  if (screenDist < MARQUEE_MIN_DRAG_PX) {
    const segs = v.penSession.getSegments();
    const st = penReflectStateAfterCommitted(segs);
    const mClose = v.pathStartMv();
    if (v.pendingStartNearPathMoveto() && mClose) {
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
    const mClose = v.pathStartMv();
    if (v.pendingStartNearPathMoveto() && mClose) {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, mClose, placementDrag);
    } else {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, undefined, placementDrag);
    }
  }
  v.pendingSegment = null;
  v.pendingLastClient = null;
  v.pendingDragSvg = null;
  v.pendingCurveAltChord = false;
  v.pendingShiftAngleSnap = false;
  const lvAfter = lastCommittedVertex(v.penSession.getSegments());
  if (lvAfter) v.pointerSvg = { x: lvAfter.x, y: lvAfter.y };
  v.markForCheck();
}

export function flushPenPendingAsCurrentPointerForView(v: PenPendingCommitView): void {
  if (!v.pendingSegment || !v.pointerSvg) {
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    return;
  }
  const pendingSeg = v.pendingSegment;
  const { anchor, startClient, startSvg } = pendingSeg;
  const resolvedEnd = v.pendingResolvedEndForCommit(pendingSeg, null);
  const placementDrag =
    v.pendingIsFirstFromMoveto() || v.pendingChordColocated() ? startSvg : undefined;

  const segsFlush = v.penSession.getSegments();
  const lcP3 = v.pendingLastClient ?? startClient;
  if (v.commitFirstSegmentP3IfApplicable(lcP3.x, lcP3.y, false, pendingSeg, null, segsFlush)) {
    return;
  }

  if (v.pendingIsFirstFromMoveto()) {
    const lc0 = v.pendingLastClient ?? startClient;
    const screenDist0 = Math.hypot(lc0.x - startClient.x, lc0.y - startClient.y);
    if (screenDist0 < MARQUEE_MIN_DRAG_PX) {
      v.pendingSegment = null;
      v.pendingLastClient = null;
      v.pendingDragSvg = null;
      v.pendingCurveAltChord = false;
      v.pendingShiftAngleSnap = false;
      return;
    }
  }

  if (
    !v.pendingIsFirstFromMoveto() &&
    penSvgDistanceSq(anchor, startSvg) < 1e-12 &&
    penSvgDistanceSq(anchor, resolvedEnd) < 1e-12 &&
    Math.hypot((v.pendingLastClient ?? startClient).x - startClient.x, (v.pendingLastClient ?? startClient).y - startClient.y) <
      MARQUEE_MIN_DRAG_PX &&
    !v.pendingShowsCurvePreview()
  ) {
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    return;
  }
  if (v.pendingChordColocated() && v.pendingShowsCurvePreview()) {
    const freezeDrag = v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
    const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
      { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y },
      freezeDrag,
      v.pendingShiftAngleSnap
    );
    v.colocatedDraft = {
      placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
      dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
      ctrlCurve: pendingSeg.ctrlCurve,
      curveAltChord: v.pendingCurveAltChord,
      shiftAngleSnap: v.pendingShiftAngleSnap,
      frozenOutgoingP1Svg: v.pendingCubicAltEndOnly() ? undefined : { x: mirrored.x1, y: mirrored.y1 }
    };
    v.awaitingColocatedEndpoint = true;
    v.pendingSegment = null;
    v.pendingLastClient = null;
    v.pendingDragSvg = null;
    v.pendingCurveAltChord = false;
    v.pendingShiftAngleSnap = false;
    const tip = lastCommittedVertex(v.penSession.getSegments());
    if (tip) {
      v.pointerSvg = { x: tip.x, y: tip.y };
    }
    v.markForCheck();
    return;
  }
  const lc = v.pendingLastClient ?? startClient;
  const screenDist = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
  const dragCurrent = v.pendingDragSvg ?? v.pointerSvg ?? startSvg;
  const end = resolvedEnd;
  const ctrl = v.pendingSegment.ctrlCurve;
  if (screenDist < MARQUEE_MIN_DRAG_PX) {
    const segs = v.penSession.getSegments();
    const st = penReflectStateAfterCommitted(segs);
    const mClose = v.pathStartMv();
    if (v.pendingStartNearPathMoveto() && mClose) {
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
    const mClose = v.pathStartMv();
    if (v.pendingStartNearPathMoveto() && mClose) {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, mClose, placementDrag);
    } else {
      v.commitDraggedCurve(anchor, resolvedEnd, dragCurrent, ctrl, undefined, placementDrag);
    }
  }
  v.pendingSegment = null;
  v.pendingLastClient = null;
  v.pendingDragSvg = null;
  v.pendingCurveAltChord = false;
  v.pendingShiftAngleSnap = false;
  const lvFlush = lastCommittedVertex(v.penSession.getSegments());
  if (lvFlush) v.pointerSvg = { x: lvFlush.x, y: lvFlush.y };
  v.markForCheck();
}
