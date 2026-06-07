import { lastCommittedVertex, penPathOnlyMoveto, type PenPathSegment } from '../../../models/pen-path';
import type { PenFirstAnchorP3Draft } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

/**
 * Narrow surface for {@link tryPenBackspaceShortcutForView}. Implemented by {@link PenToolSession}.
 */
export interface PenBackspaceShortcutView {
  readonly ports: Pick<PenToolSessionPorts, 'getCurrentTool' | 'penBackspaceShortcutShouldDefer' | 'markForCheck'>;
  readonly penSession: {
    getSegments(): readonly PenPathSegment[];
    replaceSegmentAt(index: number, seg: PenPathSegment): void;
    popLastCommittedSegment(): 'none' | 'cleared' | 'popped';
  };

  isPenSessionActive(): boolean;

  get penOutgoingHandleDrag(): { segmentIndex: number; before: PenPathSegment } | null;
  set penOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null);

  get penAwaitingColocatedSegmentEndpointAfterDraft(): boolean;
  clearPenColocatedSegmentEndpointDraft(): void;

  get penCommittedFirstSegmentP3Draft(): PenFirstAnchorP3Draft | null;
  get penPendingSegment(): PenPendingSegmentForPreview | null;
  clearPenCommittedFirstSegmentP3Draft(): void;

  set penPendingSegment(v: PenPendingSegmentForPreview | null);
  set penPendingLastClient(v: { x: number; y: number } | null);
  set penPendingDragSvg(v: { x: number; y: number } | null);
  set penPendingCurveAltChord(v: boolean);
  set penPendingShiftAngleSnap(v: boolean);

  set penFirstAnchorP3Draft(v: PenFirstAnchorP3Draft | null);
  set penAwaitingFirstSegmentP3AfterDraft(v: boolean);

  get penAwaitingFirstSegmentP3AfterDraft(): boolean;
  clearPenFirstAnchorAwaitingDraft(): void;

  set penPointerSvg(v: { x: number; y: number } | null);

  clearDrawingState(): void;
}

/** Pen tool: Backspace pops last committed anchor; cancels in-progress segment first. */
export function tryPenBackspaceShortcutForView(v: PenBackspaceShortcutView): boolean {
  if (v.ports.getCurrentTool() !== 'pen' || !v.isPenSessionActive()) return false;
  if (v.ports.penBackspaceShortcutShouldDefer()) return false;

  if (v.penOutgoingHandleDrag) {
    const { segmentIndex, before } = v.penOutgoingHandleDrag;
    v.penOutgoingHandleDrag = null;
    v.penSession.replaceSegmentAt(segmentIndex, before);
    v.ports.markForCheck();
    return true;
  }

  if (v.penAwaitingColocatedSegmentEndpointAfterDraft) {
    v.clearPenColocatedSegmentEndpointDraft();
    const anchor = lastCommittedVertex(v.penSession.getSegments());
    if (anchor) {
      v.penPointerSvg = { x: anchor.x, y: anchor.y };
    }
    v.ports.markForCheck();
    return true;
  }

  if (v.penCommittedFirstSegmentP3Draft && v.penPendingSegment && penPathOnlyMoveto(v.penSession.getSegments())) {
    const d = v.penCommittedFirstSegmentP3Draft;
    v.clearPenCommittedFirstSegmentP3Draft();
    v.penPendingSegment = null;
    v.penPendingLastClient = null;
    v.penPendingDragSvg = null;
    v.penPendingCurveAltChord = false;
    v.penPendingShiftAngleSnap = false;
    v.penFirstAnchorP3Draft = d;
    v.penAwaitingFirstSegmentP3AfterDraft = true;
    const m0 = v.penSession.getSegments()[0];
    if (m0?.type === 'M') {
      v.penPointerSvg = { x: m0.x, y: m0.y };
    }
    v.ports.markForCheck();
    return true;
  }

  if (v.penAwaitingFirstSegmentP3AfterDraft) {
    v.clearPenFirstAnchorAwaitingDraft();
    if (penPathOnlyMoveto(v.penSession.getSegments())) {
      v.clearDrawingState();
      return true;
    }
    const anchor = lastCommittedVertex(v.penSession.getSegments());
    if (anchor) {
      v.penPointerSvg = { x: anchor.x, y: anchor.y };
    }
    v.ports.markForCheck();
    return true;
  }

  if (v.penPendingSegment) {
    v.clearPenCommittedFirstSegmentP3Draft();
    v.penPendingSegment = null;
    v.penPendingLastClient = null;
    v.penPendingDragSvg = null;
    v.penPendingCurveAltChord = false;
    v.penPendingShiftAngleSnap = false;
    const segsAfter = v.penSession.getSegments();
    if (penPathOnlyMoveto(segsAfter)) {
      v.clearDrawingState();
      return true;
    }
    const anchor = lastCommittedVertex(segsAfter);
    if (anchor) {
      v.penPointerSvg = { x: anchor.x, y: anchor.y };
    }
    v.ports.markForCheck();
    return true;
  }

  const popResult = v.penSession.popLastCommittedSegment();
  if (popResult === 'none') return false;
  if (popResult === 'cleared') {
    v.clearDrawingState();
    return true;
  }
  const tip = lastCommittedVertex(v.penSession.getSegments());
  if (tip) {
    v.penPointerSvg = { x: tip.x, y: tip.y };
  }
  v.ports.markForCheck();
  return true;
}
