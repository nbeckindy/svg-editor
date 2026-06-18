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
 * `pen-tool-session-first-anchor-p3-commit.ts` (first `C` from `M` when {@link PenPendingSegmentForPreview.firstSegmentCurveDraft}
 * is attached). Finish orchestration in
 * `pen-tool-session-try-finish-path.ts`. Session reset + backspace in
 * `pen-tool-session-lifecycle.ts` and `pen-tool-session-backspace.ts`. Unified
 * `*View` adapter in `pen-tool-session-context.ts`.
 */
import {
  PenSession,
  penPathOnlyMoveto,
  penPathSegmentsToD,
  penSvgDistanceSq,
  penLastOutgoingHandleSvg,
  penStartingLegIsCubic,
  type PenFirstAnchorP3Draft,
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
  PEN_FINISH_FEEDBACK_DURATION_MS
} from './pen-tool-session-constants';
import {
  computePenPendingShowsCurvePreviewForClose,
  penPendingCurvePreviewEndSvg as penPendingCurvePreviewEndUserSvg,
  penPendingDragSampleSvg as samplePenPendingDragSvg,
  penPendingStartNearPathMoveto as computePenPendingStartNearPathMoveto,
  penPendingStartNearPathCloseTarget as computePenPendingStartNearPathCloseTarget,
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
  computePenOpenPathContinueHoverOverlay,
  computePenRubberBandOverlay
} from './pen-tool-session-preview-overlays';
import {
  computePenCurveHandleOverlays,
  computePenPendingCurveHandleGuideOverlays
} from './pen-tool-session-curve-handle-overlays';
import { commitPenDraggedCurveOnSession } from './pen-tool-session-commit-dragged-curve';
import {
  commitPenPendingSegmentForView,
  flushPenPendingAsCurrentPointerForView
} from './pen-tool-session-pending-commit';
import {
  handlePenCanvasMouseDownForView,
  onCanvasPenPrimaryMouseDownForView,
  onDocumentMouseMovePenForView,
  onDocumentMouseUpPenForView
} from './pen-tool-session-canvas-input';
import {
  findPenOpenPathEndpointHoverAtClient,
  findPenOpenPathPickupAtEvent,
  isPrependContinuationCloseAtFrozenTail,
  penClientPxWithinJoinToleranceVsSvgPoint as penClientPxWithinJoinToleranceVsSvgPointForPorts,
  penEndpointsWithinJoinTolerance as penEndpointsWithinJoinToleranceForPorts,
  penSessionCloseTargetMv,
  type PenContinuingPathRewrite
} from './pen-tool-session-path-continuation';
import { tryFinishPenPathForView } from './pen-tool-session-try-finish-path';
import { clearDrawingStateForView } from './pen-tool-session-lifecycle';
import { tryPenBackspaceShortcutForView } from './pen-tool-session-backspace';
import {
  createPenToolSessionViewContext,
  type PenToolSessionViewDelegate,
  type PenToolSessionViewContext
} from './pen-tool-session-context';

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
   * After meaningful first-segment handle drag + mouseup: path stays `M` only; this holds frozen
   * outgoing-handle samples until the next primary **down** plants `P3` on {@link penPendingSegment}
   * (then copied to {@link PenPendingSegmentForPreview.firstSegmentCurveDraft}).
   */
  private penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null = null;
  /**
   * After plant-at-tip (same press as last vertex) + handle drag + mouseup: next primary down plants the
   * segment endpoint and commits the cubic — mirrors first-segment `M`-only draft → `P3` flow.
   */
  private penAwaitingColocatedSegmentEndpointAfterDraft = false;
  private penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null = null;
  private penHoverClientPx: { x: number; y: number } | null = null;
  private penContinuingPathRewrite: PenContinuingPathRewrite | null = null;
  private penOutgoingHandleDrag: { segmentIndex: number; before: PenPathSegment } | null = null;

  /** Mousedown→drag→mouseup insert on an existing path (idle pen session). */
  private penInsertOnPath: PenInsertOnPathDragState | null = null;
  private penInsertOnPathLastClient: { x: number; y: number } | null = null;
  private penInsertOnPathPointerSvg: { x: number; y: number } | null = null;

  private penInsertOnPathDragBagCache: PenInsertOnPathDragMutable | null = null;
  private penViewDelegateCache: PenToolSessionViewDelegate | null = null;
  private penViewContextCache: PenToolSessionViewContext | null = null;

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

  private viewDelegate(): PenToolSessionViewDelegate {
    if (!this.penViewDelegateCache) {
      const s = this;
      this.penViewDelegateCache = {
        get ports() {
          return s.ports;
        },
        get penSession() {
          return s.penSession;
        },
        insertOnPathMutable: () => s.insertOnPathDragMutable(),
        getPointerSvg: () => s.penPointerSvg,
        setPointerSvg: (v) => {
          s.penPointerSvg = v;
        },
        getPendingSegment: () => s.penPendingSegment,
        setPendingSegment: (v) => {
          s.penPendingSegment = v;
        },
        getPendingLastClient: () => s.penPendingLastClient,
        setPendingLastClient: (v) => {
          s.penPendingLastClient = v;
        },
        getPendingDragSvg: () => s.penPendingDragSvg,
        setPendingDragSvg: (v) => {
          s.penPendingDragSvg = v;
        },
        getPendingCurveAltChord: () => s.penPendingCurveAltChord,
        setPendingCurveAltChord: (v) => {
          s.penPendingCurveAltChord = v;
        },
        getPendingShiftAngleSnap: () => s.penPendingShiftAngleSnap,
        setPendingShiftAngleSnap: (v) => {
          s.penPendingShiftAngleSnap = v;
        },
        getFirstAnchorP3Draft: () => s.penFirstAnchorP3Draft,
        setFirstAnchorP3Draft: (v) => {
          s.penFirstAnchorP3Draft = v;
        },
        getAwaitingColocatedEndpoint: () => s.penAwaitingColocatedSegmentEndpointAfterDraft,
        setAwaitingColocatedEndpoint: (v) => {
          s.penAwaitingColocatedSegmentEndpointAfterDraft = v;
        },
        getColocatedDraft: () => s.penColocatedSegmentEndpointDraft,
        setColocatedDraft: (v) => {
          s.penColocatedSegmentEndpointDraft = v;
        },
        getHoverClientPx: () => s.penHoverClientPx,
        setHoverClientPx: (v) => {
          s.penHoverClientPx = v;
        },
        getContinuingPathRewrite: () => s.penContinuingPathRewrite,
        setContinuingPathRewrite: (v) => {
          s.penContinuingPathRewrite = v;
        },
        getOutgoingHandleDrag: () => s.penOutgoingHandleDrag,
        setOutgoingHandleDrag: (v) => {
          s.penOutgoingHandleDrag = v;
        },
        getInsertOnPath: () => s.penInsertOnPath,
        getFinishFeedbackMessage: () => s.penFinishFeedbackMessage,
        isPenSessionActive: () => s.isPenSessionActive,
        penPathStartMv: () => s.penPathStartMv(),
        penPathCloseTargetMv: () => s.penPathCloseTargetMv(),
        penPendingShowsCurvePreview: () => s.penPendingShowsCurvePreview,
        penPendingMousedownInCloseRadius: () => s.penPendingMousedownInCloseRadius(),
        penPendingResolvedEndForCommit: (p, r) => s.penPendingResolvedEndSvgForCommit(p, r),
        penPendingIsFirstFromMoveto: () => s.penPendingIsFirstSegmentFromMovetoGesture(),
        penPendingChordColocated: () => s.penPendingChordColocated(),
        penPendingStartNearPathMoveto: () => s.penPendingStartNearPathMoveto(),
        penPendingStartNearPathCloseTarget: () => s.penPendingStartNearPathCloseTarget(),
        penPendingCubicAltEndOnly: () => s.penPendingCubicAltEndHandleOnly(),
        isPenPointerWithinCloseRadius: (clientX, clientY) => s.isPenPointerWithinCloseRadius(clientX, clientY),
        clearFirstAnchorAwaitingDraft: () => s.clearPenFirstAnchorAwaitingDraft(),
        clearColocatedSegmentEndpointDraft: () => s.clearPenColocatedSegmentEndpointDraft(),
        commitPenDraggedCurve: (a, c, d, ctrl, se, pl, fr, z) =>
          s.commitPenDraggedCurve(a, c, d, ctrl, se, pl, fr, z),
        tryFinishPenPath: (close) => s.tryFinishPenPath(close),
        tryPickUpPenOpenPathContinuation: (e) => s.tryPickUpPenOpenPathContinuation(e),
        finishPenOutgoingHandleDrag: () => s.finishPenOutgoingHandleDrag(),
        finishPenInsertOnPathDrag: (e) => s.finishPenInsertOnPathDrag(e),
        incompleteFirstSegmentFromEmpty: () => s.penIncompleteFirstSegmentFromEmpty(),
        incompleteColocatedSegmentEndpointDraft: () => s.penIncompleteColocatedSegmentEndpointDraft(),
        showPenFinishFeedback: () => s.showPenFinishFeedback(),
        purgeProvisionalPenSegmentHistory: () => s.purgeProvisionalPenSegmentHistory(),
        clearPenFinishFeedback: () => s.clearPenFinishFeedback(),
        clearPenInsertOnPathDragState: () => s.clearPenInsertOnPathDragState()
      };
    }
    return this.penViewDelegateCache;
  }

  private viewContext(): PenToolSessionViewContext {
    if (!this.penViewContextCache) {
      this.penViewContextCache = createPenToolSessionViewContext(this.viewDelegate());
    }
    return this.penViewContextCache;
  }

  get isPenSessionActive(): boolean {
    return this.penSession.getSegments().length > 0;
  }

  /**
   * Close ring / click-to-close allowed when there is drawable geometry after `M`, or when prepending
   * from an open path head (close at frozen tail reuses existing body + `Z`).
   */
  private penCloseAffordanceAllowed(): boolean {
    if (this.penCommittedPathHasVertexBeyondMoveto()) return true;
    return isPrependContinuationCloseAtFrozenTail(this.penContinuingPathRewrite);
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

  /** `M` only and first segment incomplete: gap draft, pending with attached first-segment draft, or colocated first press. */
  private penIncompleteFirstSegmentFromEmpty(): boolean {
    if (!penPathOnlyMoveto(this.penSession.getSegments())) return false;
    if (this.penFirstAnchorP3Draft && !this.penPendingSegment) return true;
    if (this.penPendingSegment?.firstSegmentCurveDraft) return true;
    return this.penPendingSegment !== null && this.penPendingIsFirstSegmentFromMovetoGesture();
  }

  private penIncompleteColocatedSegmentEndpointDraft(): boolean {
    return this.penAwaitingColocatedSegmentEndpointAfterDraft;
  }

  private clearPenFirstAnchorAwaitingDraft(): void {
    this.penFirstAnchorP3Draft = null;
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
      (ax, ay, bx, by) => penEndpointsWithinJoinToleranceForPorts(this.ports, ax, ay, bx, by)
    );
  }

  private penPendingStartNearPathCloseTarget(): boolean {
    return computePenPendingStartNearPathCloseTarget(
      this.penPendingSegment,
      this.penPathCloseTargetMv(),
      (ax, ay, bx, by) => penEndpointsWithinJoinToleranceForPorts(this.ports, ax, ay, bx, by)
    );
  }

  /** Pending curve preview end vertex: exact close target when closing, else effective segment end. */
  private penPendingCurvePreviewEndSvg(pending: PenPendingSegmentForPreview): { x: number; y: number } {
    return penPendingCurvePreviewEndUserSvg(
      pending,
      this.penPathCloseTargetMv(),
      this.penCommittedPathHasVertexBeyondMoveto(),
      (ax, ay, bx, by) => penEndpointsWithinJoinToleranceForPorts(this.ports, ax, ay, bx, by)
    );
  }

  /**
   * Whether the pending segment should show curve-authoring chrome (Bézier `penCurvePreviewPathD` and/or
   * first-anchor mirrored handles). Uses marquee minimum drag for normal drags; when closing from start,
   * also allows a smaller screen threshold or a tiny root-SVG drag so users can shape the closing segment without leaving the start ring.
   */
  private penPendingShowsCurvePreviewForClose(): boolean {
    return computePenPendingShowsCurvePreviewForClose({
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      penAwaitingColocatedSegmentEndpointAfterDraft: this.penAwaitingColocatedSegmentEndpointAfterDraft,
      penColocatedSegmentEndpointDraft: this.penColocatedSegmentEndpointDraft,
      penPendingSegment: this.penPendingSegment,
      penPendingLastClient: this.penPendingLastClient,
      penPendingDragSvg: this.penPendingDragSvg,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      penPendingStartNearPathMoveto: this.penPendingStartNearPathMoveto(),
      penPathStartMv: this.penPathCloseTargetMv(),
      allowRelaxedCloseRingCurvePreview: penStartingLegIsCubic(this.penSession.getSegments())
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
      penFirstAnchorGapP3Draft: this.penFirstAnchorP3Draft !== null && this.penPendingSegment === null,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      pendingDragSampleSvg: (pend) => this.penPendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.penPendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.penPendingCurveGeometryEndSvg(pend),
      penPendingLastClient: this.penPendingLastClient
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
      penFirstAnchorGapP3Draft: this.penFirstAnchorP3Draft !== null && this.penPendingSegment === null,
      penFirstAnchorP3Draft: this.penFirstAnchorP3Draft,
      pendingDragSampleSvg: (pend) => this.penPendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.penPendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.penPendingCurveGeometryEndSvg(pend),
      penPendingLastClient: this.penPendingLastClient
    });
  }



  /** First-anchor close target when pointer is inside single-click-close radius — overlay px (cx/cy). */
  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    return computePenCloseTargetHoverOverlay({
      ports: this.ports,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penHoverClientPx: this.penHoverClientPx,
      penCloseTargetMv: this.penPathCloseTargetMv(),
      penCloseAffordanceAllowed: this.penCloseAffordanceAllowed(),
      isPenPointerWithinCloseRadius: (clientX, clientY) =>
        this.isPenPointerWithinCloseRadius(clientX, clientY)
    });
  }

  /** Idle pen: open-path head/tail continue affordance — same ring styling as close target. */
  get penOpenPathContinueHoverOverlay(): { cx: number; cy: number } | null {
    return computePenOpenPathContinueHoverOverlay({
      ports: this.ports,
      currentToolIsPen: this.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.isPenSessionActive,
      penHoverClientPx: this.penHoverClientPx,
      findOpenPathEndpointHoverAtClient: (clientX, clientY) => {
        const hit = findPenOpenPathEndpointHoverAtClient(this.ports, clientX, clientY);
        return hit ? hit.endpoint : null;
      }
    });
  }

  /** While continuing from an open path head, show the frozen existing stroke as a ghost preview. */
  get penContinuationGhostPathD(): string | null {
    const cont = this.penContinuingPathRewrite;
    if (cont?.stitch !== 'prependBeforeExisting' || !cont.existingSegments?.length) {
      return null;
    }
    return penPathSegmentsToD(cont.existingSegments);
  }

  /** Update hover sample for idle-pen continue ring (throttled from canvas pointer router). */
  updateIdlePenHoverClient(clientX: number, clientY: number): void {
    if (this.ports.getCurrentTool() !== 'pen' || this.isPenSessionActive || this.isPenInsertOnPathDragActive) {
      if (this.penHoverClientPx !== null) {
        this.penHoverClientPx = null;
        this.ports.markForCheck();
      }
      return;
    }
    this.penHoverClientPx = { x: clientX, y: clientY };
    this.ports.markForCheck();
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

  /** Close-ring / click-to-close target: frozen-path tail when prepending from `M`, else session `M`. */
  penPathCloseTargetMv(): { x: number; y: number } | null {
    return penSessionCloseTargetMv(this.penContinuingPathRewrite, this.penSession.getSegments());
  }

  /**
   * True if (clientX, clientY) is within {@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} px of the close target.
   */
  isPenPointerWithinCloseRadius(clientX: number, clientY: number): boolean {
    const target = this.penPathCloseTargetMv();
    if (!target) return false;
    return penClientPxWithinJoinToleranceVsSvgPointForPorts(this.ports, clientX, clientY, target.x, target.y);
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
    if (!this.penCloseAffordanceAllowed()) return false;
    return this.isPenPointerWithinCloseRadius(pending.startClient.x, pending.startClient.y);
  }

  wouldPickUpPenOpenPathContinuationAt(event: MouseEvent): boolean {
    if (this.penSession.getSegments().length !== 0 || this.penPendingSegment || this.penInsertOnPath) {
      return false;
    }
    return findPenOpenPathPickupAtEvent(this.ports, event) !== null;
  }

  tryPickUpPenOpenPathContinuation(event: MouseEvent): boolean {
    if (this.penSession.getSegments().length !== 0) return false;
    const hit = findPenOpenPathPickupAtEvent(this.ports, event);
    if (!hit) return false;
    if (hit.stitch === 'appendToExistingTail') {
      this.penContinuingPathRewrite = {
        pathId: hit.pathId,
        originalD: hit.originalD,
        stitch: 'appendToExistingTail'
      };
      this.penSession.restoreDrawableSegments(hit.segments);
    } else {
      this.penContinuingPathRewrite = {
        pathId: hit.pathId,
        originalD: hit.originalD,
        stitch: 'prependBeforeExisting',
        existingSegments: hit.segments
      };
      this.penSession.beginPath(hit.endpoint.x, hit.endpoint.y);
    }
    this.penPointerSvg = { x: hit.endpoint.x, y: hit.endpoint.y };
    this.penHoverClientPx = { x: event.clientX, y: event.clientY };
    this.ports.clearPenPostInsertAnchorOverlay();
    this.ports.markForCheck();
    return true;
  }

  /** Pen tool: Backspace pops last committed anchor; cancels in-progress segment first. */
  tryPenBackspaceShortcut(): boolean {
    return tryPenBackspaceShortcutForView(this.viewContext());
  }

  clearDrawingState(): void {
    clearDrawingStateForView(this.viewContext());
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

  /** Alt: chord end handle only (pointer placement on `P2`). */
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
      penPointerSvg: this.penPointerSvg,
      penPendingIsFirstSegmentFromMovetoGesture: this.penPendingIsFirstSegmentFromMovetoGesture(),
      penPendingChordColocated: this.penPendingChordColocated(),
      curvePreviewEndUserSvg: (pen) => this.penPendingCurvePreviewEndSvg(pen),
      dragSampleSvg: (pen) => this.penPendingDragSampleSvg(pen),
      penPendingCurveAltChord: this.penPendingCurveAltChord,
      penPendingShiftAngleSnap: this.penPendingShiftAngleSnap,
      penPendingLastClient: this.penPendingLastClient
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
    commitPenPendingSegmentForView(this.viewContext(), event);
  }

  /** Commit open drag as L/C using last pointer + last client motion (Enter / finish). */
  flushPenPendingAsCurrentPointer(): void {
    flushPenPendingAsCurrentPointerForView(this.viewContext());
  }

  tryFinishPenPath(closePath: boolean): void {
    tryFinishPenPathForView(this.viewContext(), closePath);
  }

  handlePenCanvasMouseDown(event: MouseEvent, pt: { x: number; y: number }): void {
    handlePenCanvasMouseDownForView(this.viewContext(), event, pt);
  }

  /**
   * Pointer move while pen tool has an active session (viewport coordinates).
   */
  onDocumentMouseMovePen(
    event: MouseEvent,
    getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
  ): void {
    onDocumentMouseMovePenForView(this.viewContext(), event, getSnappedPenPoint);
  }

  onDocumentMouseUpPen(event: MouseEvent): void {
    onDocumentMouseUpPenForView(this.viewContext(), event);
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
    return onCanvasPenPrimaryMouseDownForView(this.viewContext(), event, getSnappedPenPoint, (penTarget, ev) =>
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
      if (this.wouldPickUpPenOpenPathContinuationAt({ clientX, clientY } as MouseEvent)) {
        return { headline: 'Pen: continue open path at endpoint', details: ['Hit: open path head/tail'] };
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
    this.clearPenColocatedSegmentEndpointDraft();
  }
}
