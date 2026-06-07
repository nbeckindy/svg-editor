import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { lastCommittedVertex, penPathOnlyMoveto, penSvgDistanceSq, type PenPathSegment } from '../../../models/pen-path';
import type { PenFirstAnchorP3Draft } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';

export type PenCommittedP3PendingSeg = {
  anchor: { x: number; y: number };
  startClient: { x: number; y: number };
  startSvg: { x: number; y: number };
  ctrlCurve: boolean;
};

/**
 * Mutable slice + delegates for {@link commitPenCommittedFirstSegmentP3IfApplicableForView}.
 * Built privately on {@link PenToolSession}.
 */
export interface PenCommittedFirstSegmentP3CommitView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: { getSegments(): readonly PenPathSegment[] };

  get committedFirstP3Draft(): PenFirstAnchorP3Draft | null;
  clearCommittedFirstP3Draft(): void;

  pendingResolvedEndForCommit(
    pending: PenCommittedP3PendingSeg,
    releaseSvg: { x: number; y: number } | null | undefined
  ): { x: number; y: number };

  get pendingDragSvg(): { x: number; y: number } | null;
  get pointerSvg(): { x: number; y: number } | null;

  setPendingCurveAltChord(v: boolean): void;
  setPendingShiftAngleSnap(v: boolean): void;

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

  /** After first `C` is committed from `M` + committed-P3 draft: start the next pending segment at `tip`. */
  plantPendingChordAfterFirstP3Commit(
    clientX: number,
    clientY: number,
    ctrlKey: boolean,
    tip: { x: number; y: number }
  ): void;

  clearPendingSegmentFields(): void;
  markForCheck(): void;
}

/**
 * When {@link PenCommittedFirstSegmentP3CommitView.committedFirstP3Draft} is set, commit the first `C` from `M`
 * using frozen outgoing `P1` and second-gesture drag for incoming (unless movement is below marquee → zero incoming).
 */
export function commitPenCommittedFirstSegmentP3IfApplicableForView(
  v: PenCommittedFirstSegmentP3CommitView,
  clientX: number,
  clientY: number,
  ctrlKey: boolean,
  pendingSeg: PenCommittedP3PendingSeg,
  releaseSvg: { x: number; y: number } | null | undefined,
  segs: readonly PenPathSegment[]
): boolean {
  const draft = v.committedFirstP3Draft;
  if (!draft || !penPathOnlyMoveto(segs) || segs[0]?.type !== 'M') return false;
  const m0 = segs[0];
  if (m0.type !== 'M') return false;
  if (penSvgDistanceSq(pendingSeg.anchor, { x: m0.x, y: m0.y }) >= 1e-12) return false;

  v.clearCommittedFirstP3Draft();
  const resolvedEnd = v.pendingResolvedEndForCommit(pendingSeg, releaseSvg ?? undefined);
  const dragCurrent = releaseSvg ?? v.pendingDragSvg ?? v.pointerSvg ?? pendingSeg.startSvg;
  const screenDist = Math.hypot(clientX - pendingSeg.startClient.x, clientY - pendingSeg.startClient.y);
  const zeroIn = screenDist < MARQUEE_MIN_DRAG_PX;

  v.setPendingCurveAltChord(draft.curveAltChord);
  v.setPendingShiftAngleSnap(draft.shiftAngleSnap);
  v.commitDraggedCurve(
    { x: m0.x, y: m0.y },
    resolvedEnd,
    dragCurrent,
    pendingSeg.ctrlCurve,
    undefined,
    draft.placementDragStartSvg,
    draft.frozenOutgoingP1Svg,
    zeroIn
  );
  v.setPendingCurveAltChord(false);
  v.setPendingShiftAngleSnap(false);

  v.clearPendingSegmentFields();

  const tip = lastCommittedVertex(v.penSession.getSegments()) ?? resolvedEnd;
  v.plantPendingChordAfterFirstP3Commit(clientX, clientY, ctrlKey, tip);
  v.markForCheck();
  return true;
}
