import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect, signal } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService, type EditorTool } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';
import { SnapService } from '../../services/snap.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { computeProportionalResizedUnion, type BBox, type ResizeCorner } from '../../utils/selection-resize';
import { type SkewEdge } from '../../utils/selection-skew';
import {
  unionRotationPivot,
  rotationDeltaFromPointerMoveRad,
  radiansToDegrees,
  rotateGhostWorldToUnionMatrix
} from '../../utils/selection-rotate';
import { MARQUEE_MIN_DRAG_PX } from '../../utils/marquee-selection';
import { screenPointToRootSvgUserPoint } from '../../utils/svg-screen-user';
import { ShapeProperties } from '../../models/shape-properties.interface';
import {
  EditorCommand,
  CompositeCommand,
  TranslateCommand,
  AlignCommand,
  DistributeCommand,
  UnionScaleCommand,
  UnionRotateCommand,
  RemoveShapesCommand,
  GroupCommand,
  UngroupCommand,
  AddShapeCommand,
  AddPathCommand,
  EditPathNodesCommand,
  PasteCommand,
  DuplicateCommand,
  TextContentCommand,
  buildReorderToExtremeCommand
} from '../../models/editor-commands';
import {
  DragGesture,
  ResizeGesture,
  RotateGesture,
  SkewGesture,
  CreationGesture,
  SelectionMarqueeGesture,
  ZoomMarqueeGesture,
  type GestureContext,
  type Rect
} from './gestures';
import {
  PenSession,
  appendCubicToD,
  appendLineToD,
  dragBendCubicControlPoints,
  lastCommittedVertex,
  penPathOnlyMoveto,
  penPathSegmentsToD,
  penSvgDistanceSq
} from '../../models/pen-path';
import { parsePathD, parsePathDForNodeEditing, pathSegmentsToD, type PathSegment } from '../../models/path-d';
import { insertPenNodeOnParsedPath } from '../../models/path-pen-insert';
import { ClipboardService } from '../../services/clipboard.service';
import { SnapCandidateShape } from '../../services/snap.service';

/** Target number of major ticks visible across the ruler at any zoom level. */
const RULER_TICK_COUNT = 30;

const CONTENT_SHAPE_TAGS = new Set([
  'circle',
  'rect',
  'path',
  'polygon',
  'ellipse',
  'line',
  'polyline',
  'text',
  'image',
  'use',
  'g'
]);

/** After loading SVG, fit the editor stage in the canvas with this much inset (margin). */
const INITIAL_LOAD_VIEWPORT_FIT_FRACTION = 0.88;
const PEN_FINISH_FEEDBACK_DURATION_MS = 1200;
const PATH_NODE_EDIT_FEEDBACK_DURATION_MS = 1400;
const ALIGN_LEFT_SHORTCUT = 'ArrowLeft';
const ALIGN_RIGHT_SHORTCUT = 'ArrowRight';
const ALIGN_TOP_SHORTCUT = 'ArrowUp';
const ALIGN_CENTER_SHORTCUT = 'ArrowDown';
const ALIGN_MIDDLE_SHORTCUT = 'm';
const ALIGN_BOTTOM_SHORTCUT = 'b';
const DISTRIBUTE_HORIZONTAL_SHORTCUT = 'h';
const DISTRIBUTE_VERTICAL_SHORTCUT = 'v';

interface PathNodePoint {
  x: number;
  y: number;
  segmentIndex: number;
  moveSegmentIndex: number;
}

interface PathNodeControlHandle {
  anchorX: number;
  anchorY: number;
  controlX: number;
  controlY: number;
  segmentIndex: number;
  controlPoint: 'x1y1' | 'x2y2';
}

interface PathNodeEditPathState {
  pathId: string;
  anchors: PathNodePoint[];
  controlHandles: PathNodeControlHandle[];
}

interface PathNodeSelectionState {
  pathId: string;
  moveSegmentIndex: number;
}

interface PathNodeEditState {
  paths: PathNodeEditPathState[];
  activePathId: string | null;
}

interface PathNodeEditStateBuildResult {
  state: PathNodeEditPathState | null;
  reason: string | null;
}

interface PathNodeDragSession {
  pathId: string;
  oldD: string;
  segments: PathSegment[];
  target:
    | { kind: 'anchor'; index: number }
    | { kind: 'control'; index: number };
}

interface InlineTextEditState {
  textId: string;
  originalText: string;
}

interface GridLineOverlay {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
}

interface SmartGuideLineOverlay {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Round to nearest "nice" step (1, 2, 5 × 10^n) for readable labels. */
function roundToNiceStep(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = Math.pow(10, exp);
  const normalized = value / mag;
  const nice = normalized <= 1.5 ? 1 : normalized <= 3.5 ? 2 : normalized <= 7.5 ? 5 : 10;
  return mag * nice;
}

/** 10%–1000% zoom band for TUX-5 inverse-scale formulas; avoids div-by-zero and runaway values. */
const SELECTION_CHROME_ZOOM_CLAMP_MIN = 0.1;
const SELECTION_CHROME_ZOOM_CLAMP_MAX = 10;

const HANDLE_RADIUS_REF_SCREEN_PX = 6;
const HANDLE_RADIUS_MIN_SCREEN_PX = 4;
const HANDLE_RADIUS_MAX_SCREEN_PX = 8;

const ROTATE_HANDLE_OFFSET_REF_SCREEN_PX = 28;
const ROTATE_HANDLE_OFFSET_MIN_SCREEN_PX = 20;
const ROTATE_HANDLE_OFFSET_MAX_SCREEN_PX = 40;

/** Exported for unit tests (TUX-5). */
export function clampCanvasScaleForSelectionChrome(scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.min(SELECTION_CHROME_ZOOM_CLAMP_MAX, Math.max(SELECTION_CHROME_ZOOM_CLAMP_MIN, s));
}

/** Overlay SVG `r` in px (overlay viewBox matches screen px of the scaled stage). */
export function selectionHandleRadiusOverlayPx(scale: number): number {
  const s = clampCanvasScaleForSelectionChrome(scale);
  const raw = HANDLE_RADIUS_REF_SCREEN_PX / s;
  return Math.min(HANDLE_RADIUS_MAX_SCREEN_PX, Math.max(HANDLE_RADIUS_MIN_SCREEN_PX, raw));
}

/** Distance from selection top edge to rotate handle center, in overlay px. */
export function rotateHandleOffsetOverlayPx(scale: number): number {
  const s = clampCanvasScaleForSelectionChrome(scale);
  const raw = ROTATE_HANDLE_OFFSET_REF_SCREEN_PX / s;
  return Math.min(ROTATE_HANDLE_OFFSET_MAX_SCREEN_PX, Math.max(ROTATE_HANDLE_OFFSET_MIN_SCREEN_PX, raw));
}

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [],
  templateUrl: './svg-canvas.component.html',
  styleUrl: './svg-canvas.component.css',
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(document:mousemove)': 'onDocumentMouseMove($event)',
    '(document:mouseup)': 'onDocumentMouseUp($event)'
  }
})
export class SvgCanvasComponent implements AfterViewInit, OnInit, OnDestroy {
  readonly RULER_SIZE = 24;
  readonly svgContent = input<string>('');
  readonly svgContainer = viewChild<ElementRef<HTMLElement>>('svgContainer');
  readonly zoomWrapper = viewChild<ElementRef<HTMLElement>>('zoomWrapper');
  readonly highlightOverlayContainer = viewChild<ElementRef<HTMLElement>>('highlightOverlayContainer');
  readonly canvasViewport = viewChild<ElementRef<HTMLElement>>('canvasViewport');
  readonly inlineTextEditor = viewChild<ElementRef<HTMLTextAreaElement>>('inlineTextEditor');
  altKeyPressed = false;
  isPanning = false;
  overlayViewBox = '0 0 100 100';
  wrapperWidth = 0;
  wrapperHeight = 0;
  rulerOriginOffsetX = 0;
  rulerOriginOffsetY = 0;

  get overlayWidthPx(): number {
    return this.wrapperWidth * this.canvasView.scale;
  }
  get overlayHeightPx(): number {
    return this.wrapperHeight * this.canvasView.scale;
  }
  get zoomLevelPercent(): number {
    return Math.round(this.canvasView.scale * 100);
  }

  get isInlineTextEditModeActive(): boolean {
    return this.inlineTextEditState !== null;
  }

  get inlineTextEditValue(): string {
    return this.inlineTextEditDraft;
  }

  get inlineTextEditOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.inlineTextEditState) return null;
    const bbox =
      this.svgManipulation.getShapeBBox(this.inlineTextEditState.textId) ??
      this.svgManipulation.getShapeBBox(this.inlineTextEditState.textId, { preferScreenBounds: false });
    if (!bbox) return null;
    return this.svgBboxToOverlayPixels(bbox);
  }

  inlineTextEditWidthPx(rect: { width: number }): number {
    return Math.max(24, rect.width);
  }

  inlineTextEditHeightPx(rect: { height: number }): number {
    return Math.max(18, rect.height);
  }

  get horizontalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originX = this.rulerOriginOffsetX + this.canvasView.panX;
    return this.getRulerTicks(
      (0 - originX) / this.canvasView.scale,
      (this.wrapperWidth - originX) / this.canvasView.scale,
      this.canvasView.scale,
      (svgVal) => this.rulerOriginOffsetX + this.canvasView.panX + svgVal * this.canvasView.scale,
      this.wrapperWidth,
      RULER_TICK_COUNT
    );
  }

  get showResizeHandles(): boolean {
    return (
      this.editorTool.getCurrentTool() === 'selector' &&
      this.shapeSelection.getSelectedShapes().length > 0 &&
      !this.isDraggingShape &&
      !this.isResizingSelection &&
      !this.isRotatingSelection &&
      !this.isSkewingSelection &&
      !this.isSelectionMarquee &&
      this.wrapperWidth > 0 &&
      !!this.lastBbox
    );
  }

  /** Resize/skew/rotate handle circle radius in overlay px (inverse zoom, clamped 4–8 screen px). */
  get selectionHandleRadiusOverlay(): number {
    return selectionHandleRadiusOverlayPx(this.canvasView.scale);
  }

  /** Rotate stem length and handle offset from selection top (inverse zoom, clamped 20–40 screen px). */
  get rotateHandleOffset(): number {
    return rotateHandleOffsetOverlayPx(this.canvasView.scale);
  }

  get verticalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originY = this.rulerOriginOffsetY + this.canvasView.panY;
    return this.getRulerTicks(
      (0 - originY) / this.canvasView.scale,
      (this.wrapperHeight - originY) / this.canvasView.scale,
      this.canvasView.scale,
      (svgVal) => this.rulerOriginOffsetY + this.canvasView.panY + svgVal * this.canvasView.scale,
      this.wrapperHeight,
      Math.max(1, Math.floor(RULER_TICK_COUNT / 2))
    );
  }

  get showGridOverlay(): boolean {
    return (
      this.editorTool.isGridSnapEnabled() &&
      !!this.svgContent() &&
      this.wrapperWidth > 0 &&
      this.wrapperHeight > 0 &&
      this.canvasView.scale > 0
    );
  }

  get gridStepSvgUnits(): number {
    const baseStep = 10;
    const minScreenSpacingPx = 16;
    const maxScreenSpacingPx = 48;
    const scale = this.canvasView.scale;
    if (scale <= 0 || !Number.isFinite(scale)) return baseStep;

    let step = baseStep;
    let screenSpacing = step * scale;
    if (screenSpacing < minScreenSpacingPx) {
      while (screenSpacing < minScreenSpacingPx) {
        step *= 2;
        screenSpacing *= 2;
      }
      return step;
    }
    while (screenSpacing > maxScreenSpacingPx && step > baseStep / 64) {
      step /= 2;
      screenSpacing /= 2;
    }
    return step;
  }

  get verticalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgX / step) * step;
    const out: GridLineOverlay[] = [];
    for (let x = first; x <= maxSvgX + step * 0.5; x += step) {
      const xOverlay = this.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).x;
      const top = this.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).y;
      const bottom = this.svgBboxToOverlayPixels({ x, y: maxSvgY, width: 0, height: 0 }).y;
      const major = Math.abs((x / majorStep) - Math.round(x / majorStep)) < 1e-6;
      out.push({
        key: `vx-${x.toFixed(4)}`,
        x1: xOverlay,
        y1: Math.min(top, bottom),
        x2: xOverlay,
        y2: Math.max(top, bottom),
        major
      });
    }
    return out;
  }

  get horizontalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgY / step) * step;
    const out: GridLineOverlay[] = [];
    for (let y = first; y <= maxSvgY + step * 0.5; y += step) {
      const yOverlay = this.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).y;
      const left = this.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).x;
      const right = this.svgBboxToOverlayPixels({ x: maxSvgX, y, width: 0, height: 0 }).x;
      const major = Math.abs((y / majorStep) - Math.round(y / majorStep)) < 1e-6;
      out.push({
        key: `hy-${y.toFixed(4)}`,
        x1: Math.min(left, right),
        y1: yOverlay,
        x2: Math.max(left, right),
        y2: yOverlay,
        major
      });
    }
    return out;
  }

  get verticalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.altKeyPressed) return [];
    const guides = this.isDraggingShape
      ? this.drag.activeGuides.vertical
      : this.isResizingSelection
        ? this.resize.activeGuides.vertical
        : [];
    if (guides.length === 0 || this.overlayHeightPx <= 0) return [];
    return guides.map((x) => {
      const mapped = this.svgBboxToOverlayPixels({ x, y: 0, width: 0, height: 0 });
      return {
        key: `smart-v-${x.toFixed(4)}`,
        x1: mapped.x,
        y1: 0,
        x2: mapped.x,
        y2: this.overlayHeightPx
      };
    });
  }

  get horizontalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.altKeyPressed) return [];
    const guides = this.isDraggingShape
      ? this.drag.activeGuides.horizontal
      : this.isResizingSelection
        ? this.resize.activeGuides.horizontal
        : [];
    if (guides.length === 0 || this.overlayWidthPx <= 0) return [];
    return guides.map((y) => {
      const mapped = this.svgBboxToOverlayPixels({ x: 0, y, width: 0, height: 0 });
      return {
        key: `smart-h-${y.toFixed(4)}`,
        x1: 0,
        y1: mapped.y,
        x2: this.overlayWidthPx,
        y2: mapped.y
      };
    });
  }

  private getVisibleSvgBoundsFromRulerFrame(): { minSvgX: number; maxSvgX: number; minSvgY: number; maxSvgY: number } {
    const originX = this.rulerOriginOffsetX + this.canvasView.panX;
    const originY = this.rulerOriginOffsetY + this.canvasView.panY;
    const scale = this.canvasView.scale || 1;
    return {
      minSvgX: (0 - originX) / scale,
      maxSvgX: (this.wrapperWidth - originX) / scale,
      minSvgY: (0 - originY) / scale,
      maxSvgY: (this.wrapperHeight - originY) / scale
    };
  }

  private getRulerTicks(
    minSvg: number,
    maxSvg: number,
    scale: number,
    toPosition: (svgVal: number) => number,
    sizePx: number,
    tickCount: number
  ): { position: number; value: number; major: boolean }[] {
    if (sizePx <= 0 || scale <= 0 || tickCount <= 0) return [];
    const visibleRangeSvg = sizePx / scale;
    const rawStep = visibleRangeSvg / tickCount;
    const step = roundToNiceStep(rawStep);
    const minorStep = step / 2;
    const first = Math.floor(minSvg / minorStep) * minorStep;
    const out: { position: number; value: number; major: boolean }[] = [];
    for (let v = first; v <= maxSvg + minorStep * 0.5; v += minorStep) {
      const pos = toPosition(v);
      if (pos >= -0.5 && pos <= sizePx + 0.5) {
        const isMajor = Math.abs((v / step) - Math.round(v / step)) < 1e-6;
        out.push({ position: pos, value: isMajor ? Math.round(v) : v, major: isMajor });
      }
    }
    return out;
  }

  // --- Gesture handlers ---
  private readonly drag = new DragGesture();
  private readonly resize = new ResizeGesture();
  private readonly rotate = new RotateGesture();
  private readonly skew = new SkewGesture();
  private readonly creation = new CreationGesture();
  private readonly selectionMarquee = new SelectionMarqueeGesture();
  private readonly zoomMarquee = new ZoomMarqueeGesture();
  private readonly penSession = new PenSession();
  private readonly acceptedSvgContent = signal<string>('');
  private lastObservedTool: EditorTool = 'selector';
  private isRevertingToolChange = false;
  penFinishFeedbackMessage: string | null = null;
  private penFinishFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  pathNodeEditFeedbackMessage: string | null = null;
  private pathNodeEditFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private penPointerSvg: { x: number; y: number } | null = null;
  /** Deferred next vertex: commit on mouseup as L (click) or C (drag past threshold). */
  private penPendingSegment: {
    anchor: { x: number; y: number };
    startClient: { x: number; y: number };
    startSvg: { x: number; y: number };
  } | null = null;
  private penPendingLastClient: { x: number; y: number } | null = null;
  private penPendingDragSvg: { x: number; y: number } | null = null;

  // Proxy getters for template bindings and inter-gesture guards
  get isDraggingShape(): boolean { return this.drag.isActive; }
  get isResizingSelection(): boolean { return this.resize.isActive; }
  get isRotatingSelection(): boolean { return this.rotate.isActive; }
  get isSkewingSelection(): boolean { return this.skew.isActive; }
  get isCreatingShape(): boolean { return this.creation.isActive; }
  get isSelectionMarquee(): boolean { return this.selectionMarquee.isActive; }
  get isZoomMarquee(): boolean { return this.zoomMarquee.isActive; }
  get creationGhostRect(): Rect | null { return this.creation.ghostRect; }
  get creationShapeType(): string { return this.creation.activeShapeType; }

  get creationGhostLineOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const start = this.creation.ghostLineStart;
    const end = this.creation.ghostLineEnd;
    if (!start || !end) return null;
    const p1 = this.svgBboxToOverlayPixels({ x: start.x, y: start.y, width: 0, height: 0 });
    const p2 = this.svgBboxToOverlayPixels({ x: end.x, y: end.y, width: 0, height: 0 });
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  get isPenSessionActive(): boolean {
    return this.penSession.getSegments().length > 0;
  }

  get penPendingShowsCurvePreview(): boolean {
    if (!this.penPendingSegment || !this.penPendingLastClient) return false;
    const { startClient } = this.penPendingSegment;
    const lc = this.penPendingLastClient;
    return Math.hypot(lc.x - startClient.x, lc.y - startClient.y) >= MARQUEE_MIN_DRAG_PX;
  }

  /**
   * Full in-progress pen preview (`M/L/C...`) including committed segments plus the current
   * pending segment to pointer. This keeps the whole path visible during authoring.
   */
  get penSessionPreviewPathD(): string | null {
    if (this.editorTool.getCurrentTool() !== 'pen' || !this.isPenSessionActive) return null;
    const base = penPathSegmentsToD(this.penSession.getSegments());
    if (!base || !this.penPointerSvg) return base || null;
    const segs = this.penSession.getSegments();
    const anchor = this.penPendingSegment?.anchor ?? lastCommittedVertex(segs);
    if (!anchor) return base;

    if (this.penPendingSegment && this.penPendingShowsCurvePreview) {
      const fixedEnd = this.penPendingSegment.startSvg;
      const dragCurrent = this.penPendingDragSvg ?? fixedEnd;
      const controls = dragBendCubicControlPoints(
        this.penPendingSegment.anchor,
        fixedEnd,
        this.penPendingSegment.startSvg,
        dragCurrent
      );
      return appendCubicToD(base, controls, fixedEnd);
    }
    return appendLineToD(base, this.penPointerSvg.x, this.penPointerSvg.y);
  }

  /** Live cubic preview `d` (committed segments + drag-bent C to pointer). */
  get penCurvePreviewPathD(): string | null {
    if (
      !this.penPendingSegment ||
      !this.penPointerSvg ||
      !this.penPendingShowsCurvePreview ||
      this.editorTool.getCurrentTool() !== 'pen'
    ) {
      return null;
    }
    const base = penPathSegmentsToD(this.penSession.getSegments());
    const fixedEnd = this.penPendingSegment.startSvg;
    const dragCurrent = this.penPendingDragSvg ?? fixedEnd;
    const controls = dragBendCubicControlPoints(
      this.penPendingSegment.anchor,
      fixedEnd,
      this.penPendingSegment.startSvg,
      dragCurrent
    );
    return appendCubicToD(base, controls, fixedEnd);
  }

  /** Control handle centers (overlay px) while dragging a cubic preview. */
  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    if (!this.penCurvePreviewPathD || !this.penPendingSegment || !this.penPointerSvg) return [];
    const fixedEnd = this.penPendingSegment.startSvg;
    const dragCurrent = this.penPendingDragSvg ?? fixedEnd;
    const { x1, y1, x2, y2 } = dragBendCubicControlPoints(
      this.penPendingSegment.anchor,
      fixedEnd,
      this.penPendingSegment.startSvg,
      dragCurrent
    );
    const p1 = this.svgBboxToOverlayPixels({ x: x1, y: y1, width: 0, height: 0 });
    const p2 = this.svgBboxToOverlayPixels({ x: x2, y: y2, width: 0, height: 0 });
    return [
      { cx: p1.x, cy: p1.y },
      { cx: p2.x, cy: p2.y }
    ];
  }

  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (!this.isPenSessionActive || !this.penPointerSvg || this.editorTool.getCurrentTool() !== 'pen') {
      return null;
    }
    if (this.penPendingSegment && this.penPendingShowsCurvePreview) return null;
    const anchor = this.penPendingSegment
      ? this.penPendingSegment.anchor
      : lastCommittedVertex(this.penSession.getSegments());
    if (!anchor) return null;
    const p1 = this.svgBboxToOverlayPixels({ x: anchor.x, y: anchor.y, width: 0, height: 0 });
    const p2 = this.svgBboxToOverlayPixels({
      x: this.penPointerSvg.x,
      y: this.penPointerSvg.y,
      width: 0,
      height: 0
    });
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  get isPathNodeEditModeActive(): boolean {
    return this.pathNodeEditState !== null;
  }

  get pathNodeAnchorOverlays(): { cx: number; cy: number; selected: boolean; pathId: string; anchorIndex: number }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.anchors.map((anchor, anchorIndex) => {
        const overlay = this.svgBboxToOverlayPixels({ x: anchor.x, y: anchor.y, width: 0, height: 0 });
        return {
          cx: overlay.x,
          cy: overlay.y,
          selected:
            this.selectedPathNode?.pathId === pathState.pathId &&
            this.selectedPathNode.moveSegmentIndex === anchor.moveSegmentIndex,
          pathId: pathState.pathId,
          anchorIndex
        };
      })
    );
  }

  get pathNodeControlHandleOverlays(): {
    x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; pathId: string; handleIndex: number
  }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.controlHandles.map((handle, handleIndex) => {
        const anchor = this.svgBboxToOverlayPixels({
          x: handle.anchorX,
          y: handle.anchorY,
          width: 0,
          height: 0
        });
        const control = this.svgBboxToOverlayPixels({
          x: handle.controlX,
          y: handle.controlY,
          width: 0,
          height: 0
        });
        return {
          x1: anchor.x,
          y1: anchor.y,
          x2: control.x,
          y2: control.y,
          cx: control.x,
          cy: control.y,
          pathId: pathState.pathId,
          handleIndex
        };
      })
    );
  }

  // --- Shared selection/highlight state ---
  lastBbox: { x: number; y: number; width: number; height: number } | null = null;
  private _highlightRectCache: { x: number; y: number; width: number; height: number } | null = null;
  _highlightRectCacheKey = '';

  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isResizingSelection && this.resize.overlayRect) return this.resize.overlayRect;
    if (this.isSkewingSelection && this.skew.overlayRect) return this.skew.overlayRect;
    if (this.isRotatingSelection && this.rotate.unionStart && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
      return this.svgBboxToOverlayPixels(this.rotate.unionStart);
    }
    if (this.isDraggingShape && this.drag.overlayRect) return this.drag.overlayRect;
    if (!this.lastBbox || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this._highlightRectCache = null;
      this._highlightRectCacheKey = '';
      return null;
    }
    const idKey = this.shapeSelection.getSelectedShapes().map((s) => s.id).join(',');
    const key = `${this.lastBbox.x}-${this.lastBbox.y}-${this.lastBbox.width}-${this.lastBbox.height}-${this.wrapperWidth}-${this.wrapperHeight}-${this.canvasView.scale}-${this.canvasView.panX}-${this.canvasView.panY}-${this.svgManipulation.documentRevision()}-${idKey}`;
    if (this._highlightRectCacheKey === key) {
      return this._highlightRectCache;
    }
    this._highlightRectCacheKey = key;
    const fromDom = this.selectionHighlightOverlayFromDom();
    const resolved =
      fromDom ?? this.svgBboxToOverlayPixels(this.lastBbox);
    this._highlightRectCache = resolved;
    this.logSelectionHighlightRecompute(
      fromDom != null ? 'dom-union' : 'lastBbox-fallback',
      fromDom,
      resolved
    );
    return this._highlightRectCache;
  }

  private logSelectionHighlightRecompute(
    source: 'dom-union' | 'lastBbox-fallback',
    fromDom: { x: number; y: number; width: number; height: number } | null,
    resolvedOverlay: { x: number; y: number; width: number; height: number }
  ): void {
    const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    const svg = this.svgManipulation.getSVGInstance();
    const perId: Record<string, { left: number; top: number; width: number; height: number }> = {};
    if (svg) {
      for (const id of ids) {
        const el = svg.findOne(`#${id}`);
        const node = el?.node as unknown as SVGGraphicsElement | undefined;
        if (!node || typeof node.getBoundingClientRect !== 'function') {
          perId[id] = { left: NaN, top: NaN, width: NaN, height: NaN };
          continue;
        }
        const r = node.getBoundingClientRect();
        perId[id] = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    console.debug('[selection-highlight]', {
      source,
      selectedIds: ids,
      selectedCount: ids.length,
      fromDomOverlay: fromDom,
      lastBboxUserSpace: this.lastBbox,
      resolvedOverlay,
      fallbackWouldBeLastBboxMapping: source === 'lastBbox-fallback',
      perIdClientRect: perId,
      documentRevision: this.svgManipulation.documentRevision()
    });
  }

  private selectionHighlightOverlayFromDom(): { x: number; y: number; width: number; height: number } | null {
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const svg = this.svgManipulation.getSVGInstance();
    if (!overlayEl || !svg) return null;
    const ocr = overlayEl.getBoundingClientRect();
    if (ocr.width <= 0 || ocr.height <= 0) return null;
    const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (ids.length === 0) return null;
    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    let any = false;
    for (const id of ids) {
      const el = svg.findOne(`#${id}`);
      const node = el?.node as unknown as SVGGraphicsElement | undefined;
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      any = true;
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    }
    if (!any || !Number.isFinite(minL)) return null;
    const w = maxR - minL;
    const h = maxB - minT;
    if (w <= 0 || h <= 0) return null;
    return {
      x: minL - ocr.left,
      y: minT - ocr.top,
      width: w,
      height: h
    };
  }

  get multiSelectionOutlineRects(): { x: number; y: number; width: number; height: number; id: string }[] {
    if (this.isDraggingShape || this.isResizingSelection || this.isRotatingSelection) return [];
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return [];
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length <= 1) return [];
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const svg = this.svgManipulation.getSVGInstance();
    if (!overlayEl || !svg) return [];
    const ocr = overlayEl.getBoundingClientRect();
    if (ocr.width <= 0 || ocr.height <= 0) return [];
    const out: { x: number; y: number; width: number; height: number; id: string }[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`);
      const node = el?.node as unknown as SVGGraphicsElement | undefined;
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      out.push({
        id: s.id,
        x: r.left - ocr.left,
        y: r.top - ocr.top,
        width: r.width,
        height: r.height
      });
    }
    return out.length >= 2 ? out : [];
  }

  selectionRotateHighlightTransform(_hr: { x: number; y: number; width: number; height: number }): string {
    if (!this.isRotatingSelection || !this.rotate.pivotDoc) return '';
    const po = this.svgBboxToOverlayPixels({
      x: this.rotate.pivotDoc.x,
      y: this.rotate.pivotDoc.y,
      width: 0,
      height: 0
    });
    return `rotate(${radiansToDegrees(this.rotate.accumulatedRad)},${po.x},${po.y})`;
  }

  private _viewBoxOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  get viewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    return this._viewBoxOverlayRect;
  }

  // --- Pan state ---
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;

  get zoomMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    const r = this.zoomMarquee.rect;
    if (!r) return null;
    return { left: r.x, top: r.y, width: r.width, height: r.height };
  }

  get selectionMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    const r = this.selectionMarquee.rect;
    if (!r) return null;
    return { left: r.x, top: r.y, width: r.width, height: r.height };
  }

  drilledIntoGroupId: string | null = null;
  private pathNodeEditState: PathNodeEditState | null = null;
  private inlineTextEditState: InlineTextEditState | null = null;
  private inlineTextEditDraft = '';
  private selectedPathNode: PathNodeSelectionState | null = null;
  private pathNodeDragSession: PathNodeDragSession | null = null;
  private pathNodeDragJustEnded = false;
  private duplicateInvocationCount = 0;
  private duplicateSelectionKey = '';

  // --- GestureContext implementation ---
  private get gestureCtx(): GestureContext {
    return {
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory,
      canvasView: this.canvasView,
      snap: this.snap,
      cdr: this.cdr,
      svgContainer: this.svgContainer,
      zoomWrapper: this.zoomWrapper,
      highlightOverlayContainer: this.highlightOverlayContainer,
      overlayViewBox: this.overlayViewBox,
      clientToEditorSvgPoint: (cx: number, cy: number) => this.clientToEditorSvgPoint(cx, cy),
      svgBboxToOverlayPixels: (bbox: Rect) => this.svgBboxToOverlayPixels(bbox),
      getSmartGuideCandidates: () => this.getSmartGuideCandidates(),
      isSnapTemporarilyDisabled: () => this.altKeyPressed,
      invalidateHighlightCache: () => { this._highlightRectCacheKey = ''; },
      setLastBbox: (bbox: Rect | null) => { this.lastBbox = bbox; }
    };
  }

  // --- Keyboard shortcuts ---
  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
    if (event.key === 'Escape' && this.commitInlineTextEditIfActive()) {
      event.preventDefault();
      return;
    }
    if (this.shouldIgnoreKeyboardShortcuts(event)) return;

    const selectorActive = this.editorTool.getCurrentTool() === 'selector';

    if (event.key === 'Escape') {
      if (this.isDraggingShape) {
        this.drag.cancel(this.gestureCtx);
        event.preventDefault();
        return;
      }
      if (this.isResizingSelection) {
        this.resize.cancel(this.gestureCtx);
        event.preventDefault();
        return;
      }
      if (this.isSkewingSelection) {
        this.skew.cancel(this.gestureCtx);
        event.preventDefault();
        return;
      }
      if (this.isRotatingSelection) {
        this.rotate.cancel(this.gestureCtx);
        event.preventDefault();
        return;
      }
      if (this.isSelectionMarquee || this.isZoomMarquee) {
        this.cancelActiveMarquees();
        event.preventDefault();
        return;
      }
      if (this.exitPathNodeEditMode()) {
        event.preventDefault();
        return;
      }
      if (this.editorTool.getCurrentTool() === 'pen' && this.isPenSessionActive) {
        this.clearPenDrawingState();
        event.preventDefault();
        return;
      }
      if (this.shapeSelection.getSelectedShapes().length > 0) {
        this.shapeSelection.clearSelection();
        this.svgManipulation.clearHighlight();
        this.drilledIntoGroupId = null;
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'Enter') {
      if (this.editorTool.getCurrentTool() === 'pen' && this.isPenSessionActive) {
        this.tryFinishPenPath(false);
        event.preventDefault();
        return;
      }
    }

    if (!this.svgContent()) return;

    const mod = event.ctrlKey || event.metaKey;

    if (mod && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
      this.editorHistory.undo();
      event.preventDefault();
      return;
    }
    if (mod && ((event.key === 'z' || event.key === 'Z') && event.shiftKey || event.key === 'y' || event.key === 'Y')) {
      this.editorHistory.redo();
      event.preventDefault();
      return;
    }

    if (selectorActive && mod && (event.key === 'a' || event.key === 'A')) {
      this.selectAllShapesFromDocument();
      event.preventDefault();
      return;
    }

    if (selectorActive && mod && (event.key === 'c' || event.key === 'C')) {
      this.copySelectionToClipboard();
      event.preventDefault();
      return;
    }

    if (selectorActive && mod && (event.key === 'x' || event.key === 'X')) {
      if (this.cutSelectionToClipboard()) {
        event.preventDefault();
      }
      return;
    }

    if (selectorActive && mod && (event.key === 'v' || event.key === 'V')) {
      if (this.pasteFromClipboard()) {
        event.preventDefault();
      }
      return;
    }

    if (selectorActive && mod && (event.key === 'd' || event.key === 'D')) {
      if (this.duplicateSelection()) {
        event.preventDefault();
      }
      return;
    }

    if (selectorActive && mod && event.shiftKey && this.handleAlignmentShortcut(event.key)) {
      event.preventDefault();
      return;
    }

    if (selectorActive && mod && (event.key === 'g' || event.key === 'G') && !event.shiftKey) {
      this.groupSelectedShapes();
      event.preventDefault();
      return;
    }

    if (selectorActive && mod && (event.key === 'g' || event.key === 'G') && event.shiftKey) {
      this.ungroupSelectedShape();
      event.preventDefault();
      return;
    }

    // Z-order: `]` bring to front, `[` send to back (selector only, plain keys — no Cmd/Ctrl so we
    // do not clash with Ctrl/Cmd+Shift+Arrow alignment shortcuts). Cmd/Ctrl+Shift+Up/Down would be
    // an alternative; brackets match common design-tool muscle memory. Multi-select order is
    // handled in `buildReorderToExtremeCommand`.
    if (selectorActive && !mod && (event.key === ']' || event.key === '[')) {
      const direction = event.key === ']' ? 'front' : 'back';
      const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const cmd = buildReorderToExtremeCommand(this.svgManipulation, ids, direction);
      if (cmd) {
        this.editorHistory.pushAndExecute(cmd);
        event.preventDefault();
      }
      return;
    }

    if (mod && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) {
      this.zoomInAtViewportCenter();
      event.preventDefault();
      return;
    }

    if (mod && (event.key === '-' || event.code === 'NumpadSubtract')) {
      this.zoomOutAtViewportCenter();
      event.preventDefault();
      return;
    }

    if (mod && event.key === '0') {
      this.canvasView.resetZoom();
      this.updateViewBoxOverlayRect();
      this.cdr.detectChanges();
      event.preventDefault();
      return;
    }

    if (mod && event.key === '1') {
      this.fitArtboardToViewport();
      event.preventDefault();
      return;
    }

    if (mod && event.key === '2') {
      this.fitContentToViewport();
      event.preventDefault();
      return;
    }

    if (
      this.pathNodeEditState &&
      (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      if (this.tryDeleteSelectedPathNode()) {
        event.preventDefault();
      }
      return;
    }

    if (
      selectorActive &&
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.shapeSelection.getSelectedShapes().length > 0
    ) {
      const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const cmd = new RemoveShapesCommand(this.svgManipulation, ids, this.shapeSelection);
      this.editorHistory.pushAndExecute(cmd);
      this.svgManipulation.clearHighlight();
      event.preventDefault();
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  private getSmartGuideCandidates(): SnapCandidateShape[] {
    const items = this.svgManipulation.getLayerStackItems();
    const out: SnapCandidateShape[] = [];
    for (const item of items) {
      const bbox = this.svgManipulation.getShapeBBox(item.id);
      if (!bbox) continue;
      out.push({
        id: item.id,
        bbox: {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        }
      });
    }
    return out;
  }

  private shouldIgnoreKeyboardShortcuts(event: KeyboardEvent): boolean {
    const t = event.target;
    if (!t || !(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private zoomInAtViewportCenter(): void {
    if (!this.canvasView.isInitialized() || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;
    const svgX = (this.wrapperWidth / 2 - this.canvasView.panX) / this.canvasView.scale;
    const svgY = (this.wrapperHeight / 2 - this.canvasView.panY) / this.canvasView.scale;
    this.canvasView.zoomInAt(svgX, svgY);
    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private zoomOutAtViewportCenter(): void {
    if (!this.canvasView.isInitialized() || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;
    const svgX = (this.wrapperWidth / 2 - this.canvasView.panX) / this.canvasView.scale;
    const svgY = (this.wrapperHeight / 2 - this.canvasView.panY) / this.canvasView.scale;
    this.canvasView.zoomOutAt(svgX, svgY);
    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitDocumentToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) return;

    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(0, 0, svgWpx, svgHpx, vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION);
    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitArtboardToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const ab = this.svgManipulation.getArtboard();
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) return;

    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(0, 0, svgWpx, svgHpx, vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION);
    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitContentToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const items = this.svgManipulation.getLayerStackItems();
    if (items.length === 0) return;

    const allIds = items.map((item) => item.id);
    const contentBbox = this.svgManipulation.getUnionBBox(allIds);
    if (!contentBbox || contentBbox.width <= 0 || contentBbox.height <= 0) return;

    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const overlayBbox = this.svgBboxToOverlayPixels(contentBbox);
    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;

    this.canvasView.zoomToFitRect(
      overlayBbox.x, overlayBbox.y,
      overlayBbox.width, overlayBbox.height,
      vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION
    );

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private cancelActiveMarquees(): void {
    let changed = false;
    if (this.isSelectionMarquee) {
      this.selectionMarquee.cancel();
      changed = true;
    }
    if (this.isZoomMarquee) {
      this.zoomMarquee.cancel();
      changed = true;
    }
    if (changed) this.cdr.detectChanges();
  }

  private selectAllShapesFromDocument(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const items = this.svgManipulation.getLayerStackItems();
    if (items.length === 0) return;
    const shapes: ShapeProperties[] = [];
    for (const item of items) {
      const el = svg.findOne(`#${item.id}`) as SVGElement | undefined;
      if (el) shapes.push(this.svgManipulation.getShapeProperties(el));
    }
    if (shapes.length === 0) return;
    const expanded = this.svgManipulation.expandSelectionByClipGroups(shapes);
    this.shapeSelection.selectShapes(expanded);
    this.svgManipulation.clearHighlight();
  }

  private getExpandedSelectedShapeIds(): string[] {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return [];
    const expanded = this.svgManipulation.expandSelectionByClipGroups(selected);
    const ids = expanded.map((shape) => shape.id);
    return this.svgManipulation.getShapeIdsInDomOrder(ids);
  }

  private copySelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    return true;
  }

  private cutSelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    const cmd = new RemoveShapesCommand(this.svgManipulation, ids, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private pasteFromClipboard(): boolean {
    const payload = this.clipboard.get();
    if (!payload || payload.shapes.length === 0) return false;
    const cmd = new PasteCommand(
      this.svgManipulation,
      payload,
      this.clipboard.nextPasteOffset(),
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private duplicateSelection(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    this.duplicateInvocationCount += 1;
    const delta = this.duplicateInvocationCount * 10;
    const cmd = new DuplicateCommand(
      this.svgManipulation,
      ids,
      { dx: delta, dy: delta },
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private handleAlignmentShortcut(key: string): boolean {
    const normalized = key.length === 1 ? key.toLowerCase() : key;
    switch (normalized) {
      case ALIGN_LEFT_SHORTCUT:
        return this.alignSelection('left');
      case ALIGN_RIGHT_SHORTCUT:
        return this.alignSelection('right');
      case ALIGN_TOP_SHORTCUT:
        return this.alignSelection('top');
      case ALIGN_CENTER_SHORTCUT:
        return this.alignSelection('center');
      case ALIGN_MIDDLE_SHORTCUT:
        return this.alignSelection('middle');
      case ALIGN_BOTTOM_SHORTCUT:
        return this.alignSelection('bottom');
      case DISTRIBUTE_HORIZONTAL_SHORTCUT:
        return this.distributeSelection('horizontal');
      case DISTRIBUTE_VERTICAL_SHORTCUT:
        return this.distributeSelection('vertical');
      default:
        return false;
    }
  }

  private alignSelection(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 2) return false;
    this.editorHistory.pushAndExecute(new AlignCommand(this.svgManipulation, ids, direction));
    this.svgManipulation.clearHighlight();
    return true;
  }

  private distributeSelection(direction: 'horizontal' | 'vertical'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 3) return false;
    this.editorHistory.pushAndExecute(new DistributeCommand(this.svgManipulation, ids, direction));
    this.svgManipulation.clearHighlight();
    return true;
  }

  private groupSelectedShapes(): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    const cmd = new GroupCommand(this.svgManipulation, ids);
    this.editorHistory.pushAndExecute(cmd);
    const newGroupId = this.svgManipulation.getNearestGroupAncestorId(ids[0]);
    if (newGroupId) {
      const svg = this.svgManipulation.getSVGInstance();
      const groupEl = svg?.findOne(`#${newGroupId}`) as SVGElement | undefined;
      if (groupEl) {
        const groupProps = this.svgManipulation.getShapeProperties(groupEl);
        this.shapeSelection.selectShapes([groupProps]);
      }
    }
    this.drilledIntoGroupId = null;
  }

  private ungroupSelectedShape(): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const groupId = selected[0].id;
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const groupNode = svg.findOne(`#${groupId}`)?.node as Element | null;
    if (!groupNode || groupNode.tagName?.toLowerCase() !== 'g') return;
    const childIds: string[] = [];
    for (const child of Array.from(groupNode.children)) {
      if (child.id) childIds.push(child.id);
    }
    const cmd = new UngroupCommand(this.svgManipulation, groupId);
    this.editorHistory.pushAndExecute(cmd);
    const childShapes: ShapeProperties[] = [];
    for (const id of childIds) {
      const el = svg.findOne(`#${id}`) as SVGElement | undefined;
      if (el) childShapes.push(this.svgManipulation.getShapeProperties(el));
    }
    if (childShapes.length > 0) {
      this.shapeSelection.selectShapes(childShapes);
    }
    this.drilledIntoGroupId = null;
  }

  // --- Mouse event orchestration ---
  onDocumentMouseMove(event: MouseEvent): void {
    if (this.isCreatingShape) {
      this.creation.move(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
      return;
    }
    if (this.pathNodeDragSession) {
      this.updatePathNodeDrag(event.clientX, event.clientY);
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pen' && this.isPenSessionActive) {
      if (this.penPendingSegment) {
        this.penPendingLastClient = { x: event.clientX, y: event.clientY };
      }
      const pt = this.getSnappedPenPoint(event.clientX, event.clientY, event.shiftKey, event.altKey);
      if (pt) {
        if (this.penPendingSegment) {
          this.penPendingDragSvg = { x: pt.x, y: pt.y };
          this.penPointerSvg = { x: this.penPendingSegment.startSvg.x, y: this.penPendingSegment.startSvg.y };
        } else {
          this.penPointerSvg = { x: pt.x, y: pt.y };
        }
        this.cdr.markForCheck();
      }
      return;
    }
    if (this.isSelectionMarquee) {
      this.selectionMarquee.move(event.clientX, event.clientY, this.gestureCtx);
      return;
    }
    if (this.isZoomMarquee) {
      this.zoomMarquee.move(event.clientX, event.clientY);
      this.cdr.detectChanges();
      return;
    }
    if (this.isResizingSelection) {
      this.resize.move(this.gestureCtx, event.clientX, event.clientY, event.altKey);
      return;
    }
    if (this.isSkewingSelection) {
      this.skew.move(this.gestureCtx, event.clientX, event.clientY);
      return;
    }
    if (this.isRotatingSelection) {
      this.rotate.move(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
      return;
    }
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape) {
      this.drag.move(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
    }
  }

  onDocumentMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    if (this.pathNodeDragSession) {
      this.finishPathNodeDrag();
      return;
    }

    if (this.editorTool.getCurrentTool() === 'pen' && this.penPendingSegment) {
      this.commitPenPendingSegment(event);
      return;
    }

    if (this.isCreatingShape) {
      this.creation.end(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
      return;
    }

    if (this.isSelectionMarquee) {
      this.selectionMarquee.endAt(event.clientX, event.clientY, event.shiftKey, this.gestureCtx);
      return;
    }
    if (this.isZoomMarquee) {
      this.commitZoomMarquee();
      return;
    }

    this.isPanning = false;

    if (this.isResizingSelection) {
      this.resize.end(this.gestureCtx, event.altKey);
      return;
    }
    if (this.isSkewingSelection) {
      this.skew.end(this.gestureCtx);
      return;
    }
    if (this.isRotatingSelection) {
      this.rotate.end(this.gestureCtx);
      return;
    }
    if (this.isDraggingShape) {
      this.drag.end(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
    }
  }

  private commitZoomMarquee(): void {
    const viewportEl = this.zoomWrapper()?.nativeElement?.closest('.canvas-container') as HTMLElement | undefined;
    if (viewportEl && viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0) {
      this.wrapperWidth = viewportEl.clientWidth;
      this.wrapperHeight = viewportEl.clientHeight;
    }
    const rawRect = this.svgContainer()?.nativeElement?.getBoundingClientRect();
    if (rawRect && this.svgContent() && this.canvasView.isInitialized()) {
      const scale = this.canvasView.scale;
      const marqueeRect = this.zoomMarquee.toSvgRect(rawRect, scale);
      if (marqueeRect && !this.zoomMarquee.isTinyDrag() && marqueeRect.width > 0 && marqueeRect.height > 0 && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
        const { x, y, width, height } = marqueeRect;
        this.canvasView.zoomToFitRect(x, y, width, height, this.wrapperWidth, this.wrapperHeight);
        const wrapperEl = this.zoomWrapper()?.nativeElement;
        if (viewportEl && wrapperEl) {
          const wrapperRect = wrapperEl.getBoundingClientRect();
          const containerRect = viewportEl.getBoundingClientRect();
          this.canvasView.panX += containerRect.left - wrapperRect.left;
          this.canvasView.panY += containerRect.top - wrapperRect.top;
        }
        this.updateViewBoxOverlayRect();
        this.zoomMarquee.finish(true);
      } else {
        this.zoomMarquee.finish(false);
      }
    } else {
      this.zoomMarquee.finish(false);
    }
    this.cdr.detectChanges();
  }

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService,
    public editorTool: EditorToolService,
    public canvasView: CanvasViewService,
    private snap: SnapService,
    private cdr: ChangeDetectorRef,
    private editorHistory: EditorHistoryService,
    private clipboard: ClipboardService
  ) {
    effect(() => {
      const incomingSvgContent = this.svgContent();
      const acceptedSvgContent = this.acceptedSvgContent();
      if (incomingSvgContent === acceptedSvgContent) return;
      if (
        this.editorTool.getCurrentTool() === 'pen' &&
        !this.confirmDiscardPenSessionIfNeeded('document replace/load')
      ) {
        return;
      }
      this.acceptedSvgContent.set(incomingSvgContent);
      this.canvasView.resetZoom();
    });
    effect(() => {
      const currentTool = this.editorTool.currentTool();
      if (this.isRevertingToolChange) {
        this.lastObservedTool = currentTool;
        return;
      }
      const previousTool = this.lastObservedTool;
      this.lastObservedTool = currentTool;
      if (
        previousTool === 'pen' &&
        currentTool !== 'pen' &&
        !this.confirmDiscardPenSessionIfNeeded('tool switch')
      ) {
        this.isRevertingToolChange = true;
        this.editorTool.setTool('pen');
        this.isRevertingToolChange = false;
        this.lastObservedTool = 'pen';
        return;
      }
      if (currentTool !== 'pen') {
        this.clearPenDrawingState();
      }
      if (!this.isSelectorInteractionTool(currentTool)) {
        this.exitPathNodeEditMode();
      }
    });
    effect(() => {
      this.editorHistory.revision();
      this.drilledIntoGroupId = null;
      if (this.pathNodeEditState) {
        const selectedPathIds = this.shapeSelection
          .selectedShapes()
          .map((shape) => shape.id)
          .filter((id) => this.isPathElementId(id));
        if (selectedPathIds.length === 0) {
          this.exitPathNodeEditMode();
        } else {
          this.enterPathNodeEditMode(selectedPathIds, this.pathNodeEditState.activePathId ?? selectedPathIds[0]);
        }
      }
      setTimeout(() => this.syncSelectionFromDom(), 0);
    });
    effect(() => {
      this.snap.setGridEnabled(this.editorTool.isGridSnapEnabled());
      this.snap.setShapeEnabled(this.editorTool.isShapeSnapEnabled());
    });
    effect(() => {
      const shapes = this.shapeSelection.selectedShapes();
      const duplicateKey = shapes.map((shape) => shape.id).sort().join('|');
      if (duplicateKey !== this.duplicateSelectionKey) {
        this.duplicateSelectionKey = duplicateKey;
        this.duplicateInvocationCount = 0;
      }
      if (
        this.pathNodeEditState &&
        !shapes.some((shape) => this.pathNodeEditState?.paths.some((state) => state.pathId === shape.id))
      ) {
        this.exitPathNodeEditMode();
      }
      setTimeout(() => {
        if (shapes.length === 0) {
          this.lastBbox = null;
          this._highlightRectCache = null;
          this._highlightRectCacheKey = '';
        } else {
          this.syncOverlayViewBox();
          const ids = shapes.map((s) => s.id);
          const unionBbox = this.svgManipulation.getUnionBBox(ids);
          this.lastBbox = unionBbox;
          if (unionBbox) {
            this._highlightRectCacheKey = '';
          } else {
            this._highlightRectCache = null;
            this._highlightRectCacheKey = '';
          }
        }
        this.cdr.markForCheck();
      }, 0);
    });
    effect(() => {
      const currentTool = this.editorTool.currentTool();
      const shapes = this.shapeSelection.selectedShapes();
      if (!this.isNodeEditSelectorTool(currentTool)) return;
      const pathIds = shapes
        .map((shape) => shape.id)
        .filter((id) => this.isPathElementId(id));
      if (pathIds.length === 0) {
        this.exitPathNodeEditMode();
        return;
      }
      const activePathId = this.pathNodeEditState?.activePathId;
      const shouldRefresh =
        !this.pathNodeEditState ||
        pathIds.length !== this.pathNodeEditState.paths.length ||
        pathIds.some((id) => !this.pathNodeEditState?.paths.some((state) => state.pathId === id));
      if (shouldRefresh) {
        this.enterPathNodeEditMode(pathIds, activePathId ?? pathIds[0]);
      }
    });
    effect(() => {
      const acceptedSvgContent = this.acceptedSvgContent();
      if (acceptedSvgContent && this.svgContainer()?.nativeElement) {
        setTimeout(() => this.initializeSVG(acceptedSvgContent), 0);
      }
    });
  }

  private boundOnWheel = this.onWheel.bind(this);

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.clearPenFinishFeedback();
    this.clearPathNodeEditFeedback();
    const el = this.canvasViewport()?.nativeElement;
    if (el) {
      el.removeEventListener('wheel', this.boundOnWheel);
    }
  }

  ngAfterViewInit(): void {
    const el = this.canvasViewport()?.nativeElement;
    if (el) {
      el.addEventListener('wheel', this.boundOnWheel, { passive: false });
    }
    const acceptedSvgContent = this.acceptedSvgContent();
    if (acceptedSvgContent) {
      this.initializeSVG(acceptedSvgContent);
    }
  }

  private onWheel(event: WheelEvent): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) return;

    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = this.svgContainer()!.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (!point) return;
      const factor = Math.pow(1.002, -event.deltaY);
      this.canvasView.zoomByAt(factor, point.x, point.y);
    } else if (event.shiftKey) {
      const dx = event.deltaX || event.deltaY;
      this.canvasView.panBy(-dx, 0);
    } else {
      this.canvasView.panBy(-event.deltaX, -event.deltaY);
    }

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private syncOverlayViewBox(): void {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      this._viewBoxOverlayRect = null;
      return;
    }
    const vb = mainSvg.getAttribute('viewBox');
    if (vb) {
      this.overlayViewBox = vb;
    } else {
      const w = mainSvg.getAttribute('width') || mainSvg.clientWidth || 100;
      const h = mainSvg.getAttribute('height') || mainSvg.clientHeight || 100;
      const width = typeof w === 'string' && w.endsWith('%') ? 100 : Number(w) || 100;
      const height = typeof h === 'string' && h.endsWith('%') ? 100 : Number(h) || 100;
      this.overlayViewBox = `0 0 ${width} ${height}`;
    }
    const el = this.zoomWrapper()?.nativeElement;
    const viewportRef = this.canvasViewport()?.nativeElement;
    const viewportEl =
      (this.svgContent() && viewportRef && viewportRef.clientWidth > 0 && viewportRef.clientHeight > 0
        ? viewportRef
        : el?.closest('.canvas-container')) as HTMLElement | undefined;
    if (viewportEl && viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0) {
      this.wrapperWidth = viewportEl.clientWidth;
      this.wrapperHeight = viewportEl.clientHeight;
      if (this.svgContent() && el?.parentElement) {
        const viewportRect = viewportEl.getBoundingClientRect();
        const innerRect = el.parentElement.getBoundingClientRect();
        this.rulerOriginOffsetX = innerRect.left - viewportRect.left;
        this.rulerOriginOffsetY = innerRect.top - viewportRect.top;
      } else {
        this.rulerOriginOffsetX = 0;
        this.rulerOriginOffsetY = 0;
      }
    } else if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      this.wrapperWidth = el.offsetWidth;
      this.wrapperHeight = el.offsetHeight;
      this.rulerOriginOffsetX = 0;
      this.rulerOriginOffsetY = 0;
    }
    if (this.svgManipulation.getSVGInstance() && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
      const vb = this.svgManipulation.getDocumentViewBox();
      const parts = vb.split(/\s+/);
      if (parts.length >= 4) {
        const x = Number(parts[0]) || 0;
        const y = Number(parts[1]) || 0;
        const w = Number(parts[2]) || 100;
        const h = Number(parts[3]) || 100;
        const bbox = { x, y, width: w, height: h };
        setTimeout(() => {
          this._viewBoxOverlayRect = this.svgBboxToOverlayPixels(bbox);
          this.cdr.markForCheck();
        }, 0);
        return;
      }
    }
    this._viewBoxOverlayRect = null;
  }

  private updateViewBoxOverlayRect(): void {
    this.syncOverlayViewBox();
  }

  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const parts = this.overlayViewBox.split(/\s+/);
    const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
    const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
    const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
    const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
    const canvasScale = this.canvasView.scale;
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      const sx = (this.wrapperWidth * canvasScale) / vbW;
      const sy = (this.wrapperHeight * canvasScale) / vbH;
      return { x: (bbox.x - vbMinX) * sx, y: (bbox.y - vbMinY) * sy, width: bbox.width * sx, height: bbox.height * sy };
    }
    const wrapperRect = this.zoomWrapper()?.nativeElement?.getBoundingClientRect();
    const svgRect = mainSvg.getBoundingClientRect();
    let viewportW = svgRect.width;
    let viewportH = svgRect.height;
    let svgLeftInWrapper = 0;
    let svgTopInWrapper = 0;
    const usingVisualRects = Boolean(wrapperRect && viewportW > 0 && viewportH > 0);
    if (!usingVisualRects) {
      viewportW = this.wrapperWidth;
      viewportH = this.wrapperHeight;
    } else {
      svgLeftInWrapper = svgRect.left - wrapperRect!.left;
      svgTopInWrapper = svgRect.top - wrapperRect!.top;
    }
    const par = mainSvg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
    const isNone = par.split(/\s+/)[0] === 'none';
    let scaleFit: number;
    let offsetX: number;
    let offsetY: number;
    if (isNone) {
      const sx = (viewportW * (usingVisualRects ? 1 : canvasScale)) / vbW;
      const sy = (viewportH * (usingVisualRects ? 1 : canvasScale)) / vbH;
      const px = svgLeftInWrapper + (bbox.x - vbMinX) * (viewportW / vbW);
      const py = svgTopInWrapper + (bbox.y - vbMinY) * (viewportH / vbH);
      return { x: usingVisualRects ? px : px * canvasScale, y: usingVisualRects ? py : py * canvasScale, width: bbox.width * sx, height: bbox.height * sy };
    }
    scaleFit = Math.min(viewportW / vbW, viewportH / vbH);
    const align = par.split(/\s+/)[0].toLowerCase();
    const contentW = scaleFit * vbW;
    const contentH = scaleFit * vbH;
    if (align.includes('xmin')) offsetX = 0;
    else if (align.includes('xmid')) offsetX = (viewportW - contentW) / 2;
    else offsetX = viewportW - contentW;
    if (align.includes('ymin')) offsetY = 0;
    else if (align.includes('ymid')) offsetY = (viewportH - contentH) / 2;
    else offsetY = viewportH - contentH;
    const viewportX = offsetX + (bbox.x - vbMinX) * scaleFit;
    const viewportY = offsetY + (bbox.y - vbMinY) * scaleFit;
    if (usingVisualRects) {
      return { x: svgLeftInWrapper + viewportX, y: svgTopInWrapper + viewportY, width: bbox.width * scaleFit, height: bbox.height * scaleFit };
    }
    const x = (svgLeftInWrapper + viewportX) * canvasScale;
    const y = (svgTopInWrapper + viewportY) * canvasScale;
    const w = bbox.width * scaleFit * canvasScale;
    const h = bbox.height * scaleFit * canvasScale;
    return { x, y, width: w, height: h };
  }

  private parseOverlayViewBox(): { vbMinX: number; vbMinY: number; vbW: number; vbH: number } | null {
    const parts = this.overlayViewBox.split(/\s+/);
    if (parts.length < 4) return null;
    return {
      vbMinX: Number(parts[0]) || 0,
      vbMinY: Number(parts[1]) || 0,
      vbW: Number(parts[2]) || 100,
      vbH: Number(parts[3]) || 100
    };
  }

  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return null;
    const fromCtm = screenPointToRootSvgUserPoint(mainSvg, clientX, clientY);
    if (fromCtm) return fromCtm;
    const vb = this.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return null;
    const { vbMinX, vbMinY, vbW, vbH } = vb;
    return {
      x: vbMinX + ((clientX - r.left) / r.width) * vbW,
      y: vbMinY + ((clientY - r.top) / r.height) * vbH
    };
  }

  private syncSelectionFromDom(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return;
    const refreshed = selected.map((s) => {
      const el = svg.findOne(`#${s.id}`) as SVGElement | undefined;
      return el ? this.svgManipulation.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(refreshed);
    const ids = refreshed.map((s) => s.id);
    const unionBbox = this.svgManipulation.getUnionBBox(ids);
    if (unionBbox) {
      this.lastBbox = unionBbox;
      this._highlightRectCacheKey = '';
    }
    this.cdr.detectChanges();
  }

  private initializeSVG(svgContent: string): void {
    this.editorHistory.clear();
    this.selectionMarquee.cancel();
    this.zoomMarquee.cancel();
    this.exitPathNodeEditMode();
    this.svgManipulation.initializeSVG(this.svgContainer()!.nativeElement, svgContent);
    this.canvasView.init();
    this.syncOverlayViewBox();
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length > 0) {
      const ids = shapes.map((s) => s.id);
      this.lastBbox = this.svgManipulation.getUnionBBox(ids);
    } else {
      this.lastBbox = null;
    }
    this._highlightRectCacheKey = '';
    if (svgContent.includes('svg-editor-test-icon')) {
      queueMicrotask(() => this.applyInitialFitToViewport());
    }
  }

  private applyInitialFitToViewport(attempt = 0): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) {
      return;
    }
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this.syncOverlayViewBox();
    }
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      return;
    }
    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    if (vw <= 0 || vh <= 0) {
      if (attempt < 4) {
        requestAnimationFrame(() => this.applyInitialFitToViewport(attempt + 1));
      }
      return;
    }

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) {
      return;
    }

    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(
      0,
      0,
      svgWpx,
      svgHpx,
      vw,
      vh,
      64,
      INITIAL_LOAD_VIEWPORT_FIT_FRACTION
    );

    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.cdr.markForCheck();
    setTimeout(() => {
      this.updateViewBoxOverlayRect();
      this.cdr.markForCheck();
    }, 0);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pen' && event.button === 2) {
      if (this.isPenSessionActive) {
        this.tryFinishPenPath(false);
      }
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (this.editorTool.getCurrentTool() === 'zoom') {
      this.zoomMarquee.startAt(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pan') {
      this.isPanning = true;
      this.panStartClientX = event.clientX;
      this.panStartClientY = event.clientY;
      this.panStartX = this.canvasView.panX;
      this.panStartY = this.canvasView.panY;
      event.preventDefault();
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pen') {
      if (!this.svgContent() || !this.canvasView.isInitialized()) return;
      const penTarget = event.target as Element | null;
      if (penTarget && this.isEditorContentShapeTarget(penTarget)) {
        if (
          this.penSession.getSegments().length === 0 &&
          !this.penPendingSegment &&
          this.tryPenInsertNodeOnPath(penTarget, event)
        ) {
          event.preventDefault();
          return;
        }
        return;
      }
      const pt = this.getSnappedPenPoint(event.clientX, event.clientY, event.shiftKey, event.altKey);
      if (!pt) return;
      this.handlePenCanvasMouseDown(event, pt);
      event.preventDefault();
      return;
    }
    if (this.editorTool.isCreationTool()) {
      if (!this.svgContent() || !this.canvasView.isInitialized()) return;
      if (this.creation.start(this.gestureCtx, this.editorTool.getCurrentTool(), event)) {
        event.preventDefault();
      }
      return;
    }
    if (!this.isSelectorInteractionTool(this.editorTool.getCurrentTool()) || !this.svgContent() || !this.canvasView.isInitialized()) return;
    const target = event.target as Element;

    if (this.pathNodeEditState && this.tryStartPathNodeDrag(target, event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Resize handle
    const resizeEl = target.closest?.('[data-resize-handle]');
    if (resizeEl) {
      const corner = resizeEl.getAttribute('data-resize-handle') as ResizeCorner | null;
      if (corner && (corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se')) {
        if (this.resize.start(this.gestureCtx, corner, event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    const skewEl = target.closest?.('[data-skew-handle]');
    if (skewEl) {
      const edge = skewEl.getAttribute('data-skew-handle') as SkewEdge | null;
      if (edge === 'n' || edge === 's' || edge === 'e' || edge === 'w') {
        if (this.skew.start(this.gestureCtx, edge, event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    // Rotate handle
    const rotateEl = target.closest?.('[data-rotate-handle]');
    if (rotateEl) {
      if (this.rotate.start(this.gestureCtx, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    // Selection marquee (click on empty space)
    if (!this.isEditorContentShapeTarget(target)) {
      this.selectionMarquee.startAt(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }

    // Shape drag
    if (target.tagName === 'svg' || !target.id) return;
    let effectiveDragId = target.id;
    if (!this.shapeSelection.isShapeSelected(target.id)) {
      const nearestGroupId = this.svgManipulation.getNearestGroupAncestorId(target.id);
      if (nearestGroupId && this.shapeSelection.isShapeSelected(nearestGroupId)) {
        effectiveDragId = nearestGroupId;
      } else {
        return;
      }
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    const selectedIds = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (this.drag.start(this.gestureCtx, selectedIds, effectiveDragId, point, event)) {
      event.preventDefault();
    }
  }

  onCanvasClick(event: MouseEvent): void {
    const clickTarget = event.target as Element;
    if (this.inlineTextEditState && !this.isInlineTextEditTarget(clickTarget)) {
      this.commitInlineTextEditIfActive();
    }
    if (this.pathNodeDragJustEnded) {
      this.pathNodeDragJustEnded = false;
      return;
    }
    if (this.drag.consumeJustEnded()) return;
    if (this.resize.consumeJustEnded()) return;
    if (this.skew.consumeJustEnded()) return;
    if (this.rotate.consumeJustEnded()) return;
    if (this.creation.consumeJustEnded()) return;
    if (this.pathNodeEditState && !this.isPathNodeEditTarget(clickTarget)) {
      this.exitPathNodeEditMode();
    }
    if (this.editorTool.getCurrentTool() === 'pan') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pen') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'text') {
      this.createTextAtPoint(event.clientX, event.clientY);
      return;
    }
    if (this.editorTool.isCreationTool()) {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'zoom') {
      if (this.zoomMarquee.consumeJustEnded()) {
        return;
      }
      if (!this.svgContent() || !this.canvasView.isInitialized()) return;
      const rect = this.svgContainer()!.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (point) {
        if (event.altKey) {
          this.canvasView.zoomOutAt(point.x, point.y);
        } else {
          this.canvasView.zoomInAt(point.x, point.y);
        }
        setTimeout(() => {
          this.updateViewBoxOverlayRect();
          this.cdr.detectChanges();
        }, 0);
      }
      return;
    }

    if (this.selectionMarquee.consumeJustEnded()) {
      return;
    }

    const svgInstance = this.svgManipulation.getSVGInstance();
    const svgElement =
      clickTarget.id && (svgInstance?.findOne(`#${clickTarget.id}`) as SVGElement);
    if (svgElement) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const nearestGroupId = this.svgManipulation.getNearestGroupAncestorId(clickTarget.id);
      const groupIsClipCarrier = nearestGroupId ? this.isGroupAClipMaskCarrier(nearestGroupId) : false;

      if (nearestGroupId && !groupIsClipCarrier) {
        if (this.drilledIntoGroupId === nearestGroupId) {
          const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(svgElement);
          if (additive) {
            this.shapeSelection.toggleShapeGroupInSelection(expanded);
          } else {
            this.shapeSelection.selectShapes(expanded);
          }
        } else {
          const groupEl = svgInstance?.findOne(`#${nearestGroupId}`) as SVGElement | undefined;
          if (groupEl) {
            const groupProps = this.svgManipulation.getShapeProperties(groupEl);
            if (additive) {
              this.shapeSelection.toggleShapeGroupInSelection([groupProps]);
            } else {
              this.shapeSelection.selectShapes([groupProps]);
            }
            this.drilledIntoGroupId = null;
          }
        }
      } else {
        const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(svgElement);
        if (additive) {
          this.shapeSelection.toggleShapeGroupInSelection(expanded);
        } else {
          this.shapeSelection.selectShapes(expanded);
        }
      }
    } else {
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
      this.drilledIntoGroupId = null;
    }
  }

  private createTextAtPoint(clientX: number, clientY: number): void {
    if (!this.svgContent()) return;
    const point = this.clientToEditorSvgPoint(clientX, clientY) ?? { x: clientX, y: clientY };
    const newId = this.svgManipulation.addShape('text', {
      x: point.x,
      y: point.y,
      textContent: 'Text'
    });
    if (!newId) return;

    const svgInstance = this.svgManipulation.getSVGInstance();
    const el = svgInstance?.findOne(`#${newId}`) as SVGElement | undefined;
    if (el) {
      this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    }
    const cmd = new AddShapeCommand(this.svgManipulation, newId, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    const shapeBbox = this.svgManipulation.getShapeBBox(newId);
    if (shapeBbox) {
      this.lastBbox = shapeBbox;
      this._highlightRectCacheKey = '';
    }
    this.editorTool.setTool('selector');
    this.openTextEditPrompt(newId);
    this.cdr.markForCheck();
  }

  /**
   * Minimal edit path for newly created text until a dedicated inline editor lands.
   */
  private openTextEditPrompt(shapeId: string): void {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    const shape = svgInstance?.findOne(`#${shapeId}`) as SVGElement | undefined;
    const node = shape?.node as SVGTextElement | undefined;
    if (!node || node.tagName.toLowerCase() !== 'text') return;
    const currentText = node.textContent ?? 'Text';
    const nextText = window.prompt('Edit text', currentText);
    if (nextText === null || nextText === currentText) return;
    this.svgManipulation.updateTextContent(shapeId, nextText);
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pen') return;
    if (this.editorTool.getCurrentTool() !== 'selector') return;
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const selectedId = selected[0].id;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const selectedEl = svgInstance.findOne(`#${selectedId}`)?.node as Element | null;
    if (!selectedEl) return;

    const selectedTag = selectedEl.tagName?.toLowerCase();
    if (selectedTag === 'text' || selectedTag === 'tspan') {
      const resolvedTextId =
        selectedTag === 'text'
          ? selectedId
          : (selectedEl.closest('text') as Element | null)?.id ?? null;
      if (!resolvedTextId) return;
      this.enterInlineTextEditMode(resolvedTextId);
      return;
    }
    if (selectedTag !== 'g') return;

    this.drilledIntoGroupId = selectedId;

    const clickTarget = event.target as Element;
    if (clickTarget.id) {
      const childEl = svgInstance.findOne(`#${clickTarget.id}`) as SVGElement | undefined;
      if (childEl) {
        const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(childEl);
        this.shapeSelection.selectShapes(expanded);
      }
    }
  }

  onInlineTextEditInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.inlineTextEditDraft = target?.value ?? '';
  }

  private enterInlineTextEditMode(textId: string): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const text = this.svgManipulation.getTextContent(textId);
    if (text === null) return;
    this.inlineTextEditState = {
      textId,
      originalText: text
    };
    this.inlineTextEditDraft = text;
    this.cdr.markForCheck();
    setTimeout(() => {
      const input = this.inlineTextEditor()?.nativeElement;
      if (!input) return;
      input.focus();
      input.select();
    }, 0);
  }

  private commitInlineTextEditIfActive(): boolean {
    if (!this.inlineTextEditState) return false;
    const { textId, originalText } = this.inlineTextEditState;
    const nextText = this.inlineTextEditDraft;
    if (nextText !== originalText) {
      const cmd = new TextContentCommand(this.svgManipulation, textId, originalText, nextText);
      this.editorHistory.pushAndExecute(cmd);
    }
    this.inlineTextEditState = null;
    this.inlineTextEditDraft = '';
    this.cdr.markForCheck();
    return true;
  }

  private isInlineTextEditTarget(target: Element | null): boolean {
    if (!target) return false;
    const editor = this.inlineTextEditor()?.nativeElement;
    return !!editor && (target === editor || editor.contains(target));
  }

  private confirmDiscardPenSessionIfNeeded(reason: 'tool switch' | 'document replace/load'): boolean {
    if (!this.isPenSessionActive) return true;
    const shouldDiscard = window.confirm(
      `Discard the current in-progress pen path before ${reason}?`
    );
    if (!shouldDiscard) return false;
    this.clearPenDrawingState();
    return true;
  }

  private clearPenDrawingState(): void {
    const hadPenState =
      this.isPenSessionActive ||
      this.penPointerSvg !== null ||
      this.penPendingSegment !== null ||
      this.penPendingDragSvg !== null;
    const hadFeedback = this.penFinishFeedbackMessage !== null;
    if (!hadPenState && !hadFeedback) return;
    if (hadPenState) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.penSession.reset();
      this.penPointerSvg = null;
    }
    if (hadFeedback) {
      this.clearPenFinishFeedback();
    } else {
      this.cdr.markForCheck();
    }
  }

  private showPenFinishFeedback(): void {
    this.penFinishFeedbackMessage = 'Add at least 2 points before finishing.';
    if (this.penFinishFeedbackTimer) {
      clearTimeout(this.penFinishFeedbackTimer);
    }
    this.penFinishFeedbackTimer = setTimeout(() => {
      this.penFinishFeedbackMessage = null;
      this.penFinishFeedbackTimer = null;
      this.cdr.markForCheck();
    }, PEN_FINISH_FEEDBACK_DURATION_MS);
    this.cdr.markForCheck();
  }

  private clearPenFinishFeedback(): void {
    if (this.penFinishFeedbackTimer) {
      clearTimeout(this.penFinishFeedbackTimer);
      this.penFinishFeedbackTimer = null;
    }
    if (this.penFinishFeedbackMessage === null) return;
    this.penFinishFeedbackMessage = null;
    this.cdr.markForCheck();
  }

  private showPathNodeEditFeedback(message: string): void {
    this.pathNodeEditFeedbackMessage = message;
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
    }
    this.pathNodeEditFeedbackTimer = setTimeout(() => {
      this.pathNodeEditFeedbackMessage = null;
      this.pathNodeEditFeedbackTimer = null;
      this.cdr.markForCheck();
    }, PATH_NODE_EDIT_FEEDBACK_DURATION_MS);
    this.cdr.markForCheck();
  }

  private clearPathNodeEditFeedback(): void {
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
      this.pathNodeEditFeedbackTimer = null;
    }
    if (this.pathNodeEditFeedbackMessage === null) return;
    this.pathNodeEditFeedbackMessage = null;
    this.cdr.markForCheck();
  }

  private commitPenPendingSegment(event: MouseEvent): void {
    if (!this.penPendingSegment) return;
    const { anchor, startClient, startSvg } = this.penPendingSegment;
    const end = startSvg;
    if (penSvgDistanceSq(anchor, end) < 1e-12) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      this.cdr.markForCheck();
      return;
    }
    const releaseSvg = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    const dragCurrent = releaseSvg ?? this.penPendingDragSvg ?? startSvg;
    const screenDist = Math.hypot(event.clientX - startClient.x, event.clientY - startClient.y);
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      this.penSession.addLinePoint(end.x, end.y);
    } else {
      const c = dragBendCubicControlPoints(anchor, end, startSvg, dragCurrent);
      this.penSession.appendCubic(c.x1, c.y1, c.x2, c.y2, end.x, end.y);
    }
    this.penPendingSegment = null;
    this.penPendingLastClient = null;
    this.penPendingDragSvg = null;
    this.penPointerSvg = { x: end.x, y: end.y };
    this.cdr.markForCheck();
  }

  /** Commit open drag as L/C using last pointer + last client motion (Enter / finish). */
  private flushPenPendingAsCurrentPointer(): void {
    if (!this.penPendingSegment || !this.penPointerSvg) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      return;
    }
    const { anchor, startClient, startSvg } = this.penPendingSegment;
    const end = startSvg;
    if (penSvgDistanceSq(anchor, end) < 1e-12) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      return;
    }
    const lc = this.penPendingLastClient ?? startClient;
    const screenDist = Math.hypot(lc.x - startClient.x, lc.y - startClient.y);
    if (screenDist < MARQUEE_MIN_DRAG_PX) {
      this.penSession.addLinePoint(end.x, end.y);
    } else {
      const dragCurrent = this.penPendingDragSvg ?? startSvg;
      const c = dragBendCubicControlPoints(anchor, end, startSvg, dragCurrent);
      this.penSession.appendCubic(c.x1, c.y1, c.x2, c.y2, end.x, end.y);
    }
    this.penPendingSegment = null;
    this.penPendingLastClient = null;
    this.penPendingDragSvg = null;
    this.penPointerSvg = { x: end.x, y: end.y };
    this.cdr.markForCheck();
  }

  private tryFinishPenPath(closePath: boolean): void {
    this.flushPenPendingAsCurrentPointer();
    const d = this.penSession.finishPath();
    if (!d) {
      this.showPenFinishFeedback();
      return;
    }
    this.clearPenFinishFeedback();
    const finalD = closePath ? `${d} Z` : d;
    const id = this.svgManipulation.insertPathIntoContentGroup(finalD);
    if (!id) {
      this.clearPenDrawingState();
      return;
    }
    const svg = this.svgManipulation.getSVGInstance();
    const el = svg?.findOne(`#${id}`) as SVGElement | undefined;
    if (el) {
      this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    }
    const cmd = new AddPathCommand(this.svgManipulation, id, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    const shapeBbox = this.svgManipulation.getShapeBBox(id);
    if (shapeBbox) {
      this.lastBbox = shapeBbox;
      this._highlightRectCacheKey = '';
    }
    this.clearPenDrawingState();
    this.editorTool.setTool('selector');
    this.cdr.markForCheck();
  }

  private handlePenCanvasMouseDown(event: MouseEvent, pt: { x: number; y: number }): void {
    if (event.detail >= 2) {
      this.penPendingSegment = null;
      this.penPendingLastClient = null;
      this.penPendingDragSvg = null;
      if (this.penSession.getSegments().length === 0) {
        this.penSession.beginPath(pt.x, pt.y);
        this.penPointerSvg = { x: pt.x, y: pt.y };
        this.cdr.markForCheck();
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
      this.penSession.beginPath(pt.x, pt.y);
      this.penPointerSvg = { x: pt.x, y: pt.y };
      this.cdr.markForCheck();
      return;
    }
    const anchor = lastCommittedVertex(segs);
    if (!anchor) return;
    this.penPendingSegment = {
      anchor: { x: anchor.x, y: anchor.y },
      startClient: { x: event.clientX, y: event.clientY },
      startSvg: { x: pt.x, y: pt.y }
    };
    this.penPendingLastClient = { x: event.clientX, y: event.clientY };
    this.penPendingDragSvg = { x: pt.x, y: pt.y };
    this.penPointerSvg = { x: pt.x, y: pt.y };
    this.cdr.markForCheck();
  }

  /**
   * Pen anchor placement snapping:
   * - Shift/Alt preserve modifier precedence and bypass snapping.
   * - Grid snap applies first.
   * - Smart-guide snap refines the grid-snapped point when shape snap is enabled.
   */
  private getSnappedPenPoint(
    clientX: number,
    clientY: number,
    shiftKey: boolean,
    altKey: boolean
  ): { x: number; y: number } | null {
    const raw = this.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return null;
    if (shiftKey || altKey) return raw;

    const gridSnapped = this.snap.snapToGrid(raw);
    if (!this.snap.shapeEnabled()) return gridSnapped;

    const guideResult = this.snap.snapDeltaToSmartGuides(
      { x: gridSnapped.x, y: gridSnapped.y, width: 0, height: 0 },
      { x: 0, y: 0 },
      this.getSmartGuideCandidates()
    );
    return {
      x: gridSnapped.x + guideResult.delta.x,
      y: gridSnapped.y + guideResult.delta.y
    };
  }

  private enterPathNodeEditMode(pathIds: string[], preferredPathId?: string): void {
    const states: PathNodeEditPathState[] = [];
    let lastReason: string | null = null;
    for (const pathId of pathIds) {
      const build = this.buildPathNodeEditState(pathId);
      if (build.state) {
        states.push(build.state);
      } else if (build.reason) {
        lastReason = build.reason;
      }
    }
    if (states.length === 0) {
      this.pathNodeEditState = null;
      this.selectedPathNode = null;
      this.pathNodeDragSession = null;
      this.pathNodeDragJustEnded = false;
      if (lastReason) {
        this.showPathNodeEditFeedback(lastReason);
      } else {
        this.clearPathNodeEditFeedback();
      }
      this.cdr.markForCheck();
      return;
    }
    const activePathId = states.some((state) => state.pathId === preferredPathId)
      ? (preferredPathId as string)
      : states[0].pathId;
    this.pathNodeEditState = { paths: states, activePathId };
    this.selectedPathNode = null;
    this.drilledIntoGroupId = null;
    this.clearPathNodeEditFeedback();
    this.cdr.markForCheck();
  }

  private exitPathNodeEditMode(): boolean {
    if (!this.pathNodeEditState) return false;
    this.pathNodeEditState = null;
    this.selectedPathNode = null;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = false;
    this.clearPathNodeEditFeedback();
    this.cdr.markForCheck();
    return true;
  }

  private isPathNodeEditTarget(target: Element): boolean {
    if (!this.pathNodeEditState) return false;
    const activePathIds = new Set(this.pathNodeEditState.paths.map((state) => state.pathId));
    if (target.id && activePathIds.has(target.id)) return true;
    if (typeof target.closest !== 'function') return false;
    return !!target.closest('[data-path-node-edit-target]');
  }

  private tryStartPathNodeDrag(target: Element, event: MouseEvent): boolean {
    if (!this.pathNodeEditState) return false;
    if (typeof target.closest !== 'function') return false;
    const anchorEl = target.closest('[data-path-node-anchor-index]') as Element | null;
    const handleEl = target.closest('[data-path-node-handle-index]') as Element | null;
    if (!anchorEl && !handleEl) return false;
    const rawPathId = (anchorEl ?? handleEl)?.getAttribute('data-path-node-path-id');
    if (!rawPathId) return false;
    const targetPathState = this.pathNodeEditState.paths.find((state) => state.pathId === rawPathId);
    if (!targetPathState) return false;

    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const pathEl = svg.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;

    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    if (anchorEl) {
      const index = Number(anchorEl.getAttribute('data-path-node-anchor-index'));
      if (!Number.isFinite(index) || index < 0 || index >= targetPathState.anchors.length) return false;
      this.selectedPathNode = {
        pathId: targetPathState.pathId,
        moveSegmentIndex: targetPathState.anchors[index].moveSegmentIndex
      };
      this.pathNodeEditState.activePathId = targetPathState.pathId;
      this.pathNodeDragSession = {
        pathId: targetPathState.pathId,
        oldD,
        segments: parsed.map((segment) => ({ ...segment })),
        target: { kind: 'anchor', index }
      };
      this.pathNodeDragJustEnded = false;
      this.updatePathNodeDrag(event.clientX, event.clientY);
      return true;
    }

    const index = Number(handleEl?.getAttribute('data-path-node-handle-index'));
    if (!Number.isFinite(index) || index < 0 || index >= targetPathState.controlHandles.length) return false;
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    this.pathNodeDragSession = {
      pathId: targetPathState.pathId,
      oldD,
      segments: parsed.map((segment) => ({ ...segment })),
      target: { kind: 'control', index }
    };
    this.pathNodeDragJustEnded = false;
    this.updatePathNodeDrag(event.clientX, event.clientY);
    return true;
  }

  private tryDeleteSelectedPathNode(): boolean {
    if (!this.pathNodeEditState) return false;
    if (this.selectedPathNode === null) {
      this.showPathNodeEditFeedback('Select a node before deleting.');
      return true;
    }
    const targetPathState = this.pathNodeEditState.paths.find(
      (state) => state.pathId === this.selectedPathNode?.pathId
    );
    if (!targetPathState) return false;

    const selectedAnchorIndex = targetPathState.anchors.findIndex(
      (anchor) => anchor.moveSegmentIndex === this.selectedPathNode?.moveSegmentIndex
    );
    if (selectedAnchorIndex < 0) return false;

    const uniqueMoveSegments = new Set(targetPathState.anchors.map((anchor) => anchor.moveSegmentIndex));
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    const isClosedPath = parsed.some((segment) => segment.type === 'Z');
    const minimumNodeCount = isClosedPath ? 3 : 2;
    if (uniqueMoveSegments.size <= minimumNodeCount) {
      this.showPathNodeEditFeedback(
        isClosedPath ? 'Closed paths need at least 3 nodes.' : 'Paths need at least 2 nodes.'
      );
      return true;
    }

    const nextSegments = this.removePathAnchorByMoveSegmentIndex(
      parsed,
      this.selectedPathNode.moveSegmentIndex
    );
    if (!nextSegments) {
      this.showPathNodeEditFeedback('Unable to delete that node.');
      return true;
    }

    const newD = pathSegmentsToD(nextSegments);
    if (newD === oldD) return true;

    pathEl.setAttribute('d', newD);
    const cmd = new EditPathNodesCommand(this.svgManipulation, targetPathState.pathId, oldD, newD, true);
    this.editorHistory.pushAndExecute(cmd);

    const refreshed = this.buildPathNodeEditState(targetPathState.pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === targetPathState.pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    const fallbackAnchor = refreshed.state.anchors[Math.max(0, selectedAnchorIndex - 1)];
    this.selectedPathNode = fallbackAnchor
      ? { pathId: targetPathState.pathId, moveSegmentIndex: fallbackAnchor.moveSegmentIndex }
      : null;
    this.clearPathNodeEditFeedback();
    this.cdr.markForCheck();
    return true;
  }

  private removePathAnchorByMoveSegmentIndex(
    segments: readonly PathSegment[],
    moveSegmentIndex: number
  ): PathSegment[] | null {
    const nextSegments = segments.map((segment) => ({ ...segment }));
    if (moveSegmentIndex < 0 || moveSegmentIndex >= nextSegments.length) return null;
    const target = nextSegments[moveSegmentIndex];
    if (!target || target.type === 'Z') return null;

    if (target.type === 'M') {
      let replacementIndex = moveSegmentIndex + 1;
      while (replacementIndex < nextSegments.length && nextSegments[replacementIndex].type === 'Z') {
        replacementIndex++;
      }
      if (replacementIndex >= nextSegments.length) return null;
      const replacement = nextSegments[replacementIndex];
      if (replacement.type === 'Z') return null;
      nextSegments[replacementIndex] = {
        type: 'M',
        x: replacement.x,
        y: replacement.y
      };
      nextSegments.splice(moveSegmentIndex, 1);
      return nextSegments;
    }

    nextSegments.splice(moveSegmentIndex, 1);
    return nextSegments;
  }

  private updatePathNodeDrag(clientX: number, clientY: number): void {
    if (!this.pathNodeDragSession || !this.pathNodeEditState) return;
    const point = this.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;

    const nextSegments = this.pathNodeDragSession.segments.map((segment) => ({ ...segment }));
    if (this.pathNodeDragSession.target.kind === 'anchor') {
      this.applyAnchorDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    } else {
      this.applyControlDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    }

    const nextD = pathSegmentsToD(nextSegments);
    if (!this.isValidNodeEditSerializedPath(nextD)) {
      this.showPathNodeEditFeedback('Unable to apply node move for this path.');
      return;
    }
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${this.pathNodeDragSession.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return;
    pathEl.setAttribute('d', nextD);

    this.pathNodeDragSession.segments = nextSegments;
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === this.pathNodeDragSession?.pathId
        ? {
            pathId: state.pathId,
            anchors: this.collectPathNodeAnchors(nextSegments),
            controlHandles: this.collectPathControlHandles(nextSegments)
          }
        : state
    );
    this.pathNodeEditState.activePathId = this.pathNodeDragSession.pathId;
    this.cdr.markForCheck();
  }

  private finishPathNodeDrag(): void {
    const drag = this.pathNodeDragSession;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = true;
    if (!drag) return;

    const newD = pathSegmentsToD(drag.segments);
    if (newD !== drag.oldD) {
      const cmd = new EditPathNodesCommand(
        this.svgManipulation,
        drag.pathId,
        drag.oldD,
        newD,
        true
      );
      this.editorHistory.pushAndExecute(cmd);
    }
    this.cdr.markForCheck();
  }

  private applyAnchorDrag(segments: PathSegment[], anchorIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const anchor = pathState?.anchors[anchorIndex];
    if (!anchor) return;
    const moveSegment = segments[anchor.moveSegmentIndex];
    if (!moveSegment || moveSegment.type === 'Z') return;

    const oldX = moveSegment.x;
    const oldY = moveSegment.y;
    const dx = x - oldX;
    const dy = y - oldY;

    moveSegment.x = x;
    moveSegment.y = y;

    if (moveSegment.type === 'C') {
      moveSegment.x2 += dx;
      moveSegment.y2 += dy;
    }
    if (moveSegment.type === 'Q') {
      moveSegment.x1 += dx;
      moveSegment.y1 += dy;
    }

    for (const segment of segments) {
      if (segment.type === 'C' && segment.x === oldX && segment.y === oldY) {
        segment.x2 += dx;
        segment.y2 += dy;
      }
      if (segment.type === 'Q' && segment.x === oldX && segment.y === oldY) {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const previous = segments[i - 1];
      const segment = segments[i];
      if (previous.type === 'Z') continue;
      if (previous.x !== oldX || previous.y !== oldY) continue;
      if (segment.type === 'C') {
        segment.x1 += dx;
        segment.y1 += dy;
      } else if (segment.type === 'Q') {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }
  }

  private applyControlDrag(segments: PathSegment[], handleIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const handle = pathState?.controlHandles[handleIndex];
    if (!handle) return;
    const segment = segments[handle.segmentIndex];
    if (!segment) return;
    if (segment.type === 'Q') {
      if (handle.controlPoint === 'x1y1') {
        segment.x1 = x;
        segment.y1 = y;
      }
      return;
    }
    if (segment.type !== 'C') return;
    if (handle.controlPoint === 'x1y1') {
      segment.x1 = x;
      segment.y1 = y;
      return;
    }
    segment.x2 = x;
    segment.y2 = y;
  }

  private buildPathNodeEditState(pathId: string): PathNodeEditStateBuildResult {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return { state: null, reason: null };
    const pathEl = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return { state: null, reason: null };
    const pathData = pathEl.getAttribute('d') ?? '';
    if (!pathData.trim()) return { state: null, reason: null };

    const parsed = this.parsePathDataForNodeEditing(pathData);
    if (!parsed) {
      return {
        state: null,
        reason: 'Node editing supports only clean M/L/C/Q/T/Z path commands (smooth T is stored as Q).'
      };
    }
    return {
      state: {
        pathId,
        anchors: this.collectPathNodeAnchors(parsed),
        controlHandles: this.collectPathControlHandles(parsed)
      },
      reason: null
    };
  }

  private parsePathDataForNodeEditing(pathData: string): PathSegment[] | null {
    return parsePathDForNodeEditing(pathData);
  }

  /** ~10px in root SVG user units for pen path insert hit testing. */
  private getPenPathInsertToleranceSvg(): number {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return 8;
    const vb = this.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return 8;
    const svgPerPx = (vb.vbW / r.width + vb.vbH / r.height) / 2;
    return 10 * svgPerPx;
  }

  /**
   * Pen tool: insert an anchor on an existing path when the user clicks near a segment (gh9).
   * @returns true when a node was inserted (caller should preventDefault).
   */
  private tryPenInsertNodeOnPath(pathElement: Element, event: MouseEvent): boolean {
    if (event.detail !== 1) return false;
    if (this.penSession.getSegments().length > 0 || this.penPendingSegment) return false;
    if (pathElement.tagName?.toLowerCase() !== 'path' || !pathElement.id) return false;

    const pt = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!pt) return false;

    const pathId = pathElement.id;
    const svg = this.svgManipulation.getSVGInstance();
    const pathNode = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathNode) return false;

    const oldD = pathNode.getAttribute('d') ?? '';
    const parsed = parsePathDForNodeEditing(oldD);
    if (!parsed) return false;

    const tol = this.getPenPathInsertToleranceSvg();
    const maxDistSq = tol * tol;
    const next = insertPenNodeOnParsedPath(parsed, pt.x, pt.y, maxDistSq);
    if (!next) return false;

    const newD = pathSegmentsToD(next);
    if (newD === oldD || !this.isValidNodeEditSerializedPath(newD)) return false;

    this.svgManipulation.updatePathData(pathId, newD);
    const cmd = new EditPathNodesCommand(this.svgManipulation, pathId, oldD, newD, true);
    this.editorHistory.pushAndExecute(cmd);

    const el = svg?.findOne(`#${pathId}`) as SVGElement | undefined;
    if (el) {
      this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    }
    const shapeBbox = this.svgManipulation.getShapeBBox(pathId);
    if (shapeBbox) {
      this.lastBbox = shapeBbox;
      this._highlightRectCacheKey = '';
    }

    if (this.pathNodeEditState?.paths.some((state) => state.pathId === pathId)) {
      const refreshed = this.buildPathNodeEditState(pathId);
      if (refreshed.state) {
        this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
          state.pathId === pathId ? refreshed.state! : state
        );
        this.pathNodeEditState.activePathId = pathId;
        this.selectedPathNode = null;
      } else {
        this.exitPathNodeEditMode();
      }
    }

    this.cdr.markForCheck();
    return true;
  }

  private isValidNodeEditSerializedPath(pathData: string): boolean {
    if (!pathData.trim()) return false;
    const reparsed = parsePathD(pathData);
    return reparsed.errors.length === 0 && reparsed.segments.length > 0 && reparsed.segments[0].type === 'M';
  }

  private collectPathNodeAnchors(segments: readonly PathSegment[]): PathNodePoint[] {
    const anchors: PathNodePoint[] = [];
    let current: PathNodePoint | null = null;
    let subpathStart: PathNodePoint | null = null;

    for (const [segmentIndex, segment] of segments.entries()) {
      if (segment.type === 'M') {
        const point = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        };
        anchors.push(point);
        current = point;
        subpathStart = point;
        continue;
      }
      if (segment.type === 'L') {
        const point = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        };
        anchors.push(point);
        current = point;
        continue;
      }
      if (segment.type === 'C') {
        const point = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        };
        anchors.push(point);
        current = point;
        continue;
      }
      if (segment.type === 'Q') {
        const point = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        };
        anchors.push(point);
        current = point;
        continue;
      }
      if (segment.type === 'Z' && subpathStart && current) {
        if (subpathStart.x !== current.x || subpathStart.y !== current.y) {
          anchors.push({
            x: subpathStart.x,
            y: subpathStart.y,
            segmentIndex,
            moveSegmentIndex: subpathStart.moveSegmentIndex
          });
        }
        current = {
          x: subpathStart.x,
          y: subpathStart.y,
          segmentIndex,
          moveSegmentIndex: subpathStart.moveSegmentIndex
        };
      }
    }

    return anchors;
  }

  private collectPathControlHandles(segments: readonly PathSegment[]): PathNodeControlHandle[] {
    const handles: PathNodeControlHandle[] = [];
    let current: PathNodePoint | null = null;
    let subpathStart: PathNodePoint | null = null;

    for (const [segmentIndex, segment] of segments.entries()) {
      if (segment.type === 'M') {
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        subpathStart = current;
        continue;
      }
      if (segment.type === 'L') {
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'C') {
        if (current) {
          handles.push({
            anchorX: current.x,
            anchorY: current.y,
            controlX: segment.x1,
            controlY: segment.y1,
            segmentIndex,
            controlPoint: 'x1y1'
          });
        }
        handles.push({
          anchorX: segment.x,
          anchorY: segment.y,
          controlX: segment.x2,
          controlY: segment.y2,
          segmentIndex,
          controlPoint: 'x2y2'
        });
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'Q') {
        if (current) {
          handles.push({
            anchorX: current.x,
            anchorY: current.y,
            controlX: segment.x1,
            controlY: segment.y1,
            segmentIndex,
            controlPoint: 'x1y1'
          });
        }
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'Z' && subpathStart) {
        current = {
          x: subpathStart.x,
          y: subpathStart.y,
          segmentIndex,
          moveSegmentIndex: subpathStart.moveSegmentIndex
        };
      }
    }

    return handles;
  }

  private isGroupAClipMaskCarrier(groupId: string): boolean {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const el = svg.findOne(`#${groupId}`)?.node as Element | null;
    if (!el) return false;
    return el.hasAttribute('clip-path') || el.hasAttribute('mask');
  }

  private isEditorContentShapeTarget(target: Element): boolean {
    const tag = target.tagName?.toLowerCase?.() ?? '';
    if (!CONTENT_SHAPE_TAGS.has(tag)) return false;
    const id = target.id;
    if (!id) return false;
    if (typeof target.closest === 'function') {
      const group = target.closest('[data-editor-content-group]');
      return !!group?.contains(target);
    }
    const shape = this.svgManipulation.getSVGInstance()?.findOne(`#${id}`) as SVGElement | undefined;
    const node = shape?.node as Element | undefined;
    if (!node || typeof node.closest !== 'function') return false;
    return !!node.closest('[data-editor-content-group]');
  }

  private isSelectorInteractionTool(tool: EditorTool): boolean {
    return tool === 'selector' || tool === 'node-edit-selector';
  }

  private isNodeEditSelectorTool(tool: EditorTool): boolean {
    return tool === 'node-edit-selector';
  }

  private isPathElementId(id: string): boolean {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const el = svg.findOne(`#${id}`)?.node as Element | null;
    return el?.tagName?.toLowerCase?.() === 'path';
  }
}
