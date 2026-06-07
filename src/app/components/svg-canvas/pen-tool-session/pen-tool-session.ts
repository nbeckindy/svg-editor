/**
 * Orchestrates in-progress pen path authoring (preview, pointer, keyboard, commit).
 * Logical inputs and document effects cross {@link PenToolSessionPorts} (see `pen-tool-session-ports.ts`)
 * so the **Canvas adapter** stays a DOM/view adapter and this module stays unit-testable without full TestBed.
 * Finish-to-document and insert-on-path helpers live in `pen-tool-session-finish.ts` and
 * `pen-tool-session-insert-on-path.ts`; SVG user → **Editor chrome** overlay mapping helpers in
 * `pen-tool-session-overlay.ts`. Shared pen thresholds and pending-segment preview math in
 * `pen-tool-session-constants.ts` and `pen-tool-session-pending-preview.ts`. In-progress path `d` strings
 * for templates live in `pen-tool-session-preview-path-d.ts`.
 */
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { rootSvgUserPointToScreenPoint } from '../../../utils/svg-screen-user';
import {
  PenSession,
  lastCommittedVertex,
  penDragCurveAuthoringKind,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penPathSegmentsToD,
  penReflectStateAfterCommitted,
  penCubicSmoothReflectP1Usable,
  penSvgDistanceSq,
  penRewriteLastSegmentEndToMatchMoveto,
  penLastOutgoingHandleSvg,
  movePenLastOutgoingHandleTo,
  snapVectorTo45DegFrom,
  penAdjustedCubicControlsForPendingLikeDrag,
  penFirstAnchorMirroredHandleControlsFromDrag,
  placementPointerCubicControlPoints,
  placementPointerQuadraticControlPoint,
  type PenFirstAnchorP3Draft,
  type CubicControlPoints,
  type PenPathSegment
} from '../../../models/pen-path';
import { parsePathD, parsePathDForNodeEditing } from '../../../models/path-d';
import { PenSegmentReplaceCommand } from '../../../models/editor-commands';
import { applyPenFinishedPathDocumentEffects } from './pen-tool-session-finish';
import {
  computePenInsertOnPathPreviewPathD,
  computePenInsertOnPathReleaseD,
  createPenInsertOnPathDragState,
  evaluatePenInsertOnPathAt as evaluatePenInsertOnPathAtImpl,
  restorePenInsertPathVisibility,
  type PenInsertOnPathDragState,
  type PenInsertOnPathEvaluateResult
} from './pen-tool-session-insert-on-path';
import type { PenDiscardReason, PenToolSessionPorts } from './pen-tool-session-ports';
import { penSvgUserPointToOverlayPixel, penSvgUserSegmentToOverlayLine } from './pen-tool-session-overlay';
import {
  PEN_FINISH_FEEDBACK_DURATION_MS,
  PEN_SINGLE_CLICK_CLOSE_RADIUS_PX,
  PEN_CLOSE_MOVETO_REWRITE_MAX_SQ
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

  constructor(private readonly ports: PenToolSessionPorts) {}


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
    if (this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive) {
      const pending = this.penPendingSegment!;
      if (this.penPendingCubicAltEndHandleOnly()) return [];
      const anchor = pending.anchor;
      const c = penFirstAnchorMirroredHandleControlsFromDrag(
        anchor,
        this.penPointerSvg,
        this.penPendingShiftAngleSnap
      );
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(this.ports, x, y);
      const p1 = toOverlay(c.x1, c.y1);
      const p2 = toOverlay(c.x2, c.y2);
      return [
        { cx: p1.x, cy: p1.y },
        { cx: p2.x, cy: p2.y }
      ];
    }
    if (
      this.penAwaitingColocatedSegmentEndpointAfterDraft &&
      this.penColocatedSegmentEndpointDraft &&
      !penPathOnlyMoveto(this.penSession.getSegments())
    ) {
      const segs = this.penSession.getSegments();
      const tip = lastCommittedVertex(segs);
      const draft = this.penColocatedSegmentEndpointDraft;
      if (!tip || !draft) return [];
      const anchor = tip;
      const end = this.penPointerSvg;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(this.ports, x, y);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = this.penPendingCubicAdjustedSnappedControls(
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = toOverlay(x1, y1);
          return [{ cx: p1.x, cy: p1.y }];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const p = toOverlay(qc.x1, qc.y1);
          return [{ cx: p.x, cy: p.y }];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          const p1 = toOverlay(sx1, sy1);
          const p2 = toOverlay(hx, hy);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        default: {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            const p = toOverlay(qc.x1, qc.y1);
            return [{ cx: p.x, cy: p.y }];
          }
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          const p = toOverlay(ix, iy);
          return [{ cx: p.x, cy: p.y }];
        }
      }
    }
    if (!this.penCurvePreviewPathD) return [];
    if (this.penAwaitingFirstSegmentP3AfterDraft && this.penFirstAnchorP3Draft) {
      const segs = this.penSession.getSegments();
      const m = segs[0];
      if (m.type !== 'M') return [];
      const anchor = { x: m.x, y: m.y };
      const end = this.penPointerSvg;
      const draft = this.penFirstAnchorP3Draft;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(this.ports, x, y);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = this.penPendingCubicAdjustedSnappedControls(
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = toOverlay(x1, y1);
          return [{ cx: p1.x, cy: p1.y }];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const p = toOverlay(qc.x1, qc.y1);
          return [{ cx: p.x, cy: p.y }];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          const p1 = toOverlay(sx1, sy1);
          const p2 = toOverlay(hx, hy);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        default: {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            const p = toOverlay(qc.x1, qc.y1);
            return [{ cx: p.x, cy: p.y }];
          }
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          const p = toOverlay(ix, iy);
          return [{ cx: p.x, cy: p.y }];
        }
      }
    }
    if (
      this.penCommittedFirstSegmentP3Draft &&
      this.penPendingSegment &&
      penPathOnlyMoveto(this.penSession.getSegments())
    ) {
      const p3d = this.penCommittedFirstSegmentP3Draft;
      const pending = this.penPendingSegment;
      const segs = this.penSession.getSegments();
      const m = segs[0];
      if (m.type !== 'M') return [];
      const anchorMv = { x: m.x, y: m.y };
      const end = this.penPendingCurvePreviewEndSvg(pending);
      const dragCurrent = this.penPendingDragSampleSvg(pending);
      const kind = penDragCurveAuthoringKind(pending.ctrlCurve, segs);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = this.penPendingCubicAltEndHandleOnly();
          const c = this.penPendingCubicAdjustedSnappedControls(
            anchorMv,
            end,
            dragCurrent,
            p3d.placementDragStartSvg,
            segs,
            altEndOnly,
            this.penPendingShiftAngleSnap,
            false
          );
          const x1 = p3d.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = p3d.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = penSvgUserPointToOverlayPixel(this.ports, x1, y1);
          const p2 = penSvgUserPointToOverlayPixel(this.ports, c.x2, c.y2);
          if (altEndOnly) {
            return [
              { cx: p1.x, cy: p1.y },
              { cx: p2.x, cy: p2.y }
            ];
          }
          const pOut = penSvgUserPointToOverlayPixel(this.ports, dragCurrent.x, dragCurrent.y);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y },
            { cx: pOut.x, cy: pOut.y }
          ];
        }
        default:
          return [];
      }
    }
    if (!this.penPendingSegment) return [];
    const pending = this.penPendingSegment;
    const anchor = pending.anchor;
    const end = this.penPendingCurveGeometryEndSvg(pending);
    const dragCurrent = this.penPendingDragSampleSvg(pending);
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, this.penSession.getSegments());
    const toOverlay = (x: number, y: number) =>
      penSvgUserPointToOverlayPixel(this.ports, x, y);

    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const { x1, y1, x2, y2 } = this.penPendingCubicAdjustedSnappedControls(
          anchor,
          end,
          dragCurrent,
          pending.startSvg,
          this.penSession.getSegments(),
          altEndOnly
        );
        const p1 = toOverlay(x1, y1);
        const p2 = toOverlay(x2, y2);
        if (altEndOnly) {
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        const pOut = toOverlay(dragCurrent.x, dragCurrent.y);
        return [
          { cx: p2.x, cy: p2.y },
          { cx: pOut.x, cy: pOut.y }
        ];
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        const p = toOverlay(qc.x1, qc.y1);
        return [{ cx: p.x, cy: p.y }];
      }
      case 'smoothCubic': {
        const st = penReflectStateAfterCommitted(this.penSession.getSegments());
        if (!st) return [];
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        const p1 = toOverlay(sx1, sy1);
        const p2 = toOverlay(hx, hy);
        return [
          { cx: p1.x, cy: p1.y },
          { cx: p2.x, cy: p2.y }
        ];
      }
      default: {
        const st = penReflectStateAfterCommitted(this.penSession.getSegments());
        if (!st) return [];
        if (this.penPendingCurveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const p = toOverlay(qc.x1, qc.y1);
          return [{ cx: p.x, cy: p.y }];
        }
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        const p = toOverlay(ix, iy);
        return [{ cx: p.x, cy: p.y }];
      }
    }
  }

  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (!this.isPenSessionActive || !this.penPointerSvg || this.ports.getCurrentTool() !== 'pen') {
      return null;
    }
    if (this.penPendingShowsCurvePreview) return null;
    if (this.penPendingSegment && this.penPendingIsFirstSegmentFromMovetoGesture()) {
      return null;
    }
    if (this.penPendingSegment && this.penPendingChordColocated()) {
      return null;
    }
    // No straight anchor→pointer chord while a segment endpoint is planted (committed path on session
    // preview + curve stroke on {@link penCurvePreviewPathD} after the drag threshold).
    if (this.penPendingSegment) {
      return null;
    }
    // Suppress the straight rubber-band when we're already showing a smooth-departure curve preview.
    {
      const segs = this.penSession.getSegments();
      const lvRb = lastCommittedVertex(segs);
      const stRb = penReflectStateAfterCommitted(segs);
      if (lvRb && penCubicSmoothReflectP1Usable(stRb, lvRb)) return null;
    }
    const anchor = lastCommittedVertex(this.penSession.getSegments());
    if (!anchor) return null;
    return penSvgUserSegmentToOverlayLine(
      this.ports,
      anchor.x,
      anchor.y,
      this.penPointerSvg.x,
      this.penPointerSvg.y
    );
  }

  /** Dashed guide from last vertex to outgoing handle while rubber-banding the next segment. */
  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const h = this.penCommittedOutgoingHandleSvg();
    if (!h) return null;
    return penSvgUserSegmentToOverlayLine(this.ports, h.anchorX, h.anchorY, h.hx, h.hy);
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    const h = this.penCommittedOutgoingHandleSvg();
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
    if (this.ports.getCurrentTool() !== 'pen') {
      return [];
    }
    if (
      (this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive) &&
      this.penPointerSvg &&
      this.penPendingSegment
    ) {
      const pending = this.penPendingSegment;
      if (this.penPendingCubicAltEndHandleOnly()) return [];
      const anchor = pending.anchor;
      const c = penFirstAnchorMirroredHandleControlsFromDrag(
        anchor,
        this.penPointerSvg,
        this.penPendingShiftAngleSnap
      );
      const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
        penSvgUserSegmentToOverlayLine(this.ports, x1s, y1s, x2s, y2s);
      return [line(anchor.x, anchor.y, c.x1, c.y1), line(anchor.x, anchor.y, c.x2, c.y2)];
    }
    if (
      this.penAwaitingColocatedSegmentEndpointAfterDraft &&
      this.penColocatedSegmentEndpointDraft &&
      !penPathOnlyMoveto(this.penSession.getSegments())
    ) {
      const segs = this.penSession.getSegments();
      const tip = lastCommittedVertex(segs);
      const draft = this.penColocatedSegmentEndpointDraft;
      if (!tip || !draft) return [];
      const anchor = tip;
      const end = this.penPointerSvg!;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
        penSvgUserSegmentToOverlayLine(this.ports, x1s, y1s, x2s, y2s);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = this.penPendingCubicAdjustedSnappedControls(
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          return [line(anchor.x, anchor.y, x1, y1)];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          return [
            line(anchor.x, anchor.y, sx1, sy1),
            line(end.x, end.y, hx, hy)
          ];
        }
        default: {
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
          }
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          return [line(anchor.x, anchor.y, ix, iy)];
        }
      }
    }
    if (!this.penCurvePreviewPathD) {
      return [];
    }
    if (this.penAwaitingFirstSegmentP3AfterDraft && this.penFirstAnchorP3Draft) {
      const segs = this.penSession.getSegments();
      const m = segs[0];
      if (m.type !== 'M') return [];
      const anchor = { x: m.x, y: m.y };
      const end = this.penPointerSvg!;
      const draft = this.penFirstAnchorP3Draft;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
        penSvgUserSegmentToOverlayLine(this.ports, x1s, y1s, x2s, y2s);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = this.penPendingCubicAdjustedSnappedControls(
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          return [line(anchor.x, anchor.y, x1, y1)];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          return [
            line(anchor.x, anchor.y, sx1, sy1),
            line(end.x, end.y, hx, hy)
          ];
        }
        default: {
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
          }
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          return [line(anchor.x, anchor.y, ix, iy)];
        }
      }
    }
    if (
      this.penCommittedFirstSegmentP3Draft &&
      this.penPendingSegment &&
      penPathOnlyMoveto(this.penSession.getSegments())
    ) {
      const p3d = this.penCommittedFirstSegmentP3Draft;
      const pending = this.penPendingSegment;
      const segsP3 = this.penSession.getSegments();
      const m = segsP3[0];
      if (m.type !== 'M') return [];
      const anchorMv = { x: m.x, y: m.y };
      const endP3 = this.penPendingCurvePreviewEndSvg(pending);
      const dragCurrentP3 = this.penPendingDragSampleSvg(pending);
      const kindP3 = penDragCurveAuthoringKind(pending.ctrlCurve, segsP3);
      const lineP3 = (x1s: number, y1s: number, x2s: number, y2s: number) =>
        penSvgUserSegmentToOverlayLine(this.ports, x1s, y1s, x2s, y2s);
      if (kindP3 === 'cubic') {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const c = this.penPendingCubicAdjustedSnappedControls(
          anchorMv,
          endP3,
          dragCurrentP3,
          p3d.placementDragStartSvg,
          segsP3,
          altEndOnly,
          this.penPendingShiftAngleSnap,
          false
        );
        const x1 = p3d.frozenOutgoingP1Svg?.x ?? c.x1;
        const y1 = p3d.frozenOutgoingP1Svg?.y ?? c.y1;
        const linesP3: { x1: number; y1: number; x2: number; y2: number }[] = [
          lineP3(anchorMv.x, anchorMv.y, x1, y1),
          lineP3(endP3.x, endP3.y, c.x2, c.y2)
        ];
        if (!altEndOnly) {
          linesP3.push(lineP3(endP3.x, endP3.y, dragCurrentP3.x, dragCurrentP3.y));
        }
        return linesP3;
      }
      return [];
    }
    if (!this.penPendingSegment) return [];
    const pending = this.penPendingSegment;
    const end = this.penPendingCurveGeometryEndSvg(pending);
    const dragCurrent = this.penPendingDragSampleSvg(pending);
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, this.penSession.getSegments());
    const segs = this.penSession.getSegments();
    const anchor = pending.anchor;

    const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
      penSvgUserSegmentToOverlayLine(this.ports, x1s, y1s, x2s, y2s);

    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const c = this.penPendingCubicAdjustedSnappedControls(
          anchor,
          end,
          dragCurrent,
          pending.startSvg,
          segs,
          altEndOnly
        );
        const lines: { x1: number; y1: number; x2: number; y2: number }[] = [
          line(anchor.x, anchor.y, c.x1, c.y1),
          line(end.x, end.y, c.x2, c.y2)
        ];
        if (!altEndOnly) {
          lines.push(line(end.x, end.y, dragCurrent.x, dragCurrent.y));
        }
        return lines;
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
      }
      case 'smoothCubic': {
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        return [
          line(anchor.x, anchor.y, sx1, sy1),
          line(end.x, end.y, hx, hy)
        ];
      }
      default: {
        if (this.penPendingCurveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
        }
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        return [line(anchor.x, anchor.y, ix, iy)];
      }
    }
  }

  private penCommittedOutgoingHandleSvg(): {
    anchorX: number;
    anchorY: number;
    hx: number;
    hy: number;
  } | null {
    if (this.ports.getCurrentTool() !== 'pen' || !this.isPenSessionActive || !this.penPointerSvg) {
      return null;
    }
    if (this.penPendingShowsCurvePreview) return null;
    return penLastOutgoingHandleSvg(this.penSession.getSegments());
  }

  /** First-anchor close target when pointer is inside single-click-close radius — overlay px (cx/cy). */
  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    if (this.ports.getCurrentTool() !== 'pen' || !this.isPenSessionActive || !this.penHoverClientPx) {
      return null;
    }
    const segs = this.penSession.getSegments();
    if (!penPathSegmentsAreValid(segs)) return null;
    const first = segs[0];
    if (first.type !== 'M') return null;
    if (!this.penCommittedPathHasVertexBeyondMoveto()) return null;
    if (!this.isPenPointerWithinCloseRadius(this.penHoverClientPx.x, this.penHoverClientPx.y)) return null;
    const o = penSvgUserPointToOverlayPixel(this.ports, first.x, first.y);
    return { cx: o.x, cy: o.y };
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
    const c = this.svgUserPointToApproxClient(svgX, svgY);
    if (!c) return false;
    const dx = clientX - c.x;
    const dy = clientY - c.y;
    return dx * dx + dy * dy <= tolPx * tolPx;
  }

  svgUserPointToApproxClient(
    userX: number,
    userY: number
  ): { x: number; y: number } | null {
    const mainSvg = this.ports.getMainSvgElement();
    if (!mainSvg) return null;
    const scr = rootSvgUserPointToScreenPoint(mainSvg, userX, userY);
    if (scr) return scr;
    const vb = this.ports.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return null;
    return {
      x: r.left + ((userX - vb.vbMinX) / vb.vbW) * r.width,
      y: r.top + ((userY - vb.vbMinY) / vb.vbH) * r.height
    };
  }

  /** Squared distance in viewport pixels between two root-SVG-user points (`null` if mapping fails). */
  penScreenDistanceSq(ax: number, ay: number, bx: number, by: number): number | null {
    const ma = this.svgUserPointToApproxClient(ax, ay);
    const mb = this.svgUserPointToApproxClient(bx, by);
    if (!ma || !mb) return null;
    const dx = ma.x - mb.x;
    const dy = ma.y - mb.y;
    return dx * dx + dy * dy;
  }

  /** Pen: join hit test (~{@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} viewport px). Returns false if mapping fails so we never merge accidentally. */
  penEndpointsWithinJoinTolerance(ax: number, ay: number, bx: number, by: number): boolean {
    const d = this.penScreenDistanceSq(ax, ay, bx, by);
    if (d === null) return false;
    const r = PEN_SINGLE_CLICK_CLOSE_RADIUS_PX;
    return d <= r * r;
  }

  /** Parse `<path>` `d`; must be **open** and pen-compatible drawable segments */
  openPenDrawableForJoin(pathId: string): { segments: PenPathSegment[]; d: string } | null {
    const svg = this.ports.svgManipulation.getSVGInstance();
    if (!svg) return null;
    const node = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    const rawD = node?.getAttribute('d');
    if (!rawD?.trim()) return null;
    const parsed = parsePathDForNodeEditing(rawD);
    if (!parsed || parsed.some((s) => s.type === 'Z')) return null;
    const drawable = parsed as PenPathSegment[];
    if (!penPathSegmentsAreValid(drawable)) return null;
    return { segments: drawable, d: rawD };
  }

  combinePenContinuationSegments(
    primary: readonly PenPathSegment[],
    continuation: readonly PenPathSegment[]
  ): PenPathSegment[] | null {
    if (!penPathSegmentsAreValid(primary) || continuation.length < 2 || continuation[0].type !== 'M') {
      return null;
    }
    return [...primary, ...continuation.slice(1)];
  }

  tryPickUpPenOpenPathContinuation(event: MouseEvent): boolean {
    if (this.penSession.getSegments().length !== 0) return false;
    const svg = this.ports.svgManipulation.getSVGInstance();
    if (!svg) return false;

    const items = [...this.ports.svgManipulation.getLayerStackItems()].reverse();
    for (const item of items) {
      if (item.type !== 'path') continue;
      const open = this.openPenDrawableForJoin(item.id);
      if (!open) continue;
      const tail = lastCommittedVertex(open.segments);
      if (!tail) continue;
      if (
        !this.penClientPxWithinJoinToleranceVsSvgPoint(event.clientX, event.clientY, tail.x, tail.y)
      ) {
        continue;
      }

      this.penContinuingPathRewrite = { pathId: item.id, originalD: open.d };
      this.penSession.restoreDrawableSegments(open.segments);
      this.penPointerSvg = { x: tail.x, y: tail.y };
      this.penHoverClientPx = { x: event.clientX, y: event.clientY };
      this.ports.clearPenPostInsertAnchorOverlay();
      this.ports.markForCheck();
      return true;
    }
    return false;
  }

  findPenOpenPathFinishJoin(
    finishingSegs: readonly PenPathSegment[]
  ):
    | { pathId: string; originalD: string; existing: PenPathSegment[]; stitch: 'appendToExistingTail' | 'prependBeforeExisting' }
    | null {
    if (!penPathSegmentsAreValid(finishingSegs)) return null;
    const drawnEnd = lastCommittedVertex(finishingSegs);
    if (!drawnEnd) return null;

    const items = [...this.ports.svgManipulation.getLayerStackItems()].reverse();
    for (const item of items) {
      if (item.type !== 'path') continue;
      const open = this.openPenDrawableForJoin(item.id);
      if (!open) continue;
      const existing = open.segments;
      const fv = existing[0];
      if (fv.type !== 'M') continue;
      const lv = lastCommittedVertex(existing);
      if (!lv) continue;

      if (this.penEndpointsWithinJoinTolerance(drawnEnd.x, drawnEnd.y, lv.x, lv.y)) {
        return {
          pathId: item.id,
          originalD: open.d,
          existing,
          stitch: 'appendToExistingTail'
        };
      }
      if (this.penEndpointsWithinJoinTolerance(drawnEnd.x, drawnEnd.y, fv.x, fv.y)) {
        return {
          pathId: item.id,
          originalD: open.d,
          existing,
          stitch: 'prependBeforeExisting'
        };
      }
    }
    return null;
  }

  /** Pen tool: Backspace pops last committed anchor; cancels in-progress segment first. */
  tryPenBackspaceShortcut(): boolean {
    if (this.ports.getCurrentTool() !== 'pen' || !this.isPenSessionActive) return false;
    if (this.ports.penBackspaceShortcutShouldDefer()) return false;

    if (this.penOutgoingHandleDrag) {
      const { segmentIndex, before } = this.penOutgoingHandleDrag;
      this.penOutgoingHandleDrag = null;
      this.penSession.replaceSegmentAt(segmentIndex, before);
      this.ports.markForCheck();
      return true;
    }

    if (this.penAwaitingColocatedSegmentEndpointAfterDraft) {
      this.clearPenColocatedSegmentEndpointDraft();
      const anchor = lastCommittedVertex(this.penSession.getSegments());
      if (anchor) {
        this.penPointerSvg = { x: anchor.x, y: anchor.y };
      }
      this.ports.markForCheck();
      return true;
    }

    if (this.penCommittedFirstSegmentP3Draft && this.penPendingSegment && penPathOnlyMoveto(this.penSession.getSegments())) {
      const d = this.penCommittedFirstSegmentP3Draft;
      this.clearPenCommittedFirstSegmentP3Draft();
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.penFirstAnchorP3Draft = d;
      this.penAwaitingFirstSegmentP3AfterDraft = true;
      const m0 = this.penSession.getSegments()[0];
      if (m0?.type === 'M') {
        this.penPointerSvg = { x: m0.x, y: m0.y };
      }
      this.ports.markForCheck();
      return true;
    }

    if (this.penAwaitingFirstSegmentP3AfterDraft) {
      this.clearPenFirstAnchorAwaitingDraft();
      if (penPathOnlyMoveto(this.penSession.getSegments())) {
        this.clearDrawingState();
        return true;
      }
      const anchor = lastCommittedVertex(this.penSession.getSegments());
      if (anchor) {
        this.penPointerSvg = { x: anchor.x, y: anchor.y };
      }
      this.ports.markForCheck();
      return true;
    }

    if (this.penPendingSegment) {
      this.clearPenCommittedFirstSegmentP3Draft();
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      const segsAfter = this.penSession.getSegments();
      if (penPathOnlyMoveto(segsAfter)) {
        this.clearDrawingState();
        return true;
      }
      const anchor = lastCommittedVertex(segsAfter);
      if (anchor) {
        this.penPointerSvg = { x: anchor.x, y: anchor.y };
      }
      this.ports.markForCheck();
      return true;
    }

    const popResult = this.penSession.popLastCommittedSegment();
    if (popResult === 'none') return false;
    if (popResult === 'cleared') {
      this.clearDrawingState();
      return true;
    }
    const v = lastCommittedVertex(this.penSession.getSegments());
    if (v) {
      this.penPointerSvg = { x: v.x, y: v.y };
    }
    this.ports.markForCheck();
    return true;
  }

  clearDrawingState(): void {
    const hadPenState =
      this.isPenSessionActive ||
      this.penPointerSvg !== null ||
      this.penPendingSegment !== null ||
      this.penAwaitingFirstSegmentP3AfterDraft ||
      this.penCommittedFirstSegmentP3Draft !== null ||
      this.penAwaitingColocatedSegmentEndpointAfterDraft ||
      this.penPendingDragSvg !== null ||
      this.penHoverClientPx !== null ||
      this.penContinuingPathRewrite !== null ||
      this.penOutgoingHandleDrag !== null ||
      this.penInsertOnPath !== null;
    const hadFeedback = this.penFinishFeedbackMessage !== null;
    if (!hadPenState && !hadFeedback) return;
    if (hadPenState) {
      if (this.penOutgoingHandleDrag) {
        const { segmentIndex, before } = this.penOutgoingHandleDrag;
        this.penSession.replaceSegmentAt(segmentIndex, before);
      }
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penHoverClientPx = null;
      this.penContinuingPathRewrite = null;
      this.penOutgoingHandleDrag = null;
      this.clearPenInsertOnPathDragState();
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.ports.setPenAltCurveMode(false);
      this.clearPenFirstAnchorAwaitingDraft();
      this.clearPenCommittedFirstSegmentP3Draft();
      this.clearPenColocatedSegmentEndpointDraft();
      this.purgeProvisionalPenSegmentHistory();
      this.penSession.reset();
      this.penPointerSvg = null;
    }
    if (hadFeedback) {
      this.clearPenFinishFeedback();
    } else {
      this.ports.markForCheck();
    }
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

  private finishPenAfterFirstAnchorP3Committed(
    clientX: number,
    clientY: number,
    ctrlKey: boolean,
    tip: { x: number; y: number }
  ): void {
    this.penPendingSegment = {
      anchor: { x: tip.x, y: tip.y },
      startClient: { x: clientX, y: clientY },
      startSvg: { x: tip.x, y: tip.y },
      ctrlCurve: this.ports.isPenAltCurveMode() || ctrlKey
    };
    this.penPendingLastClient = { x: clientX, y: clientY };
    this.penPendingDragSvg = { x: tip.x, y: tip.y };
    this.penPointerSvg = { x: tip.x, y: tip.y };
  }

  /**
   * When {@link penCommittedFirstSegmentP3Draft} is set, commit the first `C` from `M` using frozen
   * outgoing `P1` and second-gesture drag for incoming (unless movement is below marquee → zero incoming).
   */
  private commitPenCommittedFirstSegmentP3IfApplicable(
    clientX: number,
    clientY: number,
    ctrlKey: boolean,
    pendingSeg: {
      anchor: { x: number; y: number };
      startClient: { x: number; y: number };
      startSvg: { x: number; y: number };
      ctrlCurve: boolean;
    },
    releaseSvg: { x: number; y: number } | null | undefined,
    segs: readonly PenPathSegment[]
  ): boolean {
    const draft = this.penCommittedFirstSegmentP3Draft;
    if (!draft || !penPathOnlyMoveto(segs) || segs[0]?.type !== 'M') return false;
    const m0 = segs[0];
    if (m0.type !== 'M') return false;
    if (penSvgDistanceSq(pendingSeg.anchor, { x: m0.x, y: m0.y }) >= 1e-12) return false;

    this.clearPenCommittedFirstSegmentP3Draft();
    const resolvedEnd = this.penPendingResolvedEndSvgForCommit(pendingSeg, releaseSvg ?? undefined);
    const dragCurrent = releaseSvg ?? this.penPendingDragSvg ?? this.penPointerSvg ?? pendingSeg.startSvg;
    const screenDist = Math.hypot(clientX - pendingSeg.startClient.x, clientY - pendingSeg.startClient.y);
    const zeroIn = screenDist < MARQUEE_MIN_DRAG_PX;

    this.penPendingCurveAltChord = draft.curveAltChord;
    this.penPendingShiftAngleSnap = draft.shiftAngleSnap;
    this.commitPenDraggedCurve(
      { x: m0.x, y: m0.y },
      resolvedEnd,
      dragCurrent,
      pendingSeg.ctrlCurve,
      undefined,
      draft.placementDragStartSvg,
      draft.frozenOutgoingP1Svg,
      zeroIn
    );
    this.penPendingCurveAltChord = false;
    this.penPendingShiftAngleSnap = false;

    this.penPendingSegment = null;
    this.penPendingLastClient = null;
    this.penPendingDragSvg = null;

    const tip = lastCommittedVertex(this.penSession.getSegments()) ?? resolvedEnd;
    this.finishPenAfterFirstAnchorP3Committed(clientX, clientY, ctrlKey, tip);
    this.ports.markForCheck();
    return true;
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
    const mv = this.penPathStartMv();
    const committedEnd = segmentEnd !== undefined ? (mv ?? segmentEnd) : chordEndSvg;
    /** Illustrator drag origin: explicit override, else chord end — except close-to-start where `chordEndSvg` can be far from `M` while `committedEnd` is moveto (must not pair zero chord with a distant dragStart). */
    const placementDragResolved =
      placementDragStartSvg ??
      (segmentEnd !== undefined ? committedEnd : chordEndSvg);
    const kind = penDragCurveAuthoringKind(ctrlCurve, this.penSession.getSegments());
    const segs = this.penSession.getSegments();
    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        let c = this.penPendingCubicAdjustedSnappedControls(
          anchor,
          committedEnd,
          dragCurrent,
          placementDragResolved,
          segs,
          altEndOnly,
          undefined,
          zeroIncomingAtSegmentEnd
        );
        if (frozenOutgoingP1Svg && !altEndOnly) {
          // Match {@link penCurveStyledAppendToD}: freeze step-one outgoing `P1` only; keep Illustrator
          // incoming `P2` from {@link penPendingCubicAdjustedSnappedControls} (do not collapse `P2` to `P3`).
          c = {
            ...c,
            x1: frozenOutgoingP1Svg.x,
            y1: frozenOutgoingP1Svg.y
          };
        }
        this.penSession.appendCubic(c.x1, c.y1, c.x2, c.y2, committedEnd.x, committedEnd.y);
        break;
      }
      case 'quadratic': {
        let q = placementPointerQuadraticControlPoint(anchor, committedEnd, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(committedEnd, { x: q.x1, y: q.y1 });
          q = { x1: s.x, y1: s.y };
        }
        this.penSession.appendQuadratic(q.x1, q.y1, committedEnd.x, committedEnd.y);
        break;
      }
      case 'smoothCubic': {
        if (this.penPendingCurveAltChord) {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) {
            let hx = dragCurrent.x;
            let hy = dragCurrent.y;
            if (this.penPendingShiftAngleSnap) {
              const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
              hx = s.x;
              hy = s.y;
            }
            this.penSession.appendSmoothCubic(hx, hy, committedEnd.x, committedEnd.y);
            break;
          }
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const x1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const y1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          this.penSession.appendCubic(x1, y1, hx, hy, committedEnd.x, committedEnd.y);
          break;
        }
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        this.penSession.appendSmoothCubic(hx, hy, committedEnd.x, committedEnd.y);
        break;
      }
      default: {
        if (this.penPendingCurveAltChord) {
          let q = placementPointerQuadraticControlPoint(anchor, committedEnd, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(committedEnd, { x: q.x1, y: q.y1 });
            q = { x1: s.x, y1: s.y };
          }
          this.penSession.appendQuadratic(q.x1, q.y1, committedEnd.x, committedEnd.y);
          break;
        }
        if (this.penPendingShiftAngleSnap) {
          const st = penReflectStateAfterCommitted(segs);
          if (st) {
            let ix = 2 * anchor.x - st.quadCpX;
            let iy = 2 * anchor.y - st.quadCpY;
            const s = snapVectorTo45DegFrom(committedEnd, { x: ix, y: iy });
            this.penSession.appendQuadratic(s.x, s.y, committedEnd.x, committedEnd.y);
            break;
          }
        }
        this.penSession.appendSmoothQuadratic(committedEnd.x, committedEnd.y);
      }
    }
  }

  commitPenPendingSegment(event: MouseEvent): void {
    if (!this.penPendingSegment) return;

    if (
      penPathSegmentsAreValid(this.penSession.getSegments()) &&
      this.penPendingMousedownInCloseRadius()
    ) {
      const m = this.penPathStartMv();
      if (m && this.penPendingShowsCurvePreview && this.penPendingSegment) {
        const releaseSvg =
          this.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ??
          this.penPendingDragSvg ??
          this.penPendingSegment.startSvg;
        const pending = this.penPendingSegment;
        this.penPendingSegment = null;
        this.penPendingLastClient = null;
        this.penPendingDragSvg = null;
        this.penPendingCurveAltChord = false;
        this.penPendingShiftAngleSnap = false;
        this.commitPenDraggedCurve(pending.anchor, pending.startSvg, releaseSvg, pending.ctrlCurve, m);
        this.tryFinishPenPath(true);
        return;
      }
      if (this.penPendingSegment && m) {
        const pending = this.penPendingSegment;
        const releaseSvg =
          this.ports.clientToEditorSvgPoint(event.clientX, event.clientY) ??
          this.penPendingDragSvg ??
          pending.startSvg;
        this.penPendingSegment = null;
        this.penPendingLastClient = null;
        this.penPendingDragSvg = null;
        this.penPendingCurveAltChord = false;
        this.penPendingShiftAngleSnap = false;
        const { anchor, startSvg } = pending;
        if (penSvgDistanceSq(anchor, m) > 1e-12) {
          this.commitPenDraggedCurve(anchor, startSvg, releaseSvg, pending.ctrlCurve, m);
        }
        this.tryFinishPenPath(true);
        return;
      }
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.tryFinishPenPath(true);
      return;
    }

    const pendingSeg = this.penPendingSegment;
    const { anchor, startClient, startSvg } = pendingSeg;
    const releaseSvg = this.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
    const segsForP3 = this.penSession.getSegments();
    if (
      this.commitPenCommittedFirstSegmentP3IfApplicable(
        event.clientX,
        event.clientY,
        event.ctrlKey,
        pendingSeg,
        releaseSvg,
        segsForP3
      )
    ) {
      return;
    }
    const resolvedEnd = this.penPendingResolvedEndSvgForCommit(pendingSeg, releaseSvg);
    const dragCurrent = releaseSvg ?? this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
    const placementDrag =
      this.penPendingIsFirstSegmentFromMovetoGesture() || this.penPendingChordColocated()
        ? startSvg
        : undefined;

    if (this.penPendingIsFirstSegmentFromMovetoGesture()) {
      const screenDist0 = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
      if (screenDist0 < MARQUEE_MIN_DRAG_PX) {
        this.clearPenFirstAnchorAwaitingDraft();
        this.penPendingSegment = null;
        this.penPendingLastClient = null;
        this.penPendingDragSvg = null;
        this.penPendingCurveAltChord = false;
        this.penPendingShiftAngleSnap = false;
        this.penPointerSvg = { x: anchor.x, y: anchor.y };
        this.ports.markForCheck();
        return;
      }
    }

    if (
      !this.penPendingIsFirstSegmentFromMovetoGesture() &&
      penSvgDistanceSq(anchor, startSvg) < 1e-12 &&
      penSvgDistanceSq(anchor, resolvedEnd) < 1e-12 &&
      Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y) < MARQUEE_MIN_DRAG_PX &&
      !this.penPendingShowsCurvePreview
    ) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.ports.markForCheck();
      return;
    }
    if (this.penPendingChordColocated() && this.penPendingShowsCurvePreview) {
      const freezeDrag = releaseSvg ?? this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
      const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
        { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y },
        freezeDrag,
        this.penPendingShiftAngleSnap
      );
      this.penColocatedSegmentEndpointDraft = {
        placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
        dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
        ctrlCurve: pendingSeg.ctrlCurve,
        curveAltChord: this.penPendingCurveAltChord,
        shiftAngleSnap: this.penPendingShiftAngleSnap,
        frozenOutgoingP1Svg: this.penPendingCubicAltEndHandleOnly()
          ? undefined
          : { x: mirrored.x1, y: mirrored.y1 }
      };
      this.penAwaitingColocatedSegmentEndpointAfterDraft = true;
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      const tip = lastCommittedVertex(this.penSession.getSegments());
      if (tip) {
        this.penPointerSvg = { x: tip.x, y: tip.y };
      }
      this.ports.markForCheck();
      return;
    }
    if (this.penPendingIsFirstSegmentFromMovetoGesture() && this.penPendingShowsCurvePreview) {
      const freezeDrag = releaseSvg ?? this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
      const anchorMv = { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y };
      const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
        anchorMv,
        freezeDrag,
        this.penPendingShiftAngleSnap
      );
      this.penFirstAnchorP3Draft = {
        placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
        dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
        ctrlCurve: pendingSeg.ctrlCurve,
        curveAltChord: this.penPendingCurveAltChord,
        shiftAngleSnap: this.penPendingShiftAngleSnap,
        frozenOutgoingP1Svg: this.penPendingCubicAltEndHandleOnly()
          ? undefined
          : { x: mirrored.x1, y: mirrored.y1 }
      };
      this.penAwaitingFirstSegmentP3AfterDraft = true;
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.ports.markForCheck();
      return;
    }
    const screenDist = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
    const end = resolvedEnd;
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      const segs = this.penSession.getSegments();
      const st = penReflectStateAfterCommitted(segs);
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        const dragCurrentClose = this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
        this.commitPenDraggedCurve(
          anchor,
          resolvedEnd,
          dragCurrentClose,
          this.penPendingSegment.ctrlCurve,
          mClose,
          placementDrag
        );
      } else if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
        this.penSession.appendCubic(
          2 * anchor.x - st.cubicCp2X, 2 * anchor.y - st.cubicCp2Y,
          end.x, end.y,
          end.x, end.y
        );
      } else {
        this.penSession.addLinePoint(end.x, end.y);
      }
    } else {
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        this.commitPenDraggedCurve(
          anchor,
          resolvedEnd,
          dragCurrent,
          this.penPendingSegment.ctrlCurve,
          mClose,
          placementDrag
        );
      } else {
        this.commitPenDraggedCurve(anchor, resolvedEnd, dragCurrent, this.penPendingSegment.ctrlCurve, undefined, placementDrag);
      }
    }
    this.penPendingSegment = null;
    this.penPendingLastClient = null;
    this.penPendingDragSvg = null;
    this.penPendingCurveAltChord = false;
    this.penPendingShiftAngleSnap = false;
    const lvAfter = lastCommittedVertex(this.penSession.getSegments());
    if (lvAfter) this.penPointerSvg = { x: lvAfter.x, y: lvAfter.y };
    this.ports.markForCheck();
  }

  /** Commit open drag as L/C using last pointer + last client motion (Enter / finish). */
  flushPenPendingAsCurrentPointer(): void {
    if (!this.penPendingSegment || !this.penPointerSvg) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      return;
    }
    const pendingSeg = this.penPendingSegment;
    const { anchor, startClient, startSvg } = pendingSeg;
    const resolvedEnd = this.penPendingResolvedEndSvgForCommit(pendingSeg, null);
    const placementDrag =
      this.penPendingIsFirstSegmentFromMovetoGesture() || this.penPendingChordColocated()
        ? startSvg
        : undefined;

    const segsFlush = this.penSession.getSegments();
    const lcP3 = this.penPendingLastClient ?? startClient;
    if (
      this.commitPenCommittedFirstSegmentP3IfApplicable(
        lcP3.x,
        lcP3.y,
        false,
        pendingSeg,
        null,
        segsFlush
      )
    ) {
      return;
    }

    if (this.penPendingIsFirstSegmentFromMovetoGesture()) {
      const lc0 = this.penPendingLastClient ?? startClient;
      const screenDist0 = Math.hypot(lc0.x - startClient.x, lc0.y - startClient.y);
      if (screenDist0 < MARQUEE_MIN_DRAG_PX) {
        this.penPendingSegment = null;
        this.penPendingLastClient = null;
        this.penPendingDragSvg = null;
        this.penPendingCurveAltChord = false;
        this.penPendingShiftAngleSnap = false;
        return;
      }
    }

    if (
      !this.penPendingIsFirstSegmentFromMovetoGesture() &&
      penSvgDistanceSq(anchor, startSvg) < 1e-12 &&
      penSvgDistanceSq(anchor, resolvedEnd) < 1e-12 &&
      Math.hypot((this.penPendingLastClient ?? startClient).x - startClient.x, (this.penPendingLastClient ?? startClient).y - startClient.y) <
        MARQUEE_MIN_DRAG_PX &&
      !this.penPendingShowsCurvePreview
    ) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      return;
    }
    if (this.penPendingChordColocated() && this.penPendingShowsCurvePreview) {
      const freezeDrag = this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
      const mirrored = penFirstAnchorMirroredHandleControlsFromDrag(
        { x: pendingSeg.anchor.x, y: pendingSeg.anchor.y },
        freezeDrag,
        this.penPendingShiftAngleSnap
      );
      this.penColocatedSegmentEndpointDraft = {
        placementDragStartSvg: { x: startSvg.x, y: startSvg.y },
        dragCommitSvg: { x: freezeDrag.x, y: freezeDrag.y },
        ctrlCurve: pendingSeg.ctrlCurve,
        curveAltChord: this.penPendingCurveAltChord,
        shiftAngleSnap: this.penPendingShiftAngleSnap,
        frozenOutgoingP1Svg: this.penPendingCubicAltEndHandleOnly()
          ? undefined
          : { x: mirrored.x1, y: mirrored.y1 }
      };
      this.penAwaitingColocatedSegmentEndpointAfterDraft = true;
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      const tip = lastCommittedVertex(this.penSession.getSegments());
      if (tip) {
        this.penPointerSvg = { x: tip.x, y: tip.y };
      }
      this.ports.markForCheck();
      return;
    }
    const lc = this.penPendingLastClient ?? startClient;
    const screenDist = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
    const dragCurrent = this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
    const end = resolvedEnd;
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      const segs = this.penSession.getSegments();
      const st = penReflectStateAfterCommitted(segs);
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        const dragCurrentClose = this.penPendingDragSvg ?? this.penPointerSvg ?? startSvg;
        this.commitPenDraggedCurve(
          anchor,
          resolvedEnd,
          dragCurrentClose,
          this.penPendingSegment.ctrlCurve,
          mClose,
          placementDrag
        );
      } else if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
        this.penSession.appendCubic(
          2 * anchor.x - st.cubicCp2X, 2 * anchor.y - st.cubicCp2Y,
          end.x, end.y,
          end.x, end.y
        );
      } else {
        this.penSession.addLinePoint(end.x, end.y);
      }
    } else {
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        this.commitPenDraggedCurve(
          anchor,
          resolvedEnd,
          dragCurrent,
          this.penPendingSegment.ctrlCurve,
          mClose,
          placementDrag
        );
      } else {
        this.commitPenDraggedCurve(anchor, resolvedEnd, dragCurrent, this.penPendingSegment.ctrlCurve, undefined, placementDrag);
      }
    }
    this.penPendingSegment = null;
    this.penPendingLastClient = null;
    this.penPendingDragSvg = null;
    this.penPendingCurveAltChord = false;
    this.penPendingShiftAngleSnap = false;
    const lvFlush = lastCommittedVertex(this.penSession.getSegments());
    if (lvFlush) this.penPointerSvg = { x: lvFlush.x, y: lvFlush.y };
    this.ports.markForCheck();
  }

  tryFinishPenPath(closePath: boolean): void {
    if (this.penOutgoingHandleDrag) {
      this.finishPenOutgoingHandleDrag();
    }
    if (this.penIncompleteFirstSegmentFromEmpty() || this.penIncompleteColocatedSegmentEndpointDraft()) {
      this.showPenFinishFeedback();
      return;
    }
    this.flushPenPendingAsCurrentPointer();
    this.purgeProvisionalPenSegmentHistory();

    if (
      closePath &&
      penPathSegmentsAreValid(this.penSession.getSegments()) &&
      this.penPathStartMv()
    ) {
      const m0 = this.penPathStartMv()!;
      const rewritten = penRewriteLastSegmentEndToMatchMoveto(
        this.penSession.getSegments(),
        m0,
        PEN_CLOSE_MOVETO_REWRITE_MAX_SQ
      );
      if (rewritten) {
        this.penSession.restoreDrawableSegments(rewritten);
      }
    }

    const finishingSegsSnapshot = [...this.penSession.getSegments()] as PenPathSegment[];

    const d = this.penSession.finishPath();
    if (!d) {
      this.showPenFinishFeedback();
      return;
    }
    this.clearPenFinishFeedback();
    // Closed subpath: `Z` only — no mirrored corrective `C` at the moveto (plans/bugs/pen-drag-close-m-z-parity.md).
    // Tiny endpoint drift vs `M` is absorbed via {@link penRewriteLastSegmentEndToMatchMoveto} before `finishPath`.
    let finalClosed = closePath ? `${d} Z` : d;

    applyPenFinishedPathDocumentEffects(this.ports, {
      finalClosed,
      closePath,
      finishingSegsSnapshot,
      continuingPathRewrite: this.penContinuingPathRewrite,
      findPenOpenPathFinishJoin: (segs) =>
        penPathSegmentsAreValid(segs) ? this.findPenOpenPathFinishJoin(segs) : null,
      combinePenContinuationSegments: (a, b) => this.combinePenContinuationSegments(a, b),
      clearDrawingState: () => this.clearDrawingState()
    });
  }

  handlePenCanvasMouseDown(event: MouseEvent, pt: { x: number; y: number }): void {
    if (event.detail >= 2) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.clearPenFirstAnchorAwaitingDraft();
      this.clearPenCommittedFirstSegmentP3Draft();
      this.clearPenColocatedSegmentEndpointDraft();
      if (this.penSession.getSegments().length === 0) {
        this.ports.clearPenPostInsertAnchorOverlay();
        this.ports.clearSelectionForPenBackgroundStroke();
        this.penSession.beginPath(pt.x, pt.y);
        this.penPointerSvg = { x: pt.x, y: pt.y };
        this.ports.markForCheck();
        return;
      }
      if (penPathOnlyMoveto(this.penSession.getSegments())) {
        this.penSession.addLinePoint(pt.x, pt.y);
      }
      this.tryFinishPenPath(true);
      return;
    }
    const segs = this.penSession.getSegments();
    if (segs.length === 0) {
      this.penContinuingPathRewrite = null;
      if (this.tryPickUpPenOpenPathContinuation(event)) {
        this.ports.markForCheck();
        return;
      }
      this.ports.clearPenPostInsertAnchorOverlay();
      this.ports.clearSelectionForPenBackgroundStroke();
      this.penSession.beginPath(pt.x, pt.y);
      this.penPointerSvg = { x: pt.x, y: pt.y };
      this.penPendingSegment = {
        anchor: { x: pt.x, y: pt.y },
        startClient: { x: event.clientX, y: event.clientY },
        startSvg: { x: pt.x, y: pt.y },
        ctrlCurve: this.ports.isPenAltCurveMode() || event.ctrlKey
      };
      this.penPendingLastClient = { x: event.clientX, y: event.clientY };
      this.penPendingDragSvg = { x: pt.x, y: pt.y };
      this.ports.markForCheck();
      return;
    }
    if (
      this.penAwaitingColocatedSegmentEndpointAfterDraft &&
      this.penColocatedSegmentEndpointDraft &&
      event.detail < 2
    ) {
      const draft = this.penColocatedSegmentEndpointDraft;
      const tip = lastCommittedVertex(segs);
      if (draft && tip) {
        this.commitPenDraggedCurve(
          tip,
          pt,
          draft.dragCommitSvg,
          draft.ctrlCurve,
          undefined,
          draft.placementDragStartSvg,
          draft.frozenOutgoingP1Svg
        );
      }
      this.clearPenColocatedSegmentEndpointDraft();
      this.ports.clearPenPostInsertAnchorOverlay();
      const lv = lastCommittedVertex(this.penSession.getSegments()) ?? { x: pt.x, y: pt.y };
      this.penPendingSegment = {
        anchor: { x: lv.x, y: lv.y },
        startClient: { x: event.clientX, y: event.clientY },
        startSvg: { x: pt.x, y: pt.y },
        ctrlCurve: this.ports.isPenAltCurveMode() || event.ctrlKey
      };
      this.penPendingLastClient = { x: event.clientX, y: event.clientY };
      this.penPendingDragSvg = { x: pt.x, y: pt.y };
      this.penPointerSvg = { x: pt.x, y: pt.y };
      this.ports.markForCheck();
      return;
    }
    if (
      this.penAwaitingFirstSegmentP3AfterDraft &&
      penPathOnlyMoveto(segs) &&
      event.detail < 2
    ) {
      const draft = this.penFirstAnchorP3Draft;
      const m0 = segs[0];
      if (draft && m0?.type === 'M') {
        const frozen: PenFirstAnchorP3Draft = { ...draft };
        this.clearPenFirstAnchorAwaitingDraft();
        this.penCommittedFirstSegmentP3Draft = frozen;
        this.penPendingSegment = {
          anchor: { x: m0.x, y: m0.y },
          startClient: { x: event.clientX, y: event.clientY },
          startSvg: { x: pt.x, y: pt.y },
          ctrlCurve: this.ports.isPenAltCurveMode() || event.ctrlKey
        };
        this.penPendingLastClient = { x: event.clientX, y: event.clientY };
        this.penPendingDragSvg = { x: pt.x, y: pt.y };
        this.penPointerSvg = { x: pt.x, y: pt.y };
        this.ports.markForCheck();
        return;
      }
      this.clearPenFirstAnchorAwaitingDraft();
      this.clearPenColocatedSegmentEndpointDraft();
    }
    const anchor = lastCommittedVertex(segs);
    if (!anchor) return;
    this.ports.clearPenPostInsertAnchorOverlay();
    this.penPendingSegment = {
      anchor: { x: anchor.x, y: anchor.y },
      startClient: { x: event.clientX, y: event.clientY },
      startSvg: { x: pt.x, y: pt.y },
      // Control (not ⌘ — ⌘ is snap bypass) or toolbar toggle: alternate curve mode (h76).
      // Q after M/L is temporarily mapped to cubic in penDragCurveAuthoringKind; S/T still apply after C/Q.
      ctrlCurve: this.ports.isPenAltCurveMode() || event.ctrlKey
    };
    this.penPendingLastClient = { x: event.clientX, y: event.clientY };
    this.penPendingDragSvg = { x: pt.x, y: pt.y };
    this.penPointerSvg = { x: pt.x, y: pt.y };
    this.ports.markForCheck();
  }

  /**
   * Pointer move while pen tool has an active session (viewport coordinates).
   */
  onDocumentMouseMovePen(
    event: MouseEvent,
    getSnappedPenPoint: (clientX: number, clientY: number, suspendSnap: boolean) => { x: number; y: number } | null
  ): void {
    this.penHoverClientPx = { x: event.clientX, y: event.clientY };
    if (this.penInsertOnPath) {
      this.updatePenInsertOnPathFromPointer(event);
      return;
    }
    if (this.penOutgoingHandleDrag) {
      const raw = this.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (raw) {
        let hx = raw.x;
        let hy = raw.y;
        if (event.shiftKey) {
          const h0 = penLastOutgoingHandleSvg(this.penSession.getSegments());
          if (h0) {
            const s = snapVectorTo45DegFrom({ x: h0.anchorX, y: h0.anchorY }, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
        }
        const next = movePenLastOutgoingHandleTo(this.penSession.getSegments(), hx, hy);
        if (next) {
          this.penSession.restoreDrawableSegments(next);
        }
        this.ports.markForCheck();
      }
      return;
    }
    if (this.penAwaitingFirstSegmentP3AfterDraft) {
      const p = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
      if (p) {
        this.penPointerSvg = { x: p.x, y: p.y };
        this.ports.markForCheck();
      }
      return;
    }
    if (this.penAwaitingColocatedSegmentEndpointAfterDraft) {
      const p = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
      if (p) {
        this.penPointerSvg = { x: p.x, y: p.y };
        this.ports.markForCheck();
      }
      return;
    }
    this.penPendingCurveAltChord = !!this.penPendingSegment && event.altKey;
    this.penPendingShiftAngleSnap = !!this.penPendingSegment && event.shiftKey;
    if (this.penPendingSegment) {
      this.penPendingLastClient = { x: event.clientX, y: event.clientY };
    }
    const pt = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
    if (pt) {
      if (this.penPendingSegment) {
        this.penPendingDragSvg = { x: pt.x, y: pt.y };
        if (this.penPendingIsFirstSegmentFromMovetoGesture() || this.penPendingChordColocated()) {
          this.penPointerSvg = { x: pt.x, y: pt.y };
        } else {
          this.penPointerSvg = { x: this.penPendingSegment.startSvg.x, y: this.penPendingSegment.startSvg.y };
        }
      } else {
        this.penPointerSvg = { x: pt.x, y: pt.y };
      }
      this.ports.markForCheck();
    }
  }

  onDocumentMouseUpPen(event: MouseEvent): void {
    if (this.penInsertOnPath) {
      this.finishPenInsertOnPathDrag(event);
      return;
    }
    if (this.penOutgoingHandleDrag) {
      this.finishPenOutgoingHandleDrag();
      return;
    }
    if (this.penPendingSegment) {
      this.commitPenPendingSegment(event);
    }
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
    if (!this.ports.isCanvasReadyForPenInput()) return false;
    const outgoingKnob = (event.target as Element | null)?.closest?.('[data-pen-outgoing-handle]');
    if (outgoingKnob && this.isPenSessionActive && !this.penPendingSegment) {
      if (penLastOutgoingHandleSvg(this.penSession.getSegments())) {
        const segs = this.penSession.getSegments();
        const last = segs[segs.length - 1];
        this.penOutgoingHandleDrag = { segmentIndex: segs.length - 1, before: { ...last } as PenPathSegment };
        return true;
      }
    }
    const penTarget = event.target as Element | null;
    if (penTarget && this.ports.isEditorContentShapeTarget(penTarget)) {
      if (
        this.penSession.getSegments().length === 0 &&
        !this.penPendingSegment &&
        this.tryBeginPenInsertOnPath(penTarget, event)
      ) {
        return true;
      }
      return false;
    }
    const pt = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
    if (!pt) return false;
    this.handlePenCanvasMouseDown(event, pt);
    return true;
  }

  get canTryPenInsertNodeOnPath(): boolean {
    return (
      this.penSession.getSegments().length === 0 &&
      this.penPendingSegment === null &&
      this.penInsertOnPath === null
    );
  }

  private clearPenInsertOnPathDragState(): void {
    const pathId = this.penInsertOnPath?.pathId;
    this.penInsertOnPath = null;
    this.penInsertOnPathLastClient = null;
    this.penInsertOnPathPointerSvg = null;
    if (pathId) {
      restorePenInsertPathVisibility(this.ports, pathId);
    }
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

  private tryBeginPenInsertOnPath(penTarget: Element, event: MouseEvent): boolean {
    if (event.detail !== 1) return false;
    const ev = this.evaluatePenInsertOnPathAt(penTarget, event.clientX, event.clientY);
    if (!ev.ok) return false;
    this.penInsertOnPath = createPenInsertOnPathDragState(ev, event);
    this.penInsertOnPathLastClient = { x: event.clientX, y: event.clientY };
    this.penInsertOnPathPointerSvg = { x: ev.pt.x, y: ev.pt.y };
    this.ports.svgManipulation.setShapeVisibility(ev.pathId, false);
    this.ports.markForCheck();
    return true;
  }

  private finishPenInsertOnPathDrag(event: MouseEvent): void {
    const st = this.penInsertOnPath;
    if (!st) return;
    const newD = computePenInsertOnPathReleaseD(
      this.ports,
      st,
      this.penInsertOnPathLastClient,
      this.penInsertOnPathPointerSvg,
      event.clientX,
      event.clientY
    );
    this.clearPenInsertOnPathDragState();
    if (newD === st.originalD) {
      this.ports.markForCheck();
      return;
    }
    const reparsed = parsePathD(newD);
    if (reparsed.errors.length > 0) {
      this.ports.markForCheck();
      return;
    }
    this.ports.commitPenInsertOnExistingPath(st.pathId, st.originalD, newD, st.insertMoveSegIndex);
    this.ports.markForCheck();
  }

  /**
   * Insert-on-path drag uses **unsnapped** SVG coordinates so grid / smart-guide snapping cannot
   * pin the pointer to the planted vertex (which would zero the drag vector and hide curve preview).
   */
  private updatePenInsertOnPathFromPointer(event: MouseEvent): void {
    if (!this.penInsertOnPath) return;
    this.penInsertOnPathLastClient = { x: event.clientX, y: event.clientY };
    const raw = this.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (raw) {
      this.penInsertOnPathPointerSvg = { x: raw.x, y: raw.y };
    }
    this.ports.markForCheck();
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
