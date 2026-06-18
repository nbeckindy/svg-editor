import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { penSvgDistanceSq, type PenFirstAnchorP3Draft } from '../../../models/pen-path';
import {
  PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX,
  PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ
} from './pen-tool-session-constants';

/** Pending segment fields shared by preview / commit paths. */
export type PenPendingSegmentForPreview = {
  anchor: { x: number; y: number };
  startClient: { x: number; y: number };
  startSvg: { x: number; y: number };
  ctrlCurve: boolean;
  /**
   * First `C` from `M` only: frozen handle drag from the initial anchor (not representable in `d` until
   * this segment commits). Absent for all other pending chords.
   */
  firstSegmentCurveDraft?: PenFirstAnchorP3Draft | null;
};

/** Pending segment end `P3` for preview / chord geometry: the mousedown-planted `startSvg` (second anchor). */
export function penPendingEffectiveEndSvg(
  pending: Pick<PenPendingSegmentForPreview, 'startSvg'>
): { x: number; y: number } {
  return { x: pending.startSvg.x, y: pending.startSvg.y };
}

/** Live pointer sample (snapped) for pending handle placement; chord end uses {@link penPendingEffectiveEndSvg}. */
export function penPendingDragSampleSvg(
  pending: Pick<PenPendingSegmentForPreview, 'startSvg'>,
  penPendingDragSvg: { x: number; y: number } | null,
  penPointerSvg: { x: number; y: number } | null
): { x: number; y: number } {
  const p =
    penPendingDragSvg ??
    penPointerSvg ??
    ({ x: pending.startSvg.x, y: pending.startSvg.y } as const);
  return { x: p.x, y: p.y };
}

/**
 * True when the pending segment began on the path close target (within join/close tolerance).
 * For prepend-from-head continuation the close target is the frozen tail, not session `M`.
 */
export function penPendingStartNearPathCloseTarget(
  pending: PenPendingSegmentForPreview | null,
  closeTargetMv: { x: number; y: number } | null,
  endpointsWithinJoinTolerance: (ax: number, ay: number, bx: number, by: number) => boolean
): boolean {
  if (!pending || !closeTargetMv) return false;
  return endpointsWithinJoinTolerance(
    pending.startSvg.x,
    pending.startSvg.y,
    closeTargetMv.x,
    closeTargetMv.y
  );
}

/**
 * True when the pending segment began on the path start (within join/close tolerance in screen space).
 * Enables a scoped curve-preview rule without changing global marquee thresholds.
 */
export function penPendingStartNearPathMoveto(
  pending: PenPendingSegmentForPreview | null,
  pathStartMv: { x: number; y: number } | null,
  committedPathHasVertexBeyondMoveto: boolean,
  endpointsWithinJoinTolerance: (ax: number, ay: number, bx: number, by: number) => boolean
): boolean {
  if (!pending || !pathStartMv) return false;
  if (!committedPathHasVertexBeyondMoveto) return false;
  return endpointsWithinJoinTolerance(pending.startSvg.x, pending.startSvg.y, pathStartMv.x, pathStartMv.y);
}

/** Pending curve preview end vertex: exact `M` when closing from start, else effective segment end. */
export function penPendingCurvePreviewEndSvg(
  pending: PenPendingSegmentForPreview,
  pathStartMv: { x: number; y: number } | null,
  committedPathHasVertexBeyondMoveto: boolean,
  endpointsWithinJoinTolerance: (ax: number, ay: number, bx: number, by: number) => boolean
): { x: number; y: number } {
  if (
    pathStartMv &&
    committedPathHasVertexBeyondMoveto &&
    endpointsWithinJoinTolerance(pending.startSvg.x, pending.startSvg.y, pathStartMv.x, pathStartMv.y)
  ) {
    return { x: pathStartMv.x, y: pathStartMv.y };
  }
  return penPendingEffectiveEndSvg(pending);
}

/**
 * Whether the pending segment should show curve-authoring chrome (Bézier `penCurvePreviewPathD` and/or
 * first-anchor mirrored handles). Uses the global marquee minimum drag constant for normal drags; when closing from start,
 * also allows a smaller screen threshold or a tiny root-SVG drag so users can shape the closing segment without leaving the start ring.
 */
export function computePenPendingShowsCurvePreviewForClose(args: {
  penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null;
  penAwaitingColocatedSegmentEndpointAfterDraft: boolean;
  penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null;
  penPendingSegment: PenPendingSegmentForPreview | null;
  penPendingLastClient: { x: number; y: number } | null;
  penPendingDragSvg: { x: number; y: number } | null;
  penPendingIsFirstSegmentFromMovetoGesture: boolean;
  penPendingChordColocated: boolean;
  penPendingStartNearPathMoveto: boolean;
  penPathStartMv: { x: number; y: number } | null;
  /**
   * When the pending chord began on the close ring, allow the small screen / micro-SVG thresholds so
   * users can shape a closing curve without leaving the ring. Disabled when the path did not start
   * with a cubic leg — then only {@link MARQUEE_MIN_DRAG_PX} (checked above) enables curve preview.
   */
  allowRelaxedCloseRingCurvePreview: boolean;
}): boolean {
  const {
    penFirstAnchorP3Draft,
    penAwaitingColocatedSegmentEndpointAfterDraft,
    penColocatedSegmentEndpointDraft,
    penPendingSegment,
    penPendingLastClient,
    penPendingDragSvg,
    penPendingIsFirstSegmentFromMovetoGesture,
    penPendingChordColocated,
    penPendingStartNearPathMoveto,
    penPathStartMv,
    allowRelaxedCloseRingCurvePreview
  } = args;

  /** Between first-handle mouseup and `P3` mousedown: path is still `M` only; draft is not on `pendingSegment` yet. */
  if (!penPendingSegment && penFirstAnchorP3Draft) return true;
  if (penAwaitingColocatedSegmentEndpointAfterDraft && penColocatedSegmentEndpointDraft) return true;
  if (!penPendingSegment) return false;
  /** First `C` from `M` with frozen outgoing handle: always use Bézier preview (not the straight-chord fallback before marquee). */
  if (penPendingSegment.firstSegmentCurveDraft) return true;
  if (!penPendingLastClient) return false;
  const { startClient, startSvg } = penPendingSegment;
  const lc = penPendingLastClient;
  const screenHyp = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
  if (penPendingIsFirstSegmentFromMovetoGesture && screenHyp >= PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX) {
    return true;
  }
  if (penPendingChordColocated && screenHyp >= PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX) {
    return true;
  }
  if (screenHyp >= MARQUEE_MIN_DRAG_PX) return true;
  if (!penPendingStartNearPathMoveto) return false;
  if (!allowRelaxedCloseRingCurvePreview) return false;
  if (screenHyp >= PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX) return true;
  const dragSvg = penPendingDragSvg;
  const m = penPathStartMv;
  if (dragSvg) {
    if (penSvgDistanceSq(dragSvg, startSvg) > PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ) return true;
    if (m && penSvgDistanceSq(dragSvg, m) > PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ) return true;
  }
  return false;
}
