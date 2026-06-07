import {
  PenSession,
  penPathSegmentsAreValid,
  penRewriteLastSegmentEndToMatchMoveto,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { applyPenFinishedPathDocumentEffects } from './pen-tool-session-finish';
import { PEN_CLOSE_MOVETO_REWRITE_MAX_SQ } from './pen-tool-session-constants';
import { combinePenContinuationSegments, findPenOpenPathFinishJoin } from './pen-tool-session-path-continuation';

export interface TryFinishPenPathView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: PenSession;

  get continuingPathRewrite(): { pathId: string; originalD: string } | null;

  finishOutgoingHandleDrag(): void;
  incompleteFirstSegmentFromEmpty(): boolean;
  incompleteColocatedSegmentEndpointDraft(): boolean;
  showPenFinishFeedback(): void;
  flushPenPendingAsCurrentPointer(): void;
  purgeProvisionalPenSegmentHistory(): void;
  pathStartMv(): { x: number; y: number } | null;
  clearPenFinishFeedback(): void;
  clearDrawingState(): void;
}

export function maybeRewritePenLastSegmentEndToMatchMoveto(
  penSession: PenSession,
  closePath: boolean,
  pathStartMv: () => { x: number; y: number } | null,
  maxSq: number
): void {
  if (!closePath || !penPathSegmentsAreValid(penSession.getSegments()) || !pathStartMv()) return;
  const m0 = pathStartMv()!;
  const rewritten = penRewriteLastSegmentEndToMatchMoveto(penSession.getSegments(), m0, maxSq);
  if (rewritten) {
    penSession.restoreDrawableSegments(rewritten);
  }
}

/**
 * Validates incomplete drafts, flushes pending, optionally rewrites close endpoint vs `M`, finishes path,
 * then applies document effects (continue / join / new path).
 */
export function tryFinishPenPathForView(v: TryFinishPenPathView, closePath: boolean): void {
  v.finishOutgoingHandleDrag();
  if (v.incompleteFirstSegmentFromEmpty() || v.incompleteColocatedSegmentEndpointDraft()) {
    v.showPenFinishFeedback();
    return;
  }
  v.flushPenPendingAsCurrentPointer();
  v.purgeProvisionalPenSegmentHistory();

  maybeRewritePenLastSegmentEndToMatchMoveto(v.penSession, closePath, () => v.pathStartMv(), PEN_CLOSE_MOVETO_REWRITE_MAX_SQ);

  const finishingSegsSnapshot = [...v.penSession.getSegments()] as PenPathSegment[];

  const d = v.penSession.finishPath();
  if (!d) {
    v.showPenFinishFeedback();
    return;
  }
  v.clearPenFinishFeedback();
  const finalClosed = closePath ? `${d} Z` : d;

  applyPenFinishedPathDocumentEffects(v.ports, {
    finalClosed,
    closePath,
    finishingSegsSnapshot,
    continuingPathRewrite: v.continuingPathRewrite,
    findPenOpenPathFinishJoin: (segs) =>
      penPathSegmentsAreValid(segs) ? findPenOpenPathFinishJoin(v.ports, segs) : null,
    combinePenContinuationSegments: (a, b) => combinePenContinuationSegments(a, b),
    clearDrawingState: () => v.clearDrawingState()
  });
}
