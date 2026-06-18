import type { PenSession, PenFirstAnchorP3Draft, PenPathSegment } from '../../../models/pen-path';
import { clearDrawingStateForView, type PenDrawingStateClearView } from './pen-tool-session-lifecycle';
import type { PenBackspaceShortcutView } from './pen-tool-session-backspace';
import {
  commitPenPendingSegmentForView,
  flushPenPendingAsCurrentPointerForView,
  type PenPendingCommitView
} from './pen-tool-session-pending-commit';
import type { PenCanvasInputView } from './pen-tool-session-canvas-input';
import { tryCommitPenFirstSegmentCurveFromPendingDraftForView, type PenFirstSegmentFromDraftCommitView } from './pen-tool-session-first-anchor-p3-commit';
import { tryFinishPenPathForView, type TryFinishPenPathView } from './pen-tool-session-try-finish-path';
import { isPrependContinuationCloseAtFrozenTail, type PenContinuingPathRewrite } from './pen-tool-session-path-continuation';
import type { PenInsertOnPathDragMutable, PenInsertOnPathDragState } from './pen-tool-session-insert-on-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { clearPendingSegmentFields, type PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

/**
 * Session-owned state + domain hooks for {@link createPenToolSessionViewContext}.
 * Built once on {@link PenToolSession} via lazy getters over private fields.
 */
export type PenToolSessionViewDelegate = {
  readonly ports: PenToolSessionPorts;
  readonly penSession: PenSession;
  insertOnPathMutable(): PenInsertOnPathDragMutable;

  getPointerSvg(): { x: number; y: number } | null;
  setPointerSvg(v: { x: number; y: number } | null): void;
  getPendingSegment(): PenPendingSegmentForPreview | null;
  setPendingSegment(v: PenPendingSegmentForPreview | null): void;
  getPendingLastClient(): { x: number; y: number } | null;
  setPendingLastClient(v: { x: number; y: number } | null): void;
  getPendingDragSvg(): { x: number; y: number } | null;
  setPendingDragSvg(v: { x: number; y: number } | null): void;
  getPendingCurveAltChord(): boolean;
  setPendingCurveAltChord(v: boolean): void;
  getPendingShiftAngleSnap(): boolean;
  setPendingShiftAngleSnap(v: boolean): void;
  getFirstAnchorP3Draft(): PenFirstAnchorP3Draft | null;
  setFirstAnchorP3Draft(v: PenFirstAnchorP3Draft | null): void;
  getAwaitingColocatedEndpoint(): boolean;
  setAwaitingColocatedEndpoint(v: boolean): void;
  getColocatedDraft(): PenFirstAnchorP3Draft | null;
  setColocatedDraft(v: PenFirstAnchorP3Draft | null): void;
  getHoverClientPx(): { x: number; y: number } | null;
  setHoverClientPx(v: { x: number; y: number } | null): void;
  getContinuingPathRewrite(): PenContinuingPathRewrite | null;
  setContinuingPathRewrite(v: PenContinuingPathRewrite | null): void;
  getOutgoingHandleDrag(): { segmentIndex: number; before: PenPathSegment } | null;
  setOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null): void;
  getInsertOnPath(): PenInsertOnPathDragState | null;
  getFinishFeedbackMessage(): string | null;

  isPenSessionActive(): boolean;
  penPathStartMv(): { x: number; y: number } | null;
  penPathCloseTargetMv(): { x: number; y: number } | null;
  penPendingShowsCurvePreview(): boolean;
  penPendingMousedownInCloseRadius(): boolean;
  penPendingResolvedEndForCommit(
    pending: PenPendingSegmentForPreview,
    releaseSvg: { x: number; y: number } | null | undefined
  ): { x: number; y: number };
  penPendingIsFirstFromMoveto(): boolean;
  penPendingChordColocated(): boolean;
  penPendingStartNearPathMoveto(): boolean;
  penPendingStartNearPathCloseTarget(): boolean;
  penPendingCubicAltEndOnly(): boolean;
  isPenPointerWithinCloseRadius(clientX: number, clientY: number): boolean;
  clearFirstAnchorAwaitingDraft(): void;
  clearColocatedSegmentEndpointDraft(): void;
  commitPenDraggedCurve(
    anchor: { x: number; y: number },
    chordEndSvg: { x: number; y: number },
    dragCurrent: { x: number; y: number },
    ctrlCurve: boolean,
    segmentEnd?: { x: number; y: number },
    placementDragStartSvg?: { x: number; y: number },
    frozenOutgoingP1Svg?: { x: number; y: number },
    zeroIncomingAtSegmentEnd?: boolean
  ): void;
  tryFinishPenPath(closePath: boolean): void;
  tryPickUpPenOpenPathContinuation(event: MouseEvent): boolean;
  finishPenOutgoingHandleDrag(): void;
  finishPenInsertOnPathDrag(event: MouseEvent): void;
  incompleteFirstSegmentFromEmpty(): boolean;
  incompleteColocatedSegmentEndpointDraft(): boolean;
  showPenFinishFeedback(): void;
  purgeProvisionalPenSegmentHistory(): void;
  clearPenFinishFeedback(): void;
  clearPenInsertOnPathDragState(): void;
};

/** Single adapter object passed to all pen `*ForView` use cases. */
export type PenToolSessionViewContext = PenPendingCommitView &
  PenCanvasInputView &
  PenFirstSegmentFromDraftCommitView &
  TryFinishPenPathView &
  PenDrawingStateClearView &
  PenBackspaceShortcutView;

export function createPenToolSessionViewContext(d: PenToolSessionViewDelegate): PenToolSessionViewContext {
  let ctx!: PenToolSessionViewContext;
  ctx = {
    get ports() {
      return d.ports;
    },
    get penSession() {
      return d.penSession;
    },
    get insertOnPathMutable() {
      return d.insertOnPathMutable();
    },

    get pendingSegment() {
      return d.getPendingSegment();
    },
    set pendingSegment(v: PenPendingSegmentForPreview | null) {
      d.setPendingSegment(v);
    },
    get pendingLastClient() {
      return d.getPendingLastClient();
    },
    set pendingLastClient(v: { x: number; y: number } | null) {
      d.setPendingLastClient(v);
    },
    get pendingDragSvg() {
      return d.getPendingDragSvg();
    },
    set pendingDragSvg(v: { x: number; y: number } | null) {
      d.setPendingDragSvg(v);
    },
    get pendingCurveAltChord() {
      return d.getPendingCurveAltChord();
    },
    set pendingCurveAltChord(v: boolean) {
      d.setPendingCurveAltChord(v);
    },
    get pendingShiftAngleSnap() {
      return d.getPendingShiftAngleSnap();
    },
    set pendingShiftAngleSnap(v: boolean) {
      d.setPendingShiftAngleSnap(v);
    },
    get pointerSvg() {
      return d.getPointerSvg();
    },
    set pointerSvg(v: { x: number; y: number } | null) {
      d.setPointerSvg(v);
    },

    get penPointerSvg() {
      return d.getPointerSvg();
    },
    set penPointerSvg(v: { x: number; y: number } | null) {
      d.setPointerSvg(v);
    },
    get penPendingSegment() {
      return d.getPendingSegment();
    },
    set penPendingSegment(v: PenPendingSegmentForPreview | null) {
      d.setPendingSegment(v);
    },
    get penPendingLastClient() {
      return d.getPendingLastClient();
    },
    set penPendingLastClient(v: { x: number; y: number } | null) {
      d.setPendingLastClient(v);
    },
    get penPendingDragSvg() {
      return d.getPendingDragSvg();
    },
    set penPendingDragSvg(v: { x: number; y: number } | null) {
      d.setPendingDragSvg(v);
    },
    get penPendingCurveAltChord() {
      return d.getPendingCurveAltChord();
    },
    set penPendingCurveAltChord(v: boolean) {
      d.setPendingCurveAltChord(v);
    },
    get penPendingShiftAngleSnap() {
      return d.getPendingShiftAngleSnap();
    },
    set penPendingShiftAngleSnap(v: boolean) {
      d.setPendingShiftAngleSnap(v);
    },
    get penFirstAnchorP3Draft() {
      return d.getFirstAnchorP3Draft();
    },
    set penFirstAnchorP3Draft(v: PenFirstAnchorP3Draft | null) {
      d.setFirstAnchorP3Draft(v);
    },
    get penAwaitingColocatedSegmentEndpointAfterDraft() {
      return d.getAwaitingColocatedEndpoint();
    },
    get awaitingColocatedEndpoint() {
      return d.getAwaitingColocatedEndpoint();
    },
    set awaitingColocatedEndpoint(v: boolean) {
      d.setAwaitingColocatedEndpoint(v);
    },
    get colocatedDraft() {
      return d.getColocatedDraft();
    },
    set colocatedDraft(v: PenFirstAnchorP3Draft | null) {
      d.setColocatedDraft(v);
    },
    get firstAnchorP3Draft() {
      return d.getFirstAnchorP3Draft();
    },
    set firstAnchorP3Draft(v: PenFirstAnchorP3Draft | null) {
      d.setFirstAnchorP3Draft(v);
    },
    get penHoverClientPx() {
      return d.getHoverClientPx();
    },
    set penHoverClientPx(v: { x: number; y: number } | null) {
      d.setHoverClientPx(v);
    },
    get penContinuingPathRewrite() {
      return d.getContinuingPathRewrite();
    },
    set penContinuingPathRewrite(v: PenContinuingPathRewrite | null) {
      d.setContinuingPathRewrite(v);
    },
    get continuingPathRewrite() {
      return d.getContinuingPathRewrite();
    },
    get penOutgoingHandleDrag() {
      return d.getOutgoingHandleDrag();
    },
    set penOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null) {
      d.setOutgoingHandleDrag(v);
    },
    get outgoingHandleDrag() {
      return d.getOutgoingHandleDrag();
    },
    set outgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null) {
      d.setOutgoingHandleDrag(v);
    },
    get penInsertOnPath() {
      return d.getInsertOnPath();
    },
    get penFinishFeedbackMessage() {
      return d.getFinishFeedbackMessage();
    },
    get awaitingFirstP3() {
      return d.getFirstAnchorP3Draft() !== null && d.getPendingSegment() === null;
    },

    pathStartMv: () => d.penPathStartMv(),
    pathCloseTargetMv: () => d.penPathCloseTargetMv(),
    pendingShowsCurvePreview: () => d.penPendingShowsCurvePreview(),
    pendingMousedownInCloseRadius: () => d.penPendingMousedownInCloseRadius(),
    pendingResolvedEndForCommit: (
      pending: PenPendingSegmentForPreview,
      releaseSvg: { x: number; y: number } | null | undefined
    ) => d.penPendingResolvedEndForCommit(pending, releaseSvg),
    pendingIsFirstFromMoveto: () => d.penPendingIsFirstFromMoveto(),
    pendingChordColocated: () => d.penPendingChordColocated(),
    pendingStartNearPathMoveto: () => d.penPendingStartNearPathMoveto(),
    pendingStartNearPathCloseTarget: () => d.penPendingStartNearPathCloseTarget(),
    pendingCubicAltEndOnly: () => d.penPendingCubicAltEndOnly(),
    isPrependContinuationCloseAtFrozenTail: () =>
      isPrependContinuationCloseAtFrozenTail(d.getContinuingPathRewrite()),
    isPointerWithinCloseRadius: (clientX: number, clientY: number) =>
      d.isPenPointerWithinCloseRadius(clientX, clientY),
    clearFirstAnchorAwaitingDraft: () => d.clearFirstAnchorAwaitingDraft(),
    clearColocatedDraft: () => d.clearColocatedSegmentEndpointDraft(),
    clearPenColocatedSegmentEndpointDraft: () => d.clearColocatedSegmentEndpointDraft(),
    clearPenFirstAnchorAwaitingDraft: () => d.clearFirstAnchorAwaitingDraft(),
    setColocatedDraft: (v: PenFirstAnchorP3Draft | null) => d.setColocatedDraft(v),
    setHoverClientPx: (x: number, y: number) => d.setHoverClientPx({ x, y }),
    setPendingCurveAltChord: (v: boolean) => d.setPendingCurveAltChord(v),
    setPendingShiftAngleSnap: (v: boolean) => d.setPendingShiftAngleSnap(v),
    setPointerAfterFirstSegmentDraftCommit: (tip: { x: number; y: number }) => d.setPointerSvg(tip),
    clearPendingSegmentFields: () => clearPendingSegmentFields(ctx),
    commitDraggedCurve: (
      anchor: { x: number; y: number },
      chordEndSvg: { x: number; y: number },
      dragCurrent: { x: number; y: number },
      ctrlCurve: boolean,
      segmentEnd?: { x: number; y: number },
      placementDragStartSvg?: { x: number; y: number },
      frozenOutgoingP1Svg?: { x: number; y: number },
      zeroIncomingAtSegmentEnd?: boolean
    ) =>
      d.commitPenDraggedCurve(
        anchor,
        chordEndSvg,
        dragCurrent,
        ctrlCurve,
        segmentEnd,
        placementDragStartSvg,
        frozenOutgoingP1Svg,
        zeroIncomingAtSegmentEnd
      ),
    tryCommitFirstSegmentCurveFromPendingDraft: (
      clientX: number,
      clientY: number,
      ctrlKey: boolean,
      pendingSeg: PenPendingSegmentForPreview,
      releaseSvg: { x: number; y: number } | null | undefined,
      segs: readonly PenPathSegment[]
    ) => tryCommitPenFirstSegmentCurveFromPendingDraftForView(ctx, clientX, clientY, ctrlKey, pendingSeg, releaseSvg, segs),
    tryFinishPath: (closePath: boolean) => d.tryFinishPenPath(closePath),
    tryFinishPenPath: (closePath: boolean) => d.tryFinishPenPath(closePath),
    tryPickUpPenOpenPathContinuation: (event: MouseEvent) => d.tryPickUpPenOpenPathContinuation(event),
    commitPenPendingSegment: (event: MouseEvent) => commitPenPendingSegmentForView(ctx, event),
    finishPenOutgoingHandleDrag: () => d.finishPenOutgoingHandleDrag(),
    finishPenInsertOnPathDrag: (event: MouseEvent) => d.finishPenInsertOnPathDrag(event),
    finishOutgoingHandleDrag: () => d.finishPenOutgoingHandleDrag(),
    incompleteFirstSegmentFromEmpty: () => d.incompleteFirstSegmentFromEmpty(),
    incompleteColocatedSegmentEndpointDraft: () => d.incompleteColocatedSegmentEndpointDraft(),
    showPenFinishFeedback: () => d.showPenFinishFeedback(),
    flushPenPendingAsCurrentPointer: () => flushPenPendingAsCurrentPointerForView(ctx),
    purgeProvisionalPenSegmentHistory: () => d.purgeProvisionalPenSegmentHistory(),
    clearPenFinishFeedback: () => d.clearPenFinishFeedback(),
    clearPenInsertOnPathDragState: () => d.clearPenInsertOnPathDragState(),
    clearDrawingState: () => clearDrawingStateForView(ctx),
    isPenSessionActive: () => d.isPenSessionActive(),
    markForCheck: () => d.ports.markForCheck()
  };
  return ctx;
}
