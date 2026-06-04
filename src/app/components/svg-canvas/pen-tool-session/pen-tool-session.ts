/**
 * Orchestrates in-progress pen path authoring (preview, pointer, keyboard, commit).
 * Logical inputs and document effects cross a narrow {@link PenToolSessionPorts} seam so the
 * canvas stays a DOM/view adapter and this module stays unit-testable without full TestBed.
 */
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { rootSvgUserPointToScreenPoint } from '../../../utils/svg-screen-user';
import {
  PenSession,
  appendCubicToD,
  appendLineToD,
  appendQuadraticToD,
  appendSmoothCubicToD,
  appendSmoothQuadraticToD,
  placementIllustratorStyleCubicControlPoints,
  placementPointerCubicControlPoints,
  placementPointerQuadraticControlPoint,
  lastCommittedVertex,
  penDragCurveAuthoringKind,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penPathSegmentsToD,
  penReflectStateAfterCommitted,
  penSvgDistanceSq,
  penRewriteLastSegmentEndToMatchMoveto,
  penLastOutgoingHandleSvg,
  movePenLastOutgoingHandleTo,
  snapVectorTo45DegFrom,
  type CubicControlPoints,
  type PenPathSegment
} from '../../../models/pen-path';
import { parsePathD, parsePathDForNodeEditing, pathSegmentsToD, type PathSegment } from '../../../models/path-d';
import {
  applyPenPathInsert,
  findPenPathInsertHit,
  type PenPathInsertHit
} from '../../../models/path-pen-insert';
import {
  buildPenInsertDragPreviewD,
  penInsertHitAnchorSvg,
  penInsertMoveSegmentIndexAfterSplit
} from '../../../models/path-pen-insert-drag';
import { AddPathCommand, EditPathNodesCommand, PenSegmentReplaceCommand } from '../../../models/editor-commands';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import type { EditorTool } from '../../../services/editor-tool.service';

const PEN_FINISH_FEEDBACK_DURATION_MS = 1200;
const PEN_SINGLE_CLICK_CLOSE_RADIUS_PX = 8;
/**
 * Close-from-start: mousedown is on a small hit target (~{@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} px).
 * {@link MARQUEE_MIN_DRAG_PX} is intentionally not lowered globally; this threshold applies only when
 * {@link penPendingStartNearPathMoveto} is true (see plans/bugs/pen-close-from-start-preview-and-endpoint.md).
 */
const PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX = 2;
const PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ = 1e-6;
/** When finishing closed paths: absorb CTM / float mismatch vs session `M` without a mirrored closing `C`. */
const PEN_CLOSE_MOVETO_REWRITE_MAX_SQ = 1e-8;

export type PenDiscardReason = 'tool switch' | 'document replace/load';

export interface PenToolSessionPorts {
  markForCheck(): void;
  getCurrentTool(): EditorTool;
  isPenAltCurveMode(): boolean;
  setPenAltCurveMode(enabled: boolean): void;
  setTool(tool: EditorTool): void;
  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null;
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parseOverlayViewBox(): { vbMinX: number; vbMinY: number; vbW: number; vbH: number } | null;
  getMainSvgElement(): SVGSVGElement | null;
  /** `window.confirm` for discarding in-progress pen path. */
  confirmDiscardInProgressPath(reason: PenDiscardReason): boolean;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  penBackspaceShortcutShouldDefer(): boolean;
  setLastBbox(bbox: { x: number; y: number; width: number; height: number } | null): void;
  clearHighlightRectCache(): void;
  isEditorContentShapeTarget(target: Element | null): boolean;
  getPenPathInsertToleranceSvg(): number;
  getPathDForId(pathId: string): string | null;
  /** Apply committed insert edit (history, selection, overlays). */
  commitPenInsertOnExistingPath(pathId: string, oldD: string, newD: string, insertedMoveSegIndex?: number): void;
  clearPenPostInsertAnchorOverlay(): void;
  /** Idle pen: user starts a new stroke on empty canvas — clear prior selection so path topology follows. */
  clearSelectionForPenBackgroundStroke(): void;
  /** True when SVG content is present and the canvas view is ready for pen input. */
  isCanvasReadyForPenInput(): boolean;
}

export class PenToolSession {
  penFinishFeedbackMessage: string | null = null;
  private penFinishFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly penSession = new PenSession();
  private penPointerSvg: { x: number; y: number } | null = null;
  private penPendingSegment: {
    anchor: { x: number; y: number };
    startClient: { x: number; y: number };
    startSvg: { x: number; y: number };
    ctrlCurve: boolean;
  } | null = null;
  private penPendingLastClient: { x: number; y: number } | null = null;
  private penPendingDragSvg: { x: number; y: number } | null = null;
  private penPendingCurveAltChord = false;
  private penPendingShiftAngleSnap = false;
  private penHoverClientPx: { x: number; y: number } | null = null;
  private penContinuingPathRewrite: { pathId: string; originalD: string } | null = null;
  private penOutgoingHandleDrag: { segmentIndex: number; before: PenPathSegment } | null = null;

  /** Mousedown→drag→mouseup insert on an existing path (idle pen session). */
  private penInsertOnPath: {
    pathId: string;
    originalD: string;
    parsedBefore: PathSegment[];
    hit: PenPathInsertHit;
    insertMoveSegIndex: number;
    splitBaseline: PathSegment[];
    dragStartSvg: { x: number; y: number };
    startClient: { x: number; y: number };
  } | null = null;
  private penInsertOnPathLastClient: { x: number; y: number } | null = null;
  private penInsertOnPathPointerSvg: { x: number; y: number } | null = null;

  constructor(private readonly ports: PenToolSessionPorts) {}


  get isPenSessionActive(): boolean {
    return this.penSession.getSegments().length > 0;
  }

  /**
   * True when the pending segment began on the path start (within join/close tolerance in screen space).
   * Enables a scoped curve-preview rule without changing global marquee thresholds.
   */
  private penPendingStartNearPathMoveto(): boolean {
    const pending = this.penPendingSegment;
    const m = this.penPathStartMv();
    if (!pending || !m) return false;
    return this.penEndpointsWithinJoinTolerance(pending.startSvg.x, pending.startSvg.y, m.x, m.y);
  }

  /** Pending curve preview end vertex: exact `M` when closing from start, else the mousedown `startSvg`. */
  private penPendingCurvePreviewEndSvg(pending: {
    anchor: { x: number; y: number };
    startClient: { x: number; y: number };
    startSvg: { x: number; y: number };
    ctrlCurve: boolean;
  }): { x: number; y: number } {
    const m = this.penPathStartMv();
    if (m && this.penEndpointsWithinJoinTolerance(pending.startSvg.x, pending.startSvg.y, m.x, m.y)) {
      return { x: m.x, y: m.y };
    }
    return pending.startSvg;
  }

  /**
   * Whether the pending segment should show Bézier curve preview (handles + `penCurvePreviewPathD`).
   * Uses {@link MARQUEE_MIN_DRAG_PX} for normal drags; when closing from start, also allows a smaller
   * screen threshold or a tiny root-SVG drag so users can shape the closing segment without leaving the start ring.
   */
  private penPendingShowsCurvePreviewForClose(): boolean {
    if (!this.penPendingSegment || !this.penPendingLastClient) return false;
    const { startClient, startSvg } = this.penPendingSegment;
    const lc = this.penPendingLastClient;
    const screenHyp = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
    if (screenHyp >= MARQUEE_MIN_DRAG_PX) return true;
    if (!this.penPendingStartNearPathMoveto()) return false;
    if (screenHyp >= PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SCREEN_PX) return true;
    const dragSvg = this.penPendingDragSvg;
    const m = this.penPathStartMv();
    if (dragSvg) {
      if (penSvgDistanceSq(dragSvg, startSvg) > PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ) return true;
      if (m && penSvgDistanceSq(dragSvg, m) > PEN_CLOSE_PENDING_CURVE_PREVIEW_MIN_SVG_DRAG_SQ) return true;
    }
    return false;
  }

  get penPendingShowsCurvePreview(): boolean {
    return this.penPendingShowsCurvePreviewForClose();
  }

  /**
   * Full in-progress pen preview (`M/L/C...`) including committed segments plus the current
   * pending segment to pointer. This keeps the whole path visible during authoring.
   */
  get penSessionPreviewPathD(): string | null {
    if (this.penInsertOnPath) return null;
    if (this.ports.getCurrentTool() !== 'pen' || !this.isPenSessionActive) return null;
    const base = penPathSegmentsToD(this.penSession.getSegments());
    if (!base || !this.penPointerSvg) return base || null;
    const segs = this.penSession.getSegments();
    const anchor = this.penPendingSegment?.anchor ?? lastCommittedVertex(segs);
    if (!anchor) return base;

    if (this.penPendingSegment && this.penPendingShowsCurvePreview) {
      return this.appendPenPendingCurveToBaseD(base);
    }
    // When the last committed node has a reflectable handle, preview the smooth-departure curve.
    const st = penReflectStateAfterCommitted(segs);
    if (st?.canReflectCubic) {
      const ptr = this.penPointerSvg;
      return appendCubicToD(
        base,
        { x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y, x2: ptr.x, y2: ptr.y },
        ptr
      );
    }
    return appendLineToD(base, this.penPointerSvg.x, this.penPointerSvg.y);
  }

  /** Live Bézier preview `d` (committed segments + pending segment: default `C`, Ctrl+drag `Q` / `S` / `T`). */
  get penCurvePreviewPathD(): string | null {
    if (this.penInsertOnPath) return null;
    if (
      !this.penPendingSegment ||
      !this.penPointerSvg ||
      !this.penPendingShowsCurvePreview ||
      this.ports.getCurrentTool() !== 'pen'
    ) {
      return null;
    }
    const base = penPathSegmentsToD(this.penSession.getSegments());
    return this.appendPenPendingCurveToBaseD(base);
  }

  /** Control handle centers (overlay px) while dragging a curved segment preview. */
  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    if (!this.penCurvePreviewPathD || !this.penPendingSegment || !this.penPointerSvg) return [];
    const pending = this.penPendingSegment;
    const anchor = pending.anchor;
    const end = this.penPendingCurvePreviewEndSvg(pending);
    const dragCurrent = this.penPendingDragSvg ?? pending.startSvg;
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, this.penSession.getSegments());
    const toOverlay = (x: number, y: number) =>
      this.ports.svgBboxToOverlayPixels({ x, y, width: 0, height: 0 });

    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const segsForP1 = this.penSession.getSegments();
        const isFirstSeg = !altEndOnly && penPathOnlyMoveto(segsForP1);
        const raw = altEndOnly
          ? placementPointerCubicControlPoints(anchor, end, dragCurrent, true)
          : placementIllustratorStyleCubicControlPoints(anchor, end, pending.startSvg, dragCurrent);
        let adjusted: CubicControlPoints;
        if (isFirstSeg) {
          adjusted = { ...raw, x1: anchor.x, y1: anchor.y };
        } else if (!altEndOnly) {
          const st = penReflectStateAfterCommitted(segsForP1);
          adjusted = st?.canReflectCubic
            ? { ...raw, x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y }
            : raw;
        } else {
          adjusted = raw;
        }
        let { x1, y1, x2, y2 } = this.snapPenPendingCubicControls(anchor, end, adjusted, altEndOnly);
        const p2 = toOverlay(x2, y2);
        if (isFirstSeg) {
          return [{ cx: p2.x, cy: p2.y }];
        }
        const p1 = toOverlay(x1, y1);
        return [
          { cx: p1.x, cy: p1.y },
          { cx: p2.x, cy: p2.y }
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
        const sx1 = st.canReflectCubic ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = st.canReflectCubic ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
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
    if (this.penPendingSegment && this.penPendingShowsCurvePreview) return null;
    // Suppress the straight rubber-band when we're already showing a smooth-departure curve preview.
    if (!this.penPendingSegment) {
      const segs = this.penSession.getSegments();
      if (penReflectStateAfterCommitted(segs)?.canReflectCubic) return null;
    }
    const anchor = this.penPendingSegment
      ? this.penPendingSegment.anchor
      : lastCommittedVertex(this.penSession.getSegments());
    if (!anchor) return null;
    const p1 = this.ports.svgBboxToOverlayPixels({ x: anchor.x, y: anchor.y, width: 0, height: 0 });
    const p2 = this.ports.svgBboxToOverlayPixels({
      x: this.penPointerSvg.x,
      y: this.penPointerSvg.y,
      width: 0,
      height: 0
    });
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  /** Dashed guide from last vertex to outgoing handle while rubber-banding the next segment. */
  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const h = this.penCommittedOutgoingHandleSvg();
    if (!h) return null;
    const p1 = this.ports.svgBboxToOverlayPixels({ x: h.anchorX, y: h.anchorY, width: 0, height: 0 });
    const p2 = this.ports.svgBboxToOverlayPixels({ x: h.hx, y: h.hy, width: 0, height: 0 });
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    const h = this.penCommittedOutgoingHandleSvg();
    if (!h) return null;
    const p2 = this.ports.svgBboxToOverlayPixels({ x: h.hx, y: h.hy, width: 0, height: 0 });
    return { cx: p2.x, cy: p2.y };
  }

  /**
   * Dashed guide from the pending segment’s end anchor to the end-side handle (j24.9), matching
   * {@link penOutgoingHandleGuideOverlay} readability while click-dragging a new curve.
   */
  get penPendingCurveHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (!this.penCurvePreviewPathD || !this.penPendingSegment || this.ports.getCurrentTool() !== 'pen') {
      return null;
    }
    const pending = this.penPendingSegment;
    const end = this.penPendingCurvePreviewEndSvg(pending);
    const dragCurrent = this.penPendingDragSvg ?? pending.startSvg;
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, this.penSession.getSegments());
    const segs = this.penSession.getSegments();
    const anchor = pending.anchor;

    let hx: number;
    let hy: number;

    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const raw = altEndOnly
          ? placementPointerCubicControlPoints(anchor, end, dragCurrent, true)
          : placementIllustratorStyleCubicControlPoints(anchor, end, pending.startSvg, dragCurrent);
        const c = this.snapPenPendingCubicControls(anchor, end, raw, altEndOnly);
        hx = c.x2;
        hy = c.y2;
        break;
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        hx = qc.x1;
        hy = qc.y1;
        break;
      }
      case 'smoothCubic': {
        hx = dragCurrent.x;
        hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        break;
      }
      default: {
        if (this.penPendingCurveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          hx = qc.x1;
          hy = qc.y1;
          break;
        }
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return null;
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        hx = ix;
        hy = iy;
      }
    }

    const pEnd = this.ports.svgBboxToOverlayPixels({ x: end.x, y: end.y, width: 0, height: 0 });
    const pH = this.ports.svgBboxToOverlayPixels({ x: hx, y: hy, width: 0, height: 0 });
    return { x1: pEnd.x, y1: pEnd.y, x2: pH.x, y2: pH.y };
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
    if (this.penPendingSegment && this.penPendingShowsCurvePreview) return null;
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
    if (!this.isPenPointerWithinCloseRadius(this.penHoverClientPx.x, this.penHoverClientPx.y)) return null;
    const o = this.ports.svgBboxToOverlayPixels({ x: first.x, y: first.y, width: 0, height: 0 });
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

    if (this.penPendingSegment) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      const anchor = lastCommittedVertex(this.penSession.getSegments());
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
   * After Shift angle snap: Alt end-handle-only mode updates only `(x2,y2)`; Illustrator-style keeps
   * `(x1,y1)` on chord-thirds and snaps `(x2,y2)` toward 45° from `end`.
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

  /** Alt: use {@link placementPointerCubicControlPoints} (pointer on end handle only). */
  penPendingCubicAltEndHandleOnly(): boolean {
    return this.penPendingCurveAltChord;
  }

  appendPenPendingCurveToBaseD(baseD: string): string {
    const pending = this.penPendingSegment;
    if (!pending) return baseD;
    const segs = this.penSession.getSegments();
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, segs);
    const anchor = pending.anchor;
    const end = this.penPendingCurvePreviewEndSvg(pending);
    const dragCurrent = this.penPendingDragSvg ?? pending.startSvg;

    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const isFirstSeg = !altEndOnly && penPathOnlyMoveto(segs);
        const raw = altEndOnly
          ? placementPointerCubicControlPoints(anchor, end, dragCurrent, true)
          : placementIllustratorStyleCubicControlPoints(anchor, end, pending.startSvg, dragCurrent);
        let adjusted: CubicControlPoints;
        if (isFirstSeg) {
          adjusted = { ...raw, x1: anchor.x, y1: anchor.y };
        } else if (!altEndOnly) {
          const st = penReflectStateAfterCommitted(segs);
          adjusted = st?.canReflectCubic
            ? { ...raw, x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y }
            : raw;
        } else {
          adjusted = raw;
        }
        const controls = this.snapPenPendingCubicControls(anchor, end, adjusted, altEndOnly);
        return appendCubicToD(baseD, controls, end);
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return appendQuadraticToD(baseD, qc.x1, qc.y1, end.x, end.y);
      }
      case 'smoothCubic': {
        if (this.penPendingCurveAltChord) {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) {
            let hx = dragCurrent.x;
            let hy = dragCurrent.y;
            if (this.penPendingShiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
              hx = s.x;
              hy = s.y;
            }
            return appendSmoothCubicToD(baseD, hx, hy, end.x, end.y);
          }
          const x1 = st.canReflectCubic ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const y1 = st.canReflectCubic ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          return appendCubicToD(baseD, { x1, y1, x2: hx, y2: hy }, end);
        }
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        return appendSmoothCubicToD(baseD, hx, hy, end.x, end.y);
      }
      default: {
        if (this.penPendingCurveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return appendQuadraticToD(baseD, qc.x1, qc.y1, end.x, end.y);
        }
        if (this.penPendingShiftAngleSnap) {
          const st = penReflectStateAfterCommitted(segs);
          if (st) {
            let ix = 2 * anchor.x - st.quadCpX;
            let iy = 2 * anchor.y - st.quadCpY;
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            return appendQuadraticToD(baseD, s.x, s.y, end.x, end.y);
          }
        }
        return appendSmoothQuadraticToD(baseD, end.x, end.y);
      }
    }
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
    startSvg: { x: number; y: number },
    dragCurrent: { x: number; y: number },
    ctrlCurve: boolean,
    /** When set (e.g. pen close-to-start), terminal anchor must match moveto `M` exactly — use session moveto, not pointer/snapped copies. */
    segmentEnd?: { x: number; y: number }
  ): void {
    const mv = this.penPathStartMv();
    const end = segmentEnd !== undefined ? (mv ?? segmentEnd) : startSvg;
    const kind = penDragCurveAuthoringKind(ctrlCurve, this.penSession.getSegments());
    const segs = this.penSession.getSegments();
    switch (kind) {
      case 'cubic': {
        const altEndOnly = this.penPendingCubicAltEndHandleOnly();
        const isFirstSeg = !altEndOnly && penPathOnlyMoveto(segs);
        const raw = altEndOnly
          ? placementPointerCubicControlPoints(anchor, end, dragCurrent, true)
          : placementIllustratorStyleCubicControlPoints(anchor, end, startSvg, dragCurrent);
        let adjusted: CubicControlPoints;
        if (isFirstSeg) {
          adjusted = { ...raw, x1: anchor.x, y1: anchor.y };
        } else if (!altEndOnly) {
          const st = penReflectStateAfterCommitted(segs);
          adjusted = st?.canReflectCubic
            ? { ...raw, x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y }
            : raw;
        } else {
          adjusted = raw;
        }
        const c = this.snapPenPendingCubicControls(anchor, end, adjusted, altEndOnly);
        this.penSession.appendCubic(c.x1, c.y1, c.x2, c.y2, end.x, end.y);
        break;
      }
      case 'quadratic': {
        let q = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: q.x1, y: q.y1 });
          q = { x1: s.x, y1: s.y };
        }
        this.penSession.appendQuadratic(q.x1, q.y1, end.x, end.y);
        break;
      }
      case 'smoothCubic': {
        if (this.penPendingCurveAltChord) {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) {
            let hx = dragCurrent.x;
            let hy = dragCurrent.y;
            if (this.penPendingShiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
              hx = s.x;
              hy = s.y;
            }
            this.penSession.appendSmoothCubic(hx, hy, end.x, end.y);
            break;
          }
          const x1 = st.canReflectCubic ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const y1 = st.canReflectCubic ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          this.penSession.appendCubic(x1, y1, hx, hy, end.x, end.y);
          break;
        }
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (this.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        this.penSession.appendSmoothCubic(hx, hy, end.x, end.y);
        break;
      }
      default: {
        if (this.penPendingCurveAltChord) {
          let q = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (this.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: q.x1, y: q.y1 });
            q = { x1: s.x, y1: s.y };
          }
          this.penSession.appendQuadratic(q.x1, q.y1, end.x, end.y);
          break;
        }
        if (this.penPendingShiftAngleSnap) {
          const st = penReflectStateAfterCommitted(segs);
          if (st) {
            let ix = 2 * anchor.x - st.quadCpX;
            let iy = 2 * anchor.y - st.quadCpY;
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            this.penSession.appendQuadratic(s.x, s.y, end.x, end.y);
            break;
          }
        }
        this.penSession.appendSmoothQuadratic(end.x, end.y);
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

    const { anchor, startClient, startSvg } = this.penPendingSegment;
    const end = startSvg;
    if (penSvgDistanceSq(anchor, end) < 1e-12) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      this.ports.markForCheck();
      return;
    }
    const releaseSvg = this.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
    const dragCurrent = releaseSvg ?? this.penPendingDragSvg ?? startSvg;
    const screenDist = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      const segs = this.penSession.getSegments();
      const st = penReflectStateAfterCommitted(segs);
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        const dragCurrentClose = this.penPendingDragSvg ?? startSvg;
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrentClose, this.penPendingSegment.ctrlCurve, mClose);
      } else if (st?.canReflectCubic) {
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
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrent, this.penPendingSegment.ctrlCurve, mClose);
      } else {
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrent, this.penPendingSegment.ctrlCurve);
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
    const { anchor, startClient, startSvg } = this.penPendingSegment;
    const end = startSvg;
    if (penSvgDistanceSq(anchor, end) < 1e-12) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
      return;
    }
    const lc = this.penPendingLastClient ?? startClient;
    const screenDist = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      const segs = this.penSession.getSegments();
      const st = penReflectStateAfterCommitted(segs);
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        const dragCurrentClose = this.penPendingDragSvg ?? startSvg;
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrentClose, this.penPendingSegment.ctrlCurve, mClose);
      } else if (st?.canReflectCubic) {
        this.penSession.appendCubic(
          2 * anchor.x - st.cubicCp2X, 2 * anchor.y - st.cubicCp2Y,
          end.x, end.y,
          end.x, end.y
        );
      } else {
        this.penSession.addLinePoint(end.x, end.y);
      }
    } else {
      const dragCurrent = this.penPendingDragSvg ?? startSvg;
      const mClose = this.penPathStartMv();
      if (this.penPendingStartNearPathMoveto() && mClose) {
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrent, this.penPendingSegment.ctrlCurve, mClose);
      } else {
        this.commitPenDraggedCurve(anchor, startSvg, dragCurrent, this.penPendingSegment.ctrlCurve);
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

    const cont = this.penContinuingPathRewrite;
    if (cont) {
      this.ports.svgManipulation.updatePathData(cont.pathId, finalClosed);
      const cmd = new EditPathNodesCommand(this.ports.svgManipulation, cont.pathId, cont.originalD, finalClosed, true);
      this.ports.editorHistory.pushAndExecute(cmd);
      const svgSel = this.ports.svgManipulation.getSVGInstance();
      const mergedEl = svgSel?.findOne(`#${cont.pathId}`) as SvgJsElement | undefined;
      if (mergedEl) {
        this.ports.shapeSelection.selectShape(this.ports.svgManipulation.getShapeProperties(mergedEl));
      }
      const shapeBboxContinue = this.ports.svgManipulation.getShapeBBox(cont.pathId);
      if (shapeBboxContinue) {
        this.ports.setLastBbox(shapeBboxContinue);
        this.ports.clearHighlightRectCache();
      }
      this.clearDrawingState();
      this.ports.setTool('selector');
      this.ports.markForCheck();
      return;
    }

    const joinHit = penPathSegmentsAreValid(finishingSegsSnapshot)
      ? this.findPenOpenPathFinishJoin(finishingSegsSnapshot)
      : null;
    if (joinHit) {
      const mergedSegments =
        joinHit.stitch === 'appendToExistingTail'
          ? this.combinePenContinuationSegments(joinHit.existing, finishingSegsSnapshot)
          : this.combinePenContinuationSegments(finishingSegsSnapshot, joinHit.existing);
      if (mergedSegments) {
        finalClosed = closePath ? `${penPathSegmentsToD(mergedSegments)} Z` : penPathSegmentsToD(mergedSegments);
        this.ports.svgManipulation.updatePathData(joinHit.pathId, finalClosed);
        const joinCmd = new EditPathNodesCommand(
          this.ports.svgManipulation,
          joinHit.pathId,
          joinHit.originalD,
          finalClosed,
          true
        );
        this.ports.editorHistory.pushAndExecute(joinCmd);
        const svgJoin = this.ports.svgManipulation.getSVGInstance();
        const joinedEl = svgJoin?.findOne(`#${joinHit.pathId}`) as SvgJsElement | undefined;
        if (joinedEl) {
          this.ports.shapeSelection.selectShape(this.ports.svgManipulation.getShapeProperties(joinedEl));
        }
        const jb = this.ports.svgManipulation.getShapeBBox(joinHit.pathId);
        if (jb) {
          this.ports.setLastBbox(jb);
          this.ports.clearHighlightRectCache();
        }
        this.clearDrawingState();
        this.ports.setTool('selector');
        this.ports.markForCheck();
        return;
      }
    }

    const id = this.ports.svgManipulation.insertPathIntoContentGroup(finalClosed, undefined, { closedPath: closePath });
    if (!id) {
      this.clearDrawingState();
      return;
    }
    const svg = this.ports.svgManipulation.getSVGInstance();
    const el = svg?.findOne(`#${id}`) as SvgJsElement | undefined;
    if (el) {
      this.ports.shapeSelection.selectShape(this.ports.svgManipulation.getShapeProperties(el));
    }
    const cmd = new AddPathCommand(this.ports.svgManipulation, id, this.ports.shapeSelection);
    this.ports.editorHistory.pushAndExecute(cmd);
    const shapeBbox = this.ports.svgManipulation.getShapeBBox(id);
    if (shapeBbox) {
      this.ports.setLastBbox(shapeBbox);
      this.ports.clearHighlightRectCache();
    }
    this.clearDrawingState();
    this.ports.setTool('selector');
    this.ports.markForCheck();
  }

  handlePenCanvasMouseDown(event: MouseEvent, pt: { x: number; y: number }): void {
    if (event.detail >= 2) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penPendingCurveAltChord = false;
      this.penPendingShiftAngleSnap = false;
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
      this.ports.markForCheck();
      return;
    }
    const anchor = lastCommittedVertex(segs);
    if (!anchor) return;
    this.ports.clearPenPostInsertAnchorOverlay();
    this.penPendingSegment = {
      anchor: { x: anchor.x, y: anchor.y },
      startClient: { x: event.clientX, y: event.clientY },
      startSvg: { x: pt.x, y: pt.y },
      // Control (not ⌘ — ⌘ is snap bypass) or toolbar toggle: Q / S / T vs default cubic (h76).
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
    this.penPendingCurveAltChord = !!this.penPendingSegment && event.altKey;
    this.penPendingShiftAngleSnap = !!this.penPendingSegment && event.shiftKey;
    if (this.penPendingSegment) {
      this.penPendingLastClient = { x: event.clientX, y: event.clientY };
    }
    const pt = getSnappedPenPoint(event.clientX, event.clientY, event.altKey || event.metaKey || event.ctrlKey);
    if (pt) {
      if (this.penPendingSegment) {
        this.penPendingDragSvg = { x: pt.x, y: pt.y };
        this.penPointerSvg = { x: this.penPendingSegment.startSvg.x, y: this.penPendingSegment.startSvg.y };
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
      this.ports.svgManipulation.setShapeVisibility(pathId, true);
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
    const st = this.penInsertOnPath;
    const lc = this.penInsertOnPathLastClient ?? st.startClient;
    const screenDist = Math.hypot(lc.x - st.startClient.x, lc.y - st.startClient.y);
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      return pathSegmentsToD(st.splitBaseline);
    }
    const cur = this.penInsertOnPathPointerSvg ?? st.dragStartSvg;
    const base = st.splitBaseline.map((seg) => ({ ...seg })) as PathSegment[];
    return buildPenInsertDragPreviewD(base, st.insertMoveSegIndex, st.dragStartSvg, cur);
  }

  /**
   * Read-only insert-on-path eligibility (shared with {@link tryBeginPenInsertOnPath} for debug HUD).
   */
  evaluatePenInsertOnPathAt(
    penTarget: Element,
    clientX: number,
    clientY: number
  ):
    | { ok: false; reason: string }
    | {
        ok: true;
        pathId: string;
        oldD: string;
        parsed: PathSegment[];
        hit: PenPathInsertHit;
        split: PathSegment[];
        pt: { x: number; y: number };
      } {
    if (penTarget.tagName?.toLowerCase() !== 'path' || !penTarget.id) {
      return { ok: false, reason: 'target is not <path id=…>' };
    }
    const pathId = penTarget.id;
    const oldD = this.ports.getPathDForId(pathId)?.trim() ?? '';
    if (!oldD) return { ok: false, reason: 'empty path d' };
    const parsed = parsePathDForNodeEditing(oldD);
    if (!parsed) return { ok: false, reason: 'path d not parseable for node editing' };
    const pt = this.ports.clientToEditorSvgPoint(clientX, clientY);
    if (!pt) return { ok: false, reason: 'client→SVG mapping failed' };
    const tol = this.ports.getPenPathInsertToleranceSvg();
    const maxDistSq = tol * tol;
    const hit = findPenPathInsertHit(parsed, pt.x, pt.y, maxDistSq);
    if (!hit) return { ok: false, reason: `no segment within insert tolerance (~${tol.toFixed(2)} svg u)` };
    const split = applyPenPathInsert(parsed, hit);
    if (!split) return { ok: false, reason: 'applyPenPathInsert rejected' };
    const baselineD = pathSegmentsToD(split);
    if (baselineD === oldD) return { ok: false, reason: 'insert would not change d' };
    const reparsed = parsePathD(baselineD);
    if (reparsed.errors.length > 0 || reparsed.segments.length === 0 || reparsed.segments[0].type !== 'M') {
      return { ok: false, reason: 'split baseline invalid for commit' };
    }
    return { ok: true, pathId, oldD, parsed, hit, split, pt };
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
    const dragStartSvg = penInsertHitAnchorSvg(ev.parsed, ev.hit) ?? ev.pt;
    this.penInsertOnPath = {
      pathId: ev.pathId,
      originalD: ev.oldD,
      parsedBefore: ev.parsed,
      hit: ev.hit,
      insertMoveSegIndex: penInsertMoveSegmentIndexAfterSplit(ev.hit),
      splitBaseline: ev.split.map((s) => ({ ...s })) as PathSegment[],
      dragStartSvg,
      startClient: { x: event.clientX, y: event.clientY }
    };
    this.penInsertOnPathLastClient = { x: event.clientX, y: event.clientY };
    this.penInsertOnPathPointerSvg = { x: ev.pt.x, y: ev.pt.y };
    this.ports.svgManipulation.setShapeVisibility(ev.pathId, false);
    this.ports.markForCheck();
    return true;
  }

  private finishPenInsertOnPathDrag(event: MouseEvent): void {
    const st = this.penInsertOnPath;
    if (!st) return;
    const release = this.ports.clientToEditorSvgPoint(event.clientX, event.clientY);
    const lc = this.penInsertOnPathLastClient ?? st.startClient;
    const screenDist = Math.hypot(lc.x - st.startClient.x, lc.y - st.startClient.y);
    let newD: string;
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      newD = pathSegmentsToD(st.splitBaseline);
    } else {
      const cur = release ?? this.penInsertOnPathPointerSvg ?? st.dragStartSvg;
      const base = st.splitBaseline.map((seg) => ({ ...seg })) as PathSegment[];
      newD = buildPenInsertDragPreviewD(base, st.insertMoveSegIndex, st.dragStartSvg, cur) ?? pathSegmentsToD(st.splitBaseline);
    }
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
  }
}
