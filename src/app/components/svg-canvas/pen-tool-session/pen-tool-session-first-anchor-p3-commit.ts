import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import {
  lastCommittedVertex,
  penPathOnlyMoveto,
  penSvgDistanceSq,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

/**
 * Mutable slice for {@link tryCommitPenFirstSegmentCurveFromPendingDraftForView}.
 * Implemented privately on {@link PenToolSession}.
 */
export interface PenFirstSegmentFromDraftCommitView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: { getSegments(): readonly PenPathSegment[] };

  pendingResolvedEndForCommit(
    pending: PenPendingSegmentForPreview,
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

  /** After first `C` from `M` + draft: match a normal segment commit — no pending until the next mousedown; pointer at path tip for rubber-band preview to the next vertex. */
  setPointerAfterFirstSegmentDraftCommit(tip: { x: number; y: number }): void;

  clearPendingSegmentFields(): void;
  markForCheck(): void;
}

/**
 * When {@link PenPendingSegmentForPreview.firstSegmentCurveDraft} is set, commit the first `C` from `M`
 * using frozen outgoing `P1` and second-gesture drag for incoming (unless movement is below marquee → zero incoming).
 */
export function tryCommitPenFirstSegmentCurveFromPendingDraftForView(
  v: PenFirstSegmentFromDraftCommitView,
  clientX: number,
  clientY: number,
  _ctrlKey: boolean,
  pendingSeg: PenPendingSegmentForPreview,
  releaseSvg: { x: number; y: number } | null | undefined,
  segs: readonly PenPathSegment[]
): boolean {
  const draft = pendingSeg.firstSegmentCurveDraft;
  if (!draft || !penPathOnlyMoveto(segs) || segs[0]?.type !== 'M') return false;
  const m0 = segs[0];
  if (m0.type !== 'M') return false;
  if (penSvgDistanceSq(pendingSeg.anchor, { x: m0.x, y: m0.y }) >= 1e-12) return false;

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
  v.setPointerAfterFirstSegmentDraftCommit(tip);
  v.markForCheck();
  return true;
}
