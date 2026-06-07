import {
  lastCommittedVertex,
  penCubicSmoothReflectP1Usable,
  penLastOutgoingHandleSvg,
  penPathSegmentsAreValid,
  penReflectStateAfterCommitted,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenOverlayPorts } from './pen-tool-session-overlay';
import { penSvgUserPointToOverlayPixel, penSvgUserSegmentToOverlayLine } from './pen-tool-session-overlay';

export function computePenCommittedOutgoingHandleSvg(p: {
  currentToolIsPen: boolean;
  isPenSessionActive: boolean;
  penPointerSvg: { x: number; y: number } | null;
  penPendingShowsCurvePreview: boolean;
  segments: readonly PenPathSegment[];
}): { anchorX: number; anchorY: number; hx: number; hy: number } | null {
  if (!p.currentToolIsPen || !p.isPenSessionActive || !p.penPointerSvg) {
    return null;
  }
  if (p.penPendingShowsCurvePreview) return null;
  return penLastOutgoingHandleSvg(p.segments);
}

export function computePenRubberBandOverlay(p: {
  ports: PenOverlayPorts;
  currentToolIsPen: boolean;
  isPenSessionActive: boolean;
  penPointerSvg: { x: number; y: number } | null;
  penPendingShowsCurvePreview: boolean;
  hasPendingSegment: boolean;
  penPendingIsFirstSegmentFromMovetoGesture: boolean;
  penPendingChordColocated: boolean;
  segments: readonly PenPathSegment[];
}): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!p.isPenSessionActive || !p.penPointerSvg || !p.currentToolIsPen) {
    return null;
  }
  if (p.penPendingShowsCurvePreview) return null;
  if (p.hasPendingSegment && p.penPendingIsFirstSegmentFromMovetoGesture) {
    return null;
  }
  if (p.hasPendingSegment && p.penPendingChordColocated) {
    return null;
  }
  if (p.hasPendingSegment) {
    return null;
  }
  {
    const segs = p.segments;
    const lvRb = lastCommittedVertex(segs);
    const stRb = penReflectStateAfterCommitted(segs);
    if (lvRb && penCubicSmoothReflectP1Usable(stRb, lvRb)) return null;
  }
  const anchor = lastCommittedVertex(p.segments);
  if (!anchor) return null;
  return penSvgUserSegmentToOverlayLine(
    p.ports,
    anchor.x,
    anchor.y,
    p.penPointerSvg.x,
    p.penPointerSvg.y
  );
}

export function computePenCloseTargetHoverOverlay(p: {
  ports: PenOverlayPorts;
  currentToolIsPen: boolean;
  isPenSessionActive: boolean;
  penHoverClientPx: { x: number; y: number } | null;
  segments: readonly PenPathSegment[];
  penCommittedPathHasVertexBeyondMoveto: boolean;
  isPenPointerWithinCloseRadius: (clientX: number, clientY: number) => boolean;
}): { cx: number; cy: number } | null {
  if (!p.currentToolIsPen || !p.isPenSessionActive || !p.penHoverClientPx) {
    return null;
  }
  const segs = p.segments;
  if (!penPathSegmentsAreValid(segs)) return null;
  const first = segs[0];
  if (first.type !== 'M') return null;
  if (!p.penCommittedPathHasVertexBeyondMoveto) return null;
  if (!p.isPenPointerWithinCloseRadius(p.penHoverClientPx.x, p.penHoverClientPx.y)) return null;
  const o = penSvgUserPointToOverlayPixel(p.ports, first.x, first.y);
  return { cx: o.x, cy: o.y };
}
