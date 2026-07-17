import type { PenSession, PenPathSegment, PenFirstAnchorP3Draft } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { clearPenPendingSegmentFields, type PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';
import type { PenContinuingPathRewrite } from './pen-tool-session-path-continuation';
import type { PenInsertOnPathDragState } from './pen-tool-session-insert-on-path';

/**
 * Mutable pen authoring slice for {@link clearDrawingStateForView}. Implemented by {@link PenToolSession}.
 */
export interface PenDrawingStateClearView {
  readonly ports: PenToolSessionPorts;
  readonly penSession: PenSession;

  isPenSessionActive(): boolean;
  get penPointerSvg(): { x: number; y: number } | null;
  get penPendingSegment(): PenPendingSegmentForPreview | null;
  get penFirstAnchorP3Draft(): PenFirstAnchorP3Draft | null;
  get penAwaitingColocatedSegmentEndpointAfterDraft(): boolean;
  get penPendingDragSvg(): { x: number; y: number } | null;
  get penHoverClientPx(): { x: number; y: number } | null;
  get penContinuingPathRewrite(): PenContinuingPathRewrite | null;
  get penOutgoingHandleDrag(): { segmentIndex: number; before: PenPathSegment } | null;
  get penInsertOnPath(): PenInsertOnPathDragState | null;

  set penPendingSegment(v: PenPendingSegmentForPreview | null);
  set penPendingLastClient(v: { x: number; y: number } | null);
  set penPendingDragSvg(v: { x: number; y: number } | null);
  set penHoverClientPx(v: { x: number; y: number } | null);
  set penContinuingPathRewrite(v: PenContinuingPathRewrite | null);
  set penOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null);
  set penPointerSvg(v: { x: number; y: number } | null);

  set penPendingCurveAltChord(v: boolean);
  set penPendingShiftAngleSnap(v: boolean);

  clearPenInsertOnPathDragState(): void;
  clearPenFirstAnchorAwaitingDraft(): void;
  clearPenColocatedSegmentEndpointDraft(): void;
  purgeProvisionalPenSegmentHistory(): void;
  markForCheck(): void;

  get penFinishFeedbackMessage(): string | null;
  clearPenFinishFeedback(): void;
}

/** Clears in-progress pen model, insert drag, drafts, and optional finish-feedback toast (parity with {@link PenToolSession.clearDrawingState}). */
export function clearDrawingStateForView(v: PenDrawingStateClearView): void {
  const hadPenState =
    v.isPenSessionActive() ||
    v.penPointerSvg !== null ||
    v.penPendingSegment !== null ||
    v.penFirstAnchorP3Draft !== null ||
    v.penAwaitingColocatedSegmentEndpointAfterDraft ||
    v.penPendingDragSvg !== null ||
    v.penHoverClientPx !== null ||
    v.penContinuingPathRewrite !== null ||
    v.penOutgoingHandleDrag !== null ||
    v.penInsertOnPath !== null;
  const hadFeedback = v.penFinishFeedbackMessage !== null;
  if (!hadPenState && !hadFeedback) return;
  if (hadPenState) {
    if (v.penOutgoingHandleDrag) {
      const { segmentIndex, before } = v.penOutgoingHandleDrag;
      v.penSession.replaceSegmentAt(segmentIndex, before);
    }
    clearPenPendingSegmentFields(v);
    v.penHoverClientPx = null;
    v.penContinuingPathRewrite = null;
    v.penOutgoingHandleDrag = null;
    v.clearPenInsertOnPathDragState();
    v.clearPenFirstAnchorAwaitingDraft();
    v.clearPenColocatedSegmentEndpointDraft();
    v.purgeProvisionalPenSegmentHistory();
    v.penSession.reset();
    v.penPointerSvg = null;
  }
  if (hadFeedback) {
    v.clearPenFinishFeedback();
  } else {
    v.markForCheck();
  }
}
