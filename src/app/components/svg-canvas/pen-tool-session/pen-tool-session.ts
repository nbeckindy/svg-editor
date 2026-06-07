/**
 * Orchestrates in-progress pen path authoring (preview, pointer, keyboard, commit).
 * Logical inputs and document effects cross {@link PenToolSessionPorts} (see `pen-tool-session-ports.ts`)
 * so the **Canvas adapter** stays a DOM/view adapter and this module stays unit-testable without full TestBed.
 * Finish-to-document and insert-on-path helpers live in `pen-tool-session-finish.ts` and
 * `pen-tool-session-insert-on-path.ts`; SVG user → **Editor chrome** overlay mapping helpers in
 * `pen-tool-session-overlay.ts`. Shared pen thresholds and pending-segment preview math in
 * `pen-tool-session-constants.ts` and `pen-tool-session-pending-preview.ts`. In-progress path `d` strings
 * for templates live in `pen-tool-session-preview-path-d.ts`. Rubber-band / close-target / outgoing-handle
 * **Editor chrome** helpers in `pen-tool-session-preview-overlays.ts`. Pending curve handle chrome in
 * `pen-tool-session-curve-handle-overlays.ts`. Dragged-curve append (`commitPenDraggedCurve`) in
 * `pen-tool-session-commit-dragged-curve.ts`. Pending-segment mouseup / flush logic in
 * `pen-tool-session-pending-commit.ts`. Canvas primary + document pointer routing in
 * `pen-tool-session-canvas-input.ts`. Path continuation / join pickup in
 * `pen-tool-session-path-continuation.ts`. First committed-`P3` segment commit in
 * `pen-tool-session-first-anchor-p3-commit.ts`. Finish orchestration in
 * `pen-tool-session-try-finish-path.ts`. Session reset + backspace in
 * `pen-tool-session-lifecycle.ts` and `pen-tool-session-backspace.ts`.
 */
import {
  PenSession,
  lastCommittedVertex,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penReflectStateAfterCommitted,
  penCubicSmoothReflectP1Usable,
  penSvgDistanceSq,
  penLastOutgoingHandleSvg,
  snapVectorTo45DegFrom,
  penAdjustedCubicControlsForPendingLikeDrag,
  placementPointerCubicControlPoints,
  type PenFirstAnchorP3Draft,
  type CubicControlPoints,
  type PenPathSegment
} from '../../../models/pen-path';
import { PenSegmentReplaceCommand } from '../../../models/editor-commands';
import {
  computePenInsertOnPathPreviewPathD,
  evaluatePenInsertOnPathAt as evaluatePenInsertOnPathAtImpl,
  tryBeginPenInsertOnPathDrag,
  finishPenInsertOnPathDragFlow,
  clearPenInsertOnPathDragMutable,
  type PenInsertOnPathDragMutable,
  type PenInsertOnPathDragState,
  type PenInsertOnPathEvaluateResult
} from './pen-tool-session-insert-on-path';
import type { PenDiscardReason, PenToolSessionPorts } from './pen-tool-session-ports';
import { penSvgUserPointToOverlayPixel, penSvgUserSegmentToOverlayLine } from './pen-tool-session-overlay';
import {
  PEN_FINISH_FEEDBACK_DURATION_MS,
  PEN_SINGLE_CLICK_CLOSE_RADIUS_PX
} from './pen-tool-session-constants';
import {
  computePenPendingShowsCurvePreviewForClose,
  penPendingCurvePreviewEndSvg as penPendingCurvePreviewEndUserSvg,
  penPendingDragSampleSvg as samplePenPendingDragSvg,
  penPendingStartNearPathMoveto as computePenPendingStartNearPathMoveto,
  type PenPendingSegmentForPreview
} from './pen-tool-session-pending-preview';
import {
  buildPenPendingCurveAppendedBaseD,
  computePenCurvePreviewPathD,
  computePenSessionPreviewPathD
} from './pen-tool-session-preview-path-d';
import {
  computePenCloseTargetHoverOverlay,
  computePenCommittedOutgoingHandleSvg,
  computePenRubberBandOverlay
} from './pen-tool-session-preview-overlays';
import {
  computePenCurveHandleOverlays,
  computePenPendingCurveHandleGuideOverlays
} from './pen-tool-session-curve-handle-overlays';
import { commitPenDraggedCurveOnSession } from './pen-tool-session-commit-dragged-curve';
import {
  commitPenPendingSegmentForView,
  flushPenPendingAsCurrentPointerForView,
  type PenPendingCommitView
} from './pen-tool-session-pending-commit';
import {
  handlePenCanvasMouseDownForView,
  onCanvasPenPrimaryMouseDownForView,
  onDocumentMouseMovePenForView,
  onDocumentMouseUpPenForView,
  type PenCanvasInputView
} from './pen-tool-session-canvas-input';
import {
  combinePenContinuationSegments as splicePenContinuationSegments,
  findPenOpenPathFinishJoin as findPenOpenPathFinishJoinForPorts,
  findPenOpenPathPickupAtEvent,
  openPenDrawableForJoin as openPenDrawableForJoinOnPorts,
  penClientPxWithinJoinToleranceVsSvgPoint as penClientPxWithinJoinToleranceVsSvgPointForPorts,
  penEndpointsWithinJoinTolerance as penEndpointsWithinJoinToleranceForPorts,
  penScreenDistanceSq as penScreenDistanceSqForPorts,
  penSvgUserPointToApproxClient as penSvgUserPointToApproxClientForPorts
} from './pen-tool-session-path-continuation';
import {
  commitPenCommittedFirstSegmentP3IfApplicableForView,
  type PenCommittedFirstSegmentP3CommitView
} from './pen-tool-session-first-anchor-p3-commit';
import { tryFinishPenPathForView, type TryFinishPenPathView } from './pen-tool-session-try-finish-path';
import { clearDrawingStateForView, type PenDrawingStateClearView } from './pen-tool-session-lifecycle';
import { tryPenBackspaceShortcutForView, type PenBackspaceShortcutView } from './pen-tool-session-backspace';

export type { PenDiscardReason, PenToolSessionPorts } from './pen-tool-session-ports';

export class PenToolSession {
  penFinishFeedbackMessage: string | null = null;
  private penFinishFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly penSession = new PenSession();
  private penPointerSvg: { x: number; y: number } | null = null;
  private penPendingSegment: PenPendingSegmentForPreview | null = null;
  private penPendingLastClient: { x: number; y: number } | null = null;
  private penPendingDragSvg: { x: number; y: number } | null = null;
  private penPendingCurveAltChord = false;
  private penPendingShiftAngleSnap = false;
  /**
   * After meaningful first-segment handle drag + mouseup (2A): segments stay `M` only until the next
   * primary **down** plants `P3` (`startSvg`). Same-press drag + **mouseup** commit the first `C`
   * (frozen outgoing `P1` from draft; incoming from second-gesture drag unless movement is tiny).
   * {@link penCommittedFirstSegmentP3Draft} holds frozen first-drag samples until that commit.
   */
  private penAwaitingFirstSegmentP3AfterDraft = false;
  private penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null = null;
  /**
   * Snapshot of {@link penFirstAnchorP3Draft} after `P3` mousedown: {@link penPendingSegment} is
   * `M`→planted endpoint while the user drag-shapes the curve until mouseup.
   */
  private penCommittedFirstSegmentP3Draft: PenFirstAnchorP3Draft | null = null;
  /**
   * After plant-at-tip (same press as last vertex) + handle drag + mouseup: next primary down plants the
   * segment endpoint and commits the cubic — mirrors first-segment `M`-only draft → `P3` flow.
   */
  private penAwaitingColocatedSegmentEndpointAfterDraft = false;
  private penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null = null;
  private penHoverClientPx: { x: number; y: number } | null = null;
  private penContinuingPathRewrite: { pathId: string; originalD: string } | null = null;
  private penOutgoingHandleDrag: { segmentIndex: number; before: PenPathSegment } | null = null;

  /** Mousedown→drag→mouseup insert on an existing path (idle pen session). */
  private penInsertOnPath: PenInsertOnPathDragState | null = null;
  private penInsertOnPathLastClient: { x: number; y: number } | null = null;
  private penInsertOnPathPointerSvg: { x: number; y: number } | null = null;

  private penInsertOnPathDragBagCache: PenInsertOnPathDragMutable | null = null;
  private penPendingCommitViewCache: PenPendingCommitView | null = null;
  private penCanvasInputViewCache: PenCanvasInputView | null = null;
  private penCommittedFirstSegmentP3CommitViewCache: PenCommittedFirstSegmentP3CommitView | null = null;
  private penTryFinishPenPathViewCache: TryFinishPenPathView | null = null;
  private penDrawingStateClearViewCache: PenDrawingStateClearView | null = null;
  private penBackspaceShortcutViewCache: PenBackspaceShortcutView | null = null;

  constructor(private readonly ports: PenToolSessionPorts) {}

  private insertOnPathDragMutable(): PenInsertOnPathDragMutable {
    if (!this.penInsertOnPathDragBagCache) {
      const self = this;
      this.penInsertOnPathDragBagCache = {
        get drag() {
          return self.penInsertOnPath;
        },
        set drag(v) {
          self.penInsertOnPath = v;
        },
        get lastClient() {
          return self.penInsertOnPathLastClient;
        },
        set lastClient(v) {
          self.penInsertOnPathLastClient = v;
        },
        get pointerSvg() {
          return self.penInsertOnPathPointerSvg;
        },
        set pointerSvg(v) {
          self.penInsertOnPathPointerSvg = v;
        }
      };
    }
    return this.penInsertOnPathDragBagCache;
  }

  private pendingCommitView(): PenPendingCommitView {
    if (!this.penPendingCommitViewCache) {
      const self = this;
      this.penPendingCommitViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        get pendingSegment() {
          return self.penPendingSegment;
        },
        set pendingSegment(v) {
          self.penPendingSegment = v;
        },
        get pendingLastClient() {
          return self.penPendingLastClient;
        },
        set pendingLastClient(v) {
          self.penPendingLastClient = v;
        },
        get pendingDragSvg() {
          return self.penPendingDragSvg;
        },
        set pendingDragSvg(v) {
          self.penPendingDragSvg = v;
        },
        get pendingCurveAltChord() {
          return self.penPendingCurveAltChord;
        },
        set pendingCurveAltChord(v) {
          self.penPendingCurveAltChord = v;
        },
        get pendingShiftAngleSnap() {
          return self.penPendingShiftAngleSnap;
        },
        set pendingShiftAngleSnap(v) {
          self.penPendingShiftAngleSnap = v;
        },
        get pointerSvg() {
          return self.penPointerSvg;
        },
        set pointerSvg(v) {
          self.penPointerSvg = v;
        },
        pathStartMv: () => self.penPathStartMv(),
        pendingShowsCurvePreview: () => self.penPendingShowsCurvePreview,
        pendingMousedownInCloseRadius: () => self.penPendingMousedownInCloseRadius(),
        pendingResolvedEndForCommit: (p, r) => self.penPendingResolvedEndSvgForCommit(p, r),
        pendingIsFirstFromMoveto: () => self.penPendingIsFirstSegmentFromMovetoGesture(),
        pendingChordColocated: () => self.penPendingChordColocated(),
        pendingStartNearPathMoveto: () => self.penPendingStartNearPathMoveto(),
        pendingCubicAltEndOnly: () => self.penPendingCubicAltEndHandleOnly(),
        clearFirstAnchorAwaitingDraft: () => self.clearPenFirstAnchorAwaitingDraft(),
        get colocatedDraft() {
          return self.penColocatedSegmentEndpointDraft;
        },
        set colocatedDraft(v) {
          self.penColocatedSegmentEndpointDraft = v;
        },
        get awaitingColocatedEndpoint() {
          return self.penAwaitingColocatedSegmentEndpointAfterDraft;
        },
        set awaitingColocatedEndpoint(v) {
          self.penAwaitingColocatedSegmentEndpointAfterDraft = v;
        },
        get firstAnchorP3Draft() {
          return self.penFirstAnchorP3Draft;
        },
        set firstAnchorP3Draft(v) {
          self.penFirstAnchorP3Draft = v;
        },
        get awaitingFirstSegmentP3AfterDraft() {
          return self.penAwaitingFirstSegmentP3AfterDraft;
        },
        set awaitingFirstSegmentP3AfterDraft(v) {
          self.penAwaitingFirstSegmentP3AfterDraft = v;
        },
        commitFirstSegmentP3IfApplicable: (cx, cy, ck, ps, rs, sg) =>
          commitPenCommittedFirstSegmentP3IfApplicableForView(self.committedFirstSegmentP3View(), cx, cy, ck, ps, rs, sg),
        commitDraggedCurve: (a, c, d, ctrl, se, pl, fr, z) =>
          self.commitPenDraggedCurve(a, c, d, ctrl, se, pl, fr, z),
        tryFinishPath: (close) => self.tryFinishPenPath(close),
        markForCheck: () => self.ports.markForCheck()
      };
    }
    return this.penPendingCommitViewCache;
  }

  private canvasInputView(): PenCanvasInputView {
    if (!this.penCanvasInputViewCache) {
      const self = this;
      this.penCanvasInputViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        get insertOnPathMutable() {
          return self.insertOnPathDragMutable();
        },
        get outgoingHandleDrag() {
          return self.penOutgoingHandleDrag;
        },
        set outgoingHandleDrag(v) {
          self.penOutgoingHandleDrag = v;
        },
        get pendingSegment() {
          return self.penPendingSegment;
        },
        set pendingSegment(v) {
          self.penPendingSegment = v;
        },
        get pendingLastClient() {
          return self.penPendingLastClient;
        },
        set pendingLastClient(v) {
          self.penPendingLastClient = v;
        },
        get pendingDragSvg() {
          return self.penPendingDragSvg;
        },
        set pendingDragSvg(v) {
          self.penPendingDragSvg = v;
        },
        get pendingCurveAltChord() {
          return self.penPendingCurveAltChord;
        },
        set pendingCurveAltChord(v) {
          self.penPendingCurveAltChord = v;
        },
        get pendingShiftAngleSnap() {
          return self.penPendingShiftAngleSnap;
        },
        set pendingShiftAngleSnap(v) {
          self.penPendingShiftAngleSnap = v;
        },
        get pointerSvg() {
          return self.penPointerSvg;
        },
        set pointerSvg(v) {
          self.penPointerSvg = v;
        },
        get penContinuingPathRewrite() {
          return self.penContinuingPathRewrite;
        },
        set penContinuingPathRewrite(v) {
          self.penContinuingPathRewrite = v;
        },
        get awaitingColocatedEndpoint() {
          return self.penAwaitingColocatedSegmentEndpointAfterDraft;
        },
        get colocatedDraft() {
          return self.penColocatedSegmentEndpointDraft;
        },
        get awaitingFirstP3() {
          return self.penAwaitingFirstSegmentP3AfterDraft;
        },
        get firstAnchorP3Draft() {
          return self.penFirstAnchorP3Draft;
        },
        get committedFirstP3Draft() {
          return self.penCommittedFirstSegmentP3Draft;
        },
        clearFirstAnchorAwaitingDraft: () => self.clearPenFirstAnchorAwaitingDraft(),
        clearCommittedFirstP3Draft: () => self.clearPenCommittedFirstSegmentP3Draft(),
        clearColocatedDraft: () => self.clearPenColocatedSegmentEndpointDraft(),
        setHoverClientPx: (x, y) => {
          self.penHoverClientPx = { x, y };
        },
        tryPickUpPenOpenPathContinuation: (e) => self.tryPickUpPenOpenPathContinuation(e),
        tryFinishPenPath: (c) => self.tryFinishPenPath(c),
        commitDraggedCurve: (a, c, d, ctrl, se, pl, fr, z) =>
          self.commitPenDraggedCurve(a, c, d, ctrl, se, pl, fr, z),
        setAwaitingFirstP3: (v) => {
          self.penAwaitingFirstSegmentP3AfterDraft = v;
        },
        setFirstAnchorP3Draft: (v) => {
          self.penFirstAnchorP3Draft = v;
        },
        setCommittedFirstP3Draft: (v) => {
          self.penCommittedFirstSegmentP3Draft = v;
        },
        setAwaitingColocated: (v) => {
          self.penAwaitingColocatedSegmentEndpointAfterDraft = v;
        },
        setColocatedDraft: (v) => {
          self.penColocatedSegmentEndpointDraft = v;
        },
        pendingIsFirstFromMoveto: () => self.penPendingIsFirstSegmentFromMovetoGesture(),
        pendingChordColocated: () => self.penPendingChordColocated(),
        markForCheck: () => self.ports.markForCheck(),
        commitPenPendingSegment: (e) => commitPenPendingSegmentForView(self.pendingCommitView(), e),
        finishPenOutgoingHandleDrag: () => self.finishPenOutgoingHandleDrag(),
        finishPenInsertOnPathDrag: (e) => self.finishPenInsertOnPathDrag(e),
        isPenSessionActive: () => self.isPenSessionActive
      };
    }
    return this.penCanvasInputViewCache;
  }

  private committedFirstSegmentP3View(): PenCommittedFirstSegmentP3CommitView {
    if (!this.penCommittedFirstSegmentP3CommitViewCache) {
      const self = this;
      this.penCommittedFirstSegmentP3CommitViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        get committedFirstP3Draft() {
          return self.penCommittedFirstSegmentP3Draft;
        },
        clearCommittedFirstP3Draft: () => self.clearPenCommittedFirstSegmentP3Draft(),
        pendingResolvedEndForCommit: (p, r) => self.penPendingResolvedEndSvgForCommit(p, r),
        get pendingDragSvg() {
          return self.penPendingDragSvg;
        },
        get pointerSvg() {
          return self.penPointerSvg;
        },
        setPendingCurveAltChord: (v) => {
          self.penPendingCurveAltChord = v;
        },
        setPendingShiftAngleSnap: (v) => {
          self.penPendingShiftAngleSnap = v;
        },
        commitDraggedCurve: (a, c, d, ctrl, se, pl, fr, z) =>
          self.commitPenDraggedCurve(a, c, d, ctrl, se, pl, fr, z),
        plantPendingChordAfterFirstP3Commit: (clientX, clientY, ctrlKey, tip) => {
          self.penPendingSegment = {
            anchor: { x: tip.x, y: tip.y },
            startClient: { x: clientX, y: clientY },
            startSvg: { x: tip.x, y: tip.y },
            ctrlCurve: self.ports.isPenAltCurveMode() || ctrlKey
          };
          self.penPendingLastClient = { x: clientX, y: clientY };
          self.penPendingDragSvg = { x: tip.x, y: tip.y };
          self.penPointerSvg = { x: tip.x, y: tip.y };
        },
        clearPendingSegmentFields: () => {
          self.penPendingSegment = null;
          self.penPendingLastClient = null;
          self.penPendingDragSvg = null;
        },
        markForCheck: () => self.ports.markForCheck()
      };
    }
    return this.penCommittedFirstSegmentP3CommitViewCache;
  }

  private tryFinishPenPathView(): TryFinishPenPathView {
    if (!this.penTryFinishPenPathViewCache) {
      const self = this;
      this.penTryFinishPenPathViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        get continuingPathRewrite() {
          return self.penContinuingPathRewrite;
        },
        finishOutgoingHandleDrag: () => self.finishPenOutgoingHandleDrag(),
        incompleteFirstSegmentFromEmpty: () => self.penIncompleteFirstSegmentFromEmpty(),
        incompleteColocatedSegmentEndpointDraft: () => self.penIncompleteColocatedSegmentEndpointDraft(),
        showPenFinishFeedback: () => self.showPenFinishFeedback(),
        flushPenPendingAsCurrentPointer: () => self.flushPenPendingAsCurrentPointer(),
        purgeProvisionalPenSegmentHistory: () => self.purgeProvisionalPenSegmentHistory(),
        pathStartMv: () => self.penPathStartMv(),
        clearPenFinishFeedback: () => self.clearPenFinishFeedback(),
        clearDrawingState: () => clearDrawingStateForView(self.drawingStateClearView())
      };
    }
    return this.penTryFinishPenPathViewCache;
  }

  private drawingStateClearView(): PenDrawingStateClearView {
    if (!this.penDrawingStateClearViewCache) {
      const self = this;
      this.penDrawingStateClearViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        isPenSessionActive: () => self.isPenSessionActive,
        get penPointerSvg() {
          return self.penPointerSvg;
        },
        get penPendingSegment() {
          return self.penPendingSegment;
        },
        get penAwaitingFirstSegmentP3AfterDraft() {
          return self.penAwaitingFirstSegmentP3AfterDraft;
        },
        get penCommittedFirstSegmentP3Draft() {
          return self.penCommittedFirstSegmentP3Draft;
        },
        get penAwaitingColocatedSegmentEndpointAfterDraft() {
          return self.penAwaitingColocatedSegmentEndpointAfterDraft;
        },
        get penPendingDragSvg() {
          return self.penPendingDragSvg;
        },
        get penHoverClientPx() {
          return self.penHoverClientPx;
        },
        get penContinuingPathRewrite() {
          return self.penContinuingPathRewrite;
        },
        get penOutgoingHandleDrag() {
          return self.penOutgoingHandleDrag;
        },
        get penInsertOnPath() {
          return self.penInsertOnPath;
        },
        set penPendingSegment(v: PenPendingSegmentForPreview | null) {
          self.penPendingSegment = v;
        },
        set penPendingLastClient(v: { x: number; y: number } | null) {
          self.penPendingLastClient = v;
        },
        set penPendingDragSvg(v: { x: number; y: number } | null) {
          self.penPendingDragSvg = v;
        },
        set penHoverClientPx(v: { x: number; y: number } | null) {
          self.penHoverClientPx = v;
        },
        set penContinuingPathRewrite(v: { pathId: string; originalD: string } | null) {
          self.penContinuingPathRewrite = v;
        },
        set penOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null) {
          self.penOutgoingHandleDrag = v;
        },
        set penPointerSvg(v: { x: number; y: number } | null) {
          self.penPointerSvg = v;
        },
        set penPendingCurveAltChord(v: boolean) {
          self.penPendingCurveAltChord = v;
        },
        set penPendingShiftAngleSnap(v: boolean) {
          self.penPendingShiftAngleSnap = v;
        },
        clearPenInsertOnPathDragState: () => self.clearPenInsertOnPathDragState(),
        clearPenFirstAnchorAwaitingDraft: () => self.clearPenFirstAnchorAwaitingDraft(),
        clearPenCommittedFirstSegmentP3Draft: () => self.clearPenCommittedFirstSegmentP3Draft(),
        clearPenColocatedSegmentEndpointDraft: () => self.clearPenColocatedSegmentEndpointDraft(),
        purgeProvisionalPenSegmentHistory: () => self.purgeProvisionalPenSegmentHistory(),
        markForCheck: () => self.ports.markForCheck(),
        get penFinishFeedbackMessage() {
          return self.penFinishFeedbackMessage;
        },
        clearPenFinishFeedback: () => self.clearPenFinishFeedback()
      };
    }
    return this.penDrawingStateClearViewCache;
  }

  private backspaceShortcutView(): PenBackspaceShortcutView {
    if (!this.penBackspaceShortcutViewCache) {
      const self = this;
      this.penBackspaceShortcutViewCache = {
        get ports() {
          return self.ports;
        },
        get penSession() {
          return self.penSession;
        },
        isPenSessionActive: () => self.isPenSessionActive,
        get penOutgoingHandleDrag() {
          return self.penOutgoingHandleDrag;
        },
        set penOutgoingHandleDrag(v: { segmentIndex: number; before: PenPathSegment } | null) {
          self.penOutgoingHandleDrag = v;
        },
        get penAwaitingColocatedSegmentEndpointAfterDraft() {
          return self.penAwaitingColocatedSegmentEndpointAfterDraft;
        },
        clearPenColocatedSegmentEndpointDraft: () => self.clearPenColocatedSegmentEndpointDraft(),
        get penCommittedFirstSegmentP3Draft() {
          return self.penCommittedFirstSegmentP3Draft;
        },
        get penPendingSegment() {
          return self.penPendingSegment;
        },
        clearPenCommittedFirstSegmentP3Draft: () => self.clearPenCommittedFirstSegmentP3Draft(),
        set penPendingSegment(v: PenPendingSegmentForPreview | null) {
          self.penPendingSegment = v;
        },
        set penPendingLastClient(v: { x: number; y: number } | null) {
          self.penPendingLastClient = v;
        },
        set penPendingDragSvg(v: { x: number; y: number } | null) {
          self.penPendingDragSvg = v;
        },
        set penPendingCurveAltChord(v: boolean) {
          self.penPendingCurveAltChord = v;
        },
        set penPendingShiftAngleSnap(v: boolean) {
          self.penPendingShiftAngleSnap = v;
        },
        set penFirstAnchorP3Draft(v: PenFirstAnchorP3Draft | null) {
          self.penFirstAnchorP3Draft = v;
        },
        set penAwaitingFirstSegmentP3AfterDraft(v: boolean) {
          self.penAwaitingFirstSegmentP3AfterDraft = v;
        },
        get penAwaitingFirstSegmentP3AfterDraft() {
          return self.penAwaitingFirstSegmentP3AfterDraft;
        },
        clearPenFirstAnchorAwaitingDraft: () => self.clearPenFirstAnchorAwaitingDraft(),
        set penPointerSvg(v: { x: number; y: number } | null) {
          self.penPointerSvg = v;
        },
        clearDrawingState: () => clearDrawingStateForView(self.drawingStateClearView())
      };
    }
    return this.penBackspaceShortcutViewCache;
  }

  get isPenSessionActive(): boolean {
    return this.penSession.getSegments().length > 0;
  }

  /**
   * Close-from-start / join-to-moveto affordances require at least one **committed** drawing segment
   * after the subpath moveto (pending first segment does not count).
   */
  private penCommittedPathHasVertexBeyondMoveto(): boolean {
    const segs = this.penSession.getSegments();
    if (segs.length < 2 || segs[0]?.type !== 'M') return false;
    for (let i = 1; i < segs.length; i++) {
      const t = segs[i].type;
      if (t === 'L' || t === 'C' || t === 'S' || t === 'Q' || t === 'T') return true;
    }
    return false;
  }

  /** First segment from empty canvas: `M` only in session, pending anchor and press coincide with moveto. */
  private penPendingIsFirstSegmentFromMovetoGesture(): boolean {
    const pending = this.penPendingSegment;
    if (!pending || !penPathOnlyMoveto(this.penSession.getSegments())) return false;
    const m = this.penPathStartMv();
    if (!m) return false;
    return (
      penSvgDistanceSq(pending.anchor, m) < 1e-12 &&
      penSvgDistanceSq(pending.startSvg, m) < 1e-12
    );
  }

  /**
   * Plant-then-drag on the same point as the path tip (e.g. second press that commits `P3` and starts
   * the next segment): `anchor` and `startSvg` match; chord end and `penPointerSvg` must follow the
   * pointer like the first-segment-from-`M` gesture, not a fixed `startSvg` chord end.
   */
  private penPendingChordColocated(): boolean {
    const pending = this.penPendingSegment;
    if (!pending || this.penPendingIsFirstSegmentFromMovetoGesture()) return false;
    return penSvgDistanceSq(pending.anchor, pending.startSvg) < 1e-12;
  }

  /** `M` only and first segment incomplete: active pending from empty, or handle draft waiting for `P3`. */
  private penIncompleteFirstSegmentFromEmpty(): boolean {
    if (!penPathOnlyMoveto(this.penSession.getSegments())) return false;
    if (this.penAwaitingFirstSegmentP3AfterDraft) return true;
    if (this.penCommittedFirstSegmentP3Draft && this.penPendingSegment) return true;
    return this.penPendingSegment !== null && this.penPendingIsFirstSegmentFromMovetoGesture();
  }

  private penIncompleteColocatedSegmentEndpointDraft(): boolean {
    return this.penAwaitingColocatedSegmentEndpointAfterDraft;
  }

  private clearPenFirstAnchorAwaitingDraft(): void {
    this.penAwaitingFirstSegmentP3AfterDraft = false;
    this.penFirstAnchorP3Draft = null;
  }

  private clearPenCommittedFirstSegmentP3Draft(): void {
    this.penCommittedFirstSegmentP3Draft = null;
  }

  private clearPenColocatedSegmentEndpointDraft(): void {
    this.penAwaitingColocatedSegmentEndpointAfterDraft = false;
    this.penColocatedSegmentEndpointDraft = null;
  }

  /** Live pointer sample (snapped) for pending handle placement. */
  private penPendingDragSampleSvg(pending: Pick<PenPendingSegmentForPreview, 'startSvg'>): { x: number; y: number } {
    return samplePenPendingDragSvg(pending, this.penPendingDragSvg, this.penPointerSvg);
  }

  /**
   * Segment terminal used when calling {@link commitPenDraggedCurve} (`chordEndSvg` = chord end `P3`).
   * First-segment single-gesture: `P3` is always the first node (`startSvg`), not the mouseup location.
   */
  private penPendingResolvedEndSvgForCommit(
    pending: {
      anchor: { x: number; y: number };
      startClient: { x: number; y: number };
      startSvg: { x: number; y: number };
      ctrlCurve: boolean;
    },
    releaseSvg: { x: number; y: number } | null | undefined
  ): { x: number; y: number } {
    if (
      !this.penPendingIsFirstSegmentFromMovetoGesture() &&
      penSvgDistanceSq(pending.anchor, pending.startSvg) < 1e-12
    ) {
      const r = releaseSvg ?? this.penPendingDragSvg ?? this.penPointerSvg;
      if (r) return { x: r.x, y: r.y };
    }
    return { x: pending.startSvg.x, y: pending.startSvg.y };
  }

  /**
   * True when the pending segment began on the path start (within join/close tolerance in screen space).
   * Enables a scoped curve-preview rule without changing global marquee thresholds.
   */
  private penPendingStartNearPathMoveto(): boolean {
    return computePenPendingStartNearPathMoveto(
      this.penPendingSegment,
      this.penPathStartMv(),
      this.penCommittedPathHasVertexBeyondMoveto(),
      (ax, ay, bx, by) => this.penEndpointsWithinJoinTolerance(ax, ay, bx, by)
    );
  }

  /** Pending curve preview end vertex: exact `M` when closing from start, else effective segment end. */
  private penPendingCurvePreviewEndSvg(pending: PenPendingSegmentForPreview): { x: number; y: number } {
    return penPendingCurvePreviewEndUserSvg(
      pending,
      this.penPathStartMv(),
      this.penCommittedPathHasVertexBeyondMoveto(),
      (ax, ay, bx, by) => this.penEndpointsWithinJoinTolerance(ax, ay, bx, by)
    );
  }

  /**
   * Whether the pending segment should show curve-authoring chrome (Bézier `penCurvePreviewPathD` and/or
   * first-anchor mirrored handles). Uses marquee minimum drag for normal drags; when closing from start,
   * also allows a smaller screen threshold or a tiny root-SVG drag so users can shape the closing segment without leaving the start ring.
   */
  private penPendingShowsCurvePreviewForClose(): boolean {
    return computePenPendingShowsCurvePreviewForClose({
      penAwaitingFirstSegmentP3AfterDraft: this.penAwaitingFirstSegmentP3AfterDraft,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      penPendingSegment: this.penPendingSegment,
      penPendingLastClient: this.penPendingLastClient,
      penPendingDragSvg: this.penPendingDragSvg,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      penPendingStartNearPathMoveto: this.penPendingStartNearPathMoveto(),
      penPathStartMv: this.penPathStartMv()
    });
  }

  get penPendingShowsCurvePreview(): boolean {
    return this.penPendingShowsCurvePreviewForClose();
  }

  /**
   * Full in-progress pen preview (`M/L/C...`) including committed segments plus the current
   * pending segment to pointer. This keeps the whole path visible during authoring.
   */
  get penSessionPreviewPathD(): string | null {
    return computePenSessionPreviewPathD({
      penInsertOnPath: this.penInsertOnPath !== null,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      segments: this.penSession.getSegments(),
      penPointerSvg: this.penPointerSvg,
      penPendingSegment: this.penPendingSegment,
      penAwaitingFirstSegmentP3AfterDraft: this.penAwaitingFirstSegmentP3AfterDraft,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      appendPenPendingCurveToBaseD: (baseD) => this.appendPenPendingCurveToBaseD(baseD)
    });
  }

  /** Live Bézier preview `d` (committed segments + pending segment: default `C`, Ctrl+drag `Q` / `S` / `T`). */
  get penCurvePreviewPathD(): string | null {
    return computePenCurvePreviewPathD({
      penInsertOnPath: this.penInsertOnPath !== null,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      penPointerSvg: this.penPointerSvg,
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      segments: this.penSession.getSegments(),
      penPendingSegment: this.penPendingSegment,
      penAwaitingFirstSegmentP3AfterDraft: this.penAwaitingFirstSegmentP3AfterDraft,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      appendPenPendingCurveToBaseD: (baseD) => this.appendPenPendingCurveToBaseD(baseD)
    });
  }

  /**
   * First anchor on empty canvas: mirrored P1/P2 off P0 from drag only — no Bézier `path` preview (`P3` hidden).
   * Template uses this with {@link penCurvePreviewPathD} to decide when to render handle chrome.
   */
  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return (
      !!this.penPendingSegment &&
      this.penPendingIsFirstSegmentFromMovetoGesture() &&
      this.penPendingShowsCurvePreview
    );
  }

  /**
   * Plant-at-tip pending (same press as path end): mirrored handles only — no Bézier stroke in
   * {@link penCurvePreviewPathD} until the following primary down commits the segment.
   */
  get penColocatedTipMirroredHandleDragActive(): boolean {
    return (
      !!this.penPendingSegment &&
      this.penPendingChordColocated() &&
      this.penPendingShowsCurvePreview
    );
  }

  /** Chord end for curve handle geometry: live pointer while first-segment-from-empty draft is active. */
  private penPendingCurveGeometryEndSvg(pending: {
    anchor: { x: number; y: number };
    startClient: { x: number; y: number };
    startSvg: { x: number; y: number };
    ctrlCurve: boolean;
  }): { x: number; y: number } {
    if (this.penPendingIsFirstSegmentFromMovetoGesture() && this.penPointerSvg) {
      return this.penPointerSvg;
    }
    if (this.penPendingChordColocated() && this.penPointerSvg) {
      return this.penPointerSvg;
    }
    return this.penPendingCurvePreviewEndSvg(pending);
  }

  /** Control handle centers (overlay px) while dragging a curved segment preview. */
  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    if (!this.penPointerSvg) return [];
    return computePenCurveHandleOverlays({
      ports: this.ports,
      penPointerSvg: this.penPointerSvg,
      penMirroredHandleChromeActive:
        this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive,
      penPendingSegment: this.penPendingSegment,
      penPendingCurveAltChord: this.penPendingCurveAltChord,
      penPendingShiftAngleSnap: this.penPendingShiftAngleSnap,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      segments: this.penSession.getSegments(),
      penCurvePreviewPathD: this.penCurvePreviewPathD,
      penAwaitingFirstSegmentP3AfterDraft: this.penAwaitingFirstSegmentP3AfterDraft,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penCommittedFirstSegmentP3Draft: this.penCommittedFirstSegmentP3Draft,
      pendingDragSampleSvg: (pend) => this.penPendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.penPendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.penPendingCurveGeometryEndSvg(pend)
    });
  }



  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return computePenRubberBandOverlay({
      ports: this.ports,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penPointerSvg: this.penPointerSvg,
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      hasPendingSegment: this.penPendingSegment !== null,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      segments: this.penSession.getSegments()
    });
  }

  /** Dashed guide from last vertex to outgoing handle while rubber-banding the next segment. */
  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const h = computePenCommittedOutgoingHandleSvg({
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penPointerSvg: this.penPointerSvg,
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      segments: this.penSession.getSegments()
    });
    if (!h) return null;
    return penSvgUserSegmentToOverlayLine(this.ports, h.anchorX, h.anchorY, h.hx, h.hy);
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    const h = computePenCommittedOutgoingHandleSvg({
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penPointerSvg: this.penPointerSvg,
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      segments: this.penSession.getSegments()
    });
    if (!h) return null;
    const p2 = penSvgUserPointToOverlayPixel(this.ports, h.hx, h.hy);
    return { cx: p2.x, cy: p2.y };
  }

  /**
   * Green dashed handle guides while click-dragging a pending curve (incoming `P2` leg, and
   * pointer-to-`P3` leg as **outgoing preview** when not in Alt end-handle-only mode),
   * aligned with {@link penCurveHandleOverlays} geometry.
   */
  get penPendingCurveHandleGuideOverlays(): { x1: number; y1: number; x2: number; y2: number }[] {
    return computePenPendingCurveHandleGuideOverlays({
      ports: this.ports,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      penMirroredHandleChromeActive:
        this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive,
      penPointerSvg: this.penPointerSvg,
      penPendingSegment: this.penPendingSegment,
      penPendingCurveAltChord: this.penPendingCurveAltChord,
      penPendingShiftAngleSnap: this.penPendingShiftAngleSnap,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      segments: this.penSession.getSegments(),
      penCurvePreviewPathD: this.penCurvePreviewPathD,
      penAwaitingFirstSegmentP3AfterDraft: this.penAwaitingFirstSegmentP3AfterDraft,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penCommittedFirstSegmentP3Draft: this.penCommittedFirstSegmentP3Draft,
      pendingDragSampleSvg: (pend) => this.penPendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.penPendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.penPendingCurveGeometryEndSvg(pend)
    });
  }



  /** First-anchor close target when pointer is inside single-click-close radius — overlay px (cx/cy). */
  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    return computePenCloseTargetHoverOverlay({
      ports: this.ports,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penHoverClientPx: this.penHoverClientPx,
      segments: this.penSession.getSegments(),
      penCommittedPathHasVertexBeyondMoveto: this.penCommittedPathHasVertexBeyondMoveto(),
      isPenPointerWithinCloseRadius: (clientX, clientY) =>
        this.isPenPointerWithinCloseRadius(clientX, clientY)
    });
  }

  confirmDiscardPenSessionIfNeeded(reason: PenDiscardReason): boolean {
    if (!this.isPenSessionActive) return true;
    if (!this.ports.confirmDiscardInProgressPath(reason)) return false;
    this.clearDrawingState();
    return true;
  }

  penPathStartMv(): { x: number; y: number } | null {
    const s = this.penSession.getSegments()[0];
    return s?.type === 'M' ? { x: s.x, y: s.y } : null;
  }

  /**
   * True if (clientX, clientY) is within {@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} px of pen path start.
   */
  isPenPointerWithinCloseRadius(clientX: number, clientY: number): boolean {
    const m = this.penPathStartMv();
    if (!m) return false;
    return this.penClientPxWithinJoinToleranceVsSvgPoint(clientX, clientY, m.x, m.y);
  }

  /**
   * True if this pending segment began with primary **mousedown** within close radius of path start.
   * Close is evaluated on **mouseup** using this (not release position alone): drag-close-from-start can
   * release outside the ring and still close + `Z`. We do **not** close when the user only **dragged over**
   * the start and released there without pressing down on the close target first.
   */
  private penPendingMousedownInCloseRadius(): boolean {
    const pending = this.penPendingSegment;
    if (!pending) return false;
    if (!this.penCommittedPathHasVertexBeyondMoveto()) return false;
    return this.isPenPointerWithinCloseRadius(pending.startClient.x, pending.startClient.y);
  }

  /** Viewport-pixel tolerance match for pen join / single-click-close (never true if mapping fails). */
  penClientPxWithinJoinToleranceVsSvgPoint(
    clientX: number,
    clientY: number,
    svgX: number,
    svgY: number,
    tolPx = PEN_SINGLE_CLICK_CLOSE_RADIUS_PX
  ): boolean {
    return penClientPxWithinJoinToleranceVsSvgPointForPorts(this.ports, clientX, clientY, svgX, svgY, tolPx);
  }

  svgUserPointToApproxClient(userX: number, userY: number): { x: number; y: number } | null {
    return penSvgUserPointToApproxClientForPorts(this.ports, userX, userY);
  }

  /** Squared distance in viewport pixels between two root-SVG-user points (`null` if mapping fails). */
  penScreenDistanceSq(ax: number, ay: number, bx: number, by: number): number | null {
    return penScreenDistanceSqForPorts(this.ports, ax, ay, bx, by);
  }

  /** Pen: join hit test (~{@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} viewport px). Returns false if mapping fails so we never merge accidentally. */
  penEndpointsWithinJoinTolerance(ax: number, ay: number, bx: number, by: number): boolean {
    return penEndpointsWithinJoinToleranceForPorts(this.ports, ax, ay, bx, by);
  }

  /** Parse `<path>` `d`; must be **open** and pen-compatible drawable segments */
  openPenDrawableForJoin(pathId: string): { segments: PenPathSegment[]; d: string } | null {
    return openPenDrawableForJoinOnPorts(this.ports, pathId);
  }

  combinePenContinuationSegments(
    primary: readonly PenPathSegment[],
    continuation: readonly PenPathSegment[]
  ): PenPathSegment[] | null {
    return splicePenContinuationSegments(primary, continuation);
  }

  tryPickUpPenOpenPathContinuation(event: MouseEvent): boolean {
    if (this.penSession.getSegments().length !== 0) return false;
    const hit = findPenOpenPathPickupAtEvent(this.ports, event);
    if (!hit) return false;
    this.penContinuingPathRewrite = { pathId: hit.pathId, originalD: hit.originalD };
    this.penSession.restoreDrawableSegments(hit.segments);
    this.penPointerSvg = { x: hit.tail.x, y: hit.tail.y };
    this.penHoverClientPx = { x: event.clientX, y: event.clientY };
    this.ports.clearPenPostInsertAnchorOverlay();
    this.ports.markForCheck();
    return true;
  }

  findPenOpenPathFinishJoin(
    finishingSegs: readonly PenPathSegment[]
  ):
    | { pathId: string; originalD: string; existing: PenPathSegment[]; stitch: 'appendToExistingTail' | 'prependBeforeExisting' }
    | null {
    return findPenOpenPathFinishJoinForPorts(this.ports, finishingSegs);
  }

  /** Pen tool: Backspace pops last committed anchor; cancels in-progress segment first. */
  tryPenBackspaceShortcut(): boolean {
    return tryPenBackspaceShortcutForView(this.backspaceShortcutView());
  }

  clearDrawingState(): void {
    clearDrawingStateForView(this.drawingStateClearView());
  }

  showPenFinishFeedback(): void {
    this.penFinishFeedbackMessage = 'Add at least 2 points before finishing.';
    if (this.penFinishFeedbackTimer) {
      clearTimeout(this.penFinishFeedbackTimer);
    }
    this.penFinishFeedbackTimer = setTimeout(() => {
      this.penFinishFeedbackMessage = null;
      this.penFinishFeedbackTimer = null;
      this.ports.markForCheck();
    }, PEN_FINISH_FEEDBACK_DURATION_MS);
    this.ports.markForCheck();
  }

  clearPenFinishFeedback(): void {
    if (this.penFinishFeedbackTimer) {
      clearTimeout(this.penFinishFeedbackTimer);
      this.penFinishFeedbackTimer = null;
    }
    if (this.penFinishFeedbackMessage === null) return;
    this.penFinishFeedbackMessage = null;
    this.ports.markForCheck();
  }

  /**
   * After Shift angle snap: Alt end-handle-only mode updates only `(x2,y2)`; default mode mirrors
   * `(x1,y1)` through `(anchor,end)` from snapped `(x2,y2)` (see {@link snapCubicControlsFromShiftAnchor}).
   */
  snapPenPendingCubicControls(
    anchor: { x: number; y: number },
    end: { x: number; y: number },
    controls: CubicControlPoints,
    altEndHandleOnlyPlacement: boolean
  ): CubicControlPoints {
    if (!this.penPendingShiftAngleSnap) return controls;
    const s = snapVectorTo45DegFrom(end, { x: controls.x2, y: controls.y2 });
    if (altEndHandleOnlyPlacement) {
      return { ...controls, x2: s.x, y2: s.y };
    }
    return {
      x1: anchor.x + end.x - s.x,
      y1: anchor.y + end.y - s.y,
      x2: s.x,
      y2: s.y
    };
  }

  /**
   * Corner-anchor cubic placement or Alt pointer placement, optional smooth-node reflection on P1, then Shift 45° snap.
   */
  private penPendingCubicAdjustedSnappedControls(
    anchor: { x: number; y: number },
    end: { x: number; y: number },
    dragCurrent: { x: number; y: number },
    dragStartSvg: { x: number; y: number },
    segments: readonly PenPathSegment[],
    altEndOnly: boolean,
    shiftAngleSnap?: boolean,
    /** First-anchor awaiting `P3`: match preview path (`P2 === P3`). */
    zeroIncomingAtEnd = false
  ): CubicControlPoints {
    const sh = shiftAngleSnap === undefined ? this.penPendingShiftAngleSnap : shiftAngleSnap;
    return penAdjustedCubicControlsForPendingLikeDrag(
      anchor,
      end,
      dragCurrent,
      dragStartSvg,
      segments,
      altEndOnly,
      sh,
      zeroIncomingAtEnd
    );
  }

  /** Alt: use {@link placementPointerCubicControlPoints} (pointer on end handle only). */
  penPendingCubicAltEndHandleOnly(): boolean {
    return this.penPendingCurveAltChord;
  }

  appendPenPendingCurveToBaseD(baseD: string): string {
    const pending = this.penPendingSegment;
    if (!pending) return baseD;
    return buildPenPendingCurveAppendedBaseD({
      baseD,
      pending,
      segments: this.penSession.getSegments(),
      penCommittedFirstSegmentP3Draft: this.penCommittedFirstSegmentP3Draft,
      penPointerSvg: this.penPointerSvg,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      curvePreviewEndUserSvg: (pen) => this.penPendingCurvePreviewEndSvg(pen),
      dragSampleSvg: (pen) => this.penPendingDragSampleSvg(pen),
      penPendingCurveAltChord: this.penPendingCurveAltChord,
      penPendingShiftAngleSnap: this.penPendingShiftAngleSnap
    });
  }

  finishPenOutgoingHandleDrag(): void {
    const drag = this.penOutgoingHandleDrag;
    this.penOutgoingHandleDrag = null;
    if (!drag) return;
    const cur = this.penSession.getSegments()[drag.segmentIndex];
    if (!cur) return;
    if (JSON.stringify(cur) === JSON.stringify(drag.before)) return;
    const cmd = new PenSegmentReplaceCommand(
      drag.segmentIndex,
      drag.before,
      { ...cur } as PenPathSegment,
      (i, s) => {
        this.penSession.replaceSegmentAt(i, s);
        this.ports.markForCheck();
      },
      true
    );
    this.ports.editorHistory.pushAndExecute(cmd);
  }

  purgeProvisionalPenSegmentHistory(): void {
    this.ports.editorHistory.discardWhere((c) => c instanceof PenSegmentReplaceCommand);
  }

  commitPenDraggedCurve(
    anchor: { x: number; y: number },
    chordEndSvg: { x: number; y: number },
    dragCurrent: { x: number; y: number },
    ctrlCurve: boolean,
    /** When set (e.g. pen close-to-start), terminal anchor must match moveto `M` exactly — use session moveto, not pointer/snapped copies. */
    segmentEnd?: { x: number; y: number },
    /**
     * Illustrator-style chord origin (mousedown point). Defaults to {@link chordEndSvg} (two-click flow).
     * Single-gesture first segment: pass the initial press (`pending.startSvg` == anchor); `chordEndSvg` is also the anchor
     * while `dragCurrent` tracks the pointer for handle placement.
     */
    placementDragStartSvg?: { x: number; y: number },
    /** Step-one mirrored outgoing `P1` (first-anchor draft); overrides computed `P1` for cubic only. */
    frozenOutgoingP1Svg?: { x: number; y: number },
    /** First-anchor `P3` commit: `P2 === P3` (no incoming bend); outgoing uses `frozenOutgoingP1Svg` + placement drag from start. */
    zeroIncomingAtSegmentEnd = false
  ): void {
    commitPenDraggedCurveOnSession(
      this.penSession,
      {
        penPathStartMv: () => this.penPathStartMv(),
        penPendingCurveAltChord: this.penPendingCurveAltChord,
        penPendingShiftAngleSnap: this.penPendingShiftAngleSnap
      },
      {
        anchor,
        chordEndSvg,
        dragCurrent,
        ctrlCurve,
        segmentEnd,
        placementDragStartSvg,
        frozenOutgoingP1Svg,
        zeroIncomingAtSegmentEnd
      }
    );
  }

  commitPenPendingSegment(event: MouseEvent): void {
    commitPenPendingSegmentForView(this.pendingCommitView(), event);
  }

  /** Commit open drag as L/C using last pointer + last client motion (Enter / finish). */
  flushPenPendingAsCurrentPointer(): void {
    flushPenPendingAsCurrentPointerForView(this.pendingCommitView());
  }

  tryFinishPenPath(closePath: boolean): void {
    tryFinishPenPathForView(this.tryFinishPenPathView(), closePath);
  }

  handlePenCanvasMouseDown(event: MouseEvent, pt: { x: number; y: number }): void {
    handlePenCanvasMouseDownForView(this.canvasInputView(), event, pt);
  }

  /**
   * Pointer move while pen tool has an active session (viewport coordinates).
   */
  onDocumentMouseMovePen(
    event: MouseEvent,
    getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
  ): void {
    onDocumentMouseMovePenForView(this.canvasInputView(), event, getSnappedPenPoint);
  }

  onDocumentMouseUpPen(event: MouseEvent): void {
    onDocumentMouseUpPenForView(this.canvasInputView(), event);
  }

  onPenRightMouseDown(): void {
    if (this.isPenSessionActive) {
      this.tryFinishPenPath(false);
    }
  }

  /**
   * Primary-button pen interaction on the canvas (knob drag, insert-on-path, new anchor).
   * Caller must ensure tool is pen and `event.button === 0`.
   * @returns true when the event should use `preventDefault()` (handled pen interaction).
   */
  onCanvasPenPrimaryMouseDown(
    event: MouseEvent,
    getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
  ): boolean {
    return onCanvasPenPrimaryMouseDownForView(this.canvasInputView(), event, getSnappedPenPoint, (penTarget, ev) =>
      tryBeginPenInsertOnPathDrag(this.ports, this.insertOnPathDragMutable(), penTarget, ev)
    );
  }

  get canTryPenInsertNodeOnPath(): boolean {
    return (
      this.penSession.getSegments().length === 0 &&
      this.penPendingSegment === null &&
      this.penInsertOnPath === null
    );
  }

  private clearPenInsertOnPathDragState(): void {
    clearPenInsertOnPathDragMutable(this.ports, this.insertOnPathDragMutable());
  }

  /** Escape / cancel without mutating `d`. */
  cancelPenInsertOnPathDrag(): void {
    this.clearPenInsertOnPathDragState();
    this.ports.markForCheck();
  }

  get isPenInsertOnPathDragActive(): boolean {
    return this.penInsertOnPath !== null;
  }

  /** Target path id while insert-on-path drag is active (for overlay mapping in root user space). */
  get penInsertOnPathPathId(): string | null {
    return this.penInsertOnPath?.pathId ?? null;
  }

  /** Fixed on-curve point where the node is planted (path-local space, same as `d`). */
  get penInsertOnPathPlantedAnchorSvg(): { x: number; y: number } | null {
    return this.penInsertOnPath?.dragStartSvg ?? null;
  }

  get penInsertOnPathPreviewPathD(): string | null {
    if (!this.penInsertOnPath) return null;
    return computePenInsertOnPathPreviewPathD(
      this.penInsertOnPath,
      this.penInsertOnPathLastClient,
      this.penInsertOnPathPointerSvg
    );
  }

  /**
   * Read-only insert-on-path eligibility (shared with {@link tryBeginPenInsertOnPath} for debug HUD).
   */
  evaluatePenInsertOnPathAt(
    penTarget: Element,
    clientX: number,
    clientY: number
  ): PenInsertOnPathEvaluateResult {
    return evaluatePenInsertOnPathAtImpl(this.ports, penTarget, clientX, clientY);
  }

  /**
   * Human-readable prediction for primary mousedown while **Pen** is active (idle or active session).
   */
  describePenPrimaryMouseDownIntent(
    penTarget: Element | null,
    clientX: number,
    clientY: number,
    getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
  ): { headline: string; details: string[] } {
    const details: string[] = [];
    if (this.penInsertOnPath) {
      details.push(`pathId=${this.penInsertOnPath.pathId}`, 'mousemove updates preview; mouseup commits or cancels');
      return { headline: 'Pen: insert-on-path drag in progress', details };
    }
    if (!this.ports.isCanvasReadyForPenInput()) {
      return { headline: 'Pen: canvas not ready (no SVG / view)', details };
    }
    const outgoingKnob = penTarget?.closest?.('[data-pen-outgoing-handle]');
    if (outgoingKnob && this.isPenSessionActive && !this.penPendingSegment) {
      if (penLastOutgoingHandleSvg(this.penSession.getSegments())) {
        return { headline: 'Pen: drag last outgoing handle', details: ['Hit: pen outgoing handle knob'] };
      }
    }
    if (penTarget && this.ports.isEditorContentShapeTarget(penTarget)) {
      if (this.penSession.getSegments().length !== 0 || this.penPendingSegment) {
        details.push(`segments=${this.penSession.getSegments().length} pendingSegment=${this.penPendingSegment ? 'yes' : 'no'}`);
        return {
          headline: 'Pen: over shape — insert-on-path disabled (session not empty)',
          details
        };
      }
      const ins = this.evaluatePenInsertOnPathAt(penTarget, clientX, clientY);
      if (ins.ok) {
        details.push(`pathId=${ins.pathId}`, 'mousedown starts insert-drag; mouseup commits');
        return { headline: 'Pen: insert anchor on existing path', details };
      }
      details.push(`insert blocked: ${ins.reason}`);
      return {
        headline: 'Pen: over path — insert will NOT run (mousedown returns false; no new anchor here)',
        details
      };
    }
    const pt = getSnappedPenPoint(clientX, clientY, false);
    if (!pt) {
      return { headline: 'Pen: snap/grid produced no SVG point', details };
    }
    details.push(`svg (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
    return {
      headline: 'Pen: new stroke / pickup / continue (handlePenCanvasMouseDown)',
      details
    };
  }

  private finishPenInsertOnPathDrag(event: MouseEvent): void {
    finishPenInsertOnPathDragFlow(this.ports, this.insertOnPathDragMutable(), event);
  }

  getPenSessionSegments(): readonly PenPathSegment[] {
    return this.penSession.getSegments();
  }

  dispose(): void {
    if (this.penFinishFeedbackTimer) {
      clearTimeout(this.penFinishFeedbackTimer);
      this.penFinishFeedbackTimer = null;
    }
    if (this.penInsertOnPath) {
      this.clearPenInsertOnPathDragState();
    }
    this.clearPenFirstAnchorAwaitingDraft();
    this.clearPenCommittedFirstSegmentP3Draft();
    this.clearPenColocatedSegmentEndpointDraft();
  }
}
