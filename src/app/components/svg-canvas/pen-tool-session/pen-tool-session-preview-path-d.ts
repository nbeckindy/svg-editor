import {
  appendCubicToD,
  appendLineToD,
  lastCommittedVertex,
  penCubicSmoothReflectP1Usable,
  penCurveStyledAppendToD,
  penDraftFirstSegmentPreviewD,
  penPathOnlyMoveto,
  penPathSegmentsToD,
  penReflectStateAfterCommitted,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

export type PenSessionPreviewPathDInput = {
  penInsertOnPath: boolean;
  currentToolIsPen: boolean;
  isPenSessionActive: boolean;
  segments: readonly PenPathSegment[];
  penPointerSvg: { x: number; y: number } | null;
  penPendingSegment: PenPendingSegmentForPreview | null;
  penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null;
  penAwaitingColocatedSegmentEndpointAfterDraft: boolean;
  penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null;
  penPendingIsFirstSegmentFromMovetoGesture: boolean;
  penPendingChordColocated: boolean;
  penPendingShowsCurvePreview: boolean;
  appendPenPendingCurveToBaseD: (baseD: string) => string;
};

/**
 * Full in-progress pen preview `d` (`M/L/C…`) including committed segments plus the current
 * pending segment to pointer.
 */
export function computePenSessionPreviewPathD(p: PenSessionPreviewPathDInput): string | null {
  if (p.penInsertOnPath) return null;
  if (!p.currentToolIsPen || !p.isPenSessionActive) return null;
  const base = penPathSegmentsToD(p.segments);
  if (!base || !p.penPointerSvg) return base || null;
  const segs = p.segments;
  const ptr = p.penPointerSvg;
  const anchor = p.penPendingSegment?.anchor ?? lastCommittedVertex(segs);
  if (!anchor) return base;

  if (!p.penPendingSegment && p.penFirstAnchorP3Draft && penPathOnlyMoveto(segs)) {
    const m = segs[0];
    if (m.type !== 'M') return base;
    const a = { x: m.x, y: m.y };
    return penDraftFirstSegmentPreviewD(
      segs,
      p.penFirstAnchorP3Draft,
      a,
      ptr,
      ptr,
      a,
      false,
      false,
      false
    );
  }
  if (
    p.penAwaitingColocatedSegmentEndpointAfterDraft &&
    p.penColocatedSegmentEndpointDraft &&
    !penPathOnlyMoveto(segs)
  ) {
    const tip = lastCommittedVertex(segs);
    const d = p.penColocatedSegmentEndpointDraft;
    if (!tip || !d) return base;
    return penDraftFirstSegmentPreviewD(segs, d, tip, ptr, ptr, tip, d.ctrlCurve, d.curveAltChord, d.shiftAngleSnap);
  }

  if (p.penPendingSegment && p.penPendingIsFirstSegmentFromMovetoGesture) {
    return base;
  }
  if (p.penPendingSegment && p.penPendingChordColocated) {
    return base;
  }
  const st = penReflectStateAfterCommitted(segs);
  if (p.penPendingSegment && p.penPendingShowsCurvePreview) {
    return p.appendPenPendingCurveToBaseD(base);
  }
  if (p.penPendingSegment && !p.penPendingShowsCurvePreview) {
    if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
      return appendCubicToD(
        base,
        { x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y, x2: ptr.x, y2: ptr.y },
        ptr
      );
    }
    return appendLineToD(base, ptr.x, ptr.y);
  }
  if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
    return appendCubicToD(
      base,
      { x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y, x2: ptr.x, y2: ptr.y },
      ptr
    );
  }
  return appendLineToD(base, ptr.x, ptr.y);
}

export type PenCurvePreviewPathDInput = {
  penInsertOnPath: boolean;
  currentToolIsPen: boolean;
  penPointerSvg: { x: number; y: number } | null;
  penPendingShowsCurvePreview: boolean;
  segments: readonly PenPathSegment[];
  penPendingSegment: PenPendingSegmentForPreview | null;
  penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null;
  penAwaitingColocatedSegmentEndpointAfterDraft: boolean;
  penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null;
  penPendingIsFirstSegmentFromMovetoGesture: boolean;
  penPendingChordColocated: boolean;
  appendPenPendingCurveToBaseD: (baseD: string) => string;
};

/** Live Bézier preview `d` (committed segments + pending segment: default `C`, Ctrl+drag `Q` / `S` / `T`). */
export function computePenCurvePreviewPathD(p: PenCurvePreviewPathDInput): string | null {
  if (p.penInsertOnPath) return null;
  if (!p.currentToolIsPen || !p.penPointerSvg || !p.penPendingShowsCurvePreview) {
    return null;
  }
  const segs = p.segments;
  const ptr = p.penPointerSvg;
  const base = penPathSegmentsToD(segs);
  if (!p.penPendingSegment && p.penFirstAnchorP3Draft && penPathOnlyMoveto(segs)) {
    const m = segs[0];
    if (m.type !== 'M') return null;
    const a = { x: m.x, y: m.y };
    return penDraftFirstSegmentPreviewD(segs, p.penFirstAnchorP3Draft, a, ptr, ptr, a, false, false, false);
  }
  if (
    p.penAwaitingColocatedSegmentEndpointAfterDraft &&
    p.penColocatedSegmentEndpointDraft &&
    !penPathOnlyMoveto(segs)
  ) {
    const tip = lastCommittedVertex(segs);
    const d = p.penColocatedSegmentEndpointDraft;
    if (!tip || !d) return null;
    return penDraftFirstSegmentPreviewD(segs, d, tip, ptr, ptr, tip, d.ctrlCurve, d.curveAltChord, d.shiftAngleSnap);
  }
  if (p.penPendingSegment && p.penPendingIsFirstSegmentFromMovetoGesture) {
    return null;
  }
  if (p.penPendingSegment && p.penPendingChordColocated) {
    return null;
  }
  if (!p.penPendingSegment) return null;
  return p.appendPenPendingCurveToBaseD(base);
}

export type AppendPenPendingCurveToBaseDInput = {
  baseD: string;
  pending: PenPendingSegmentForPreview;
  segments: readonly PenPathSegment[];
  penPointerSvg: { x: number; y: number } | null;
  penPendingIsFirstSegmentFromMovetoGesture: boolean;
  penPendingChordColocated: boolean;
  curvePreviewEndUserSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
  dragSampleSvg: (pending: Pick<PenPendingSegmentForPreview, 'startSvg'>) => { x: number; y: number };
  penPendingCurveAltChord: boolean;
  penPendingShiftAngleSnap: boolean;
};

/** Append pending curve segment to `baseD` using the same rules as **Pen authoring session** preview commit. */
export function buildPenPendingCurveAppendedBaseD(p: AppendPenPendingCurveToBaseDInput): string {
  const pending = p.pending;
  const ptr = p.penPointerSvg;
  const end =
    p.penPendingIsFirstSegmentFromMovetoGesture && ptr
      ? ptr
      : p.penPendingChordColocated && ptr
        ? ptr
        : p.curvePreviewEndUserSvg(pending);
  const dragCurrent = p.dragSampleSvg(pending);
  const draft = pending.firstSegmentCurveDraft;
  return penCurveStyledAppendToD(p.baseD, {
    anchor: pending.anchor,
    end,
    dragCurrent,
    placementDragStartSvg: draft ? draft.placementDragStartSvg : pending.startSvg,
    ctrlCurve: pending.ctrlCurve,
    curveAltChord: p.penPendingCurveAltChord,
    shiftAngleSnap: p.penPendingShiftAngleSnap,
    segments: p.segments,
    frozenOutgoingP1: draft?.frozenOutgoingP1Svg
  });
}
