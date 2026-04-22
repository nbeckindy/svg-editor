import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect, signal } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService, type EditorTool } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { computeProportionalResizedUnion, type BBox, type ResizeCorner } from '../../utils/selection-resize';
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
  UnionScaleCommand,
  UnionRotateCommand,
  RemoveShapesCommand,
  GroupCommand,
  UngroupCommand,
  AddPathCommand
} from '../../models/editor-commands';
import { DragGesture, ResizeGesture, RotateGesture, CreationGesture, type GestureContext, type Rect } from './gestures';
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

/** Round to nearest "nice" step (1, 2, 5 × 10^n) for readable labels. */
function roundToNiceStep(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = Math.pow(10, exp);
  const normalized = value / mag;
  const nice = normalized <= 1.5 ? 1 : normalized <= 3.5 ? 2 : normalized <= 7.5 ? 5 : 10;
  return mag * nice;
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
      !this.isSelectionMarquee &&
      this.wrapperWidth > 0 &&
      !!this.lastBbox
    );
  }

  readonly rotateHandleOffset = 28;

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
  private readonly creation = new CreationGesture();
  private readonly penSession = new PenSession();
  private readonly acceptedSvgContent = signal<string>('');
  private lastObservedTool: EditorTool = 'selector';
  private isRevertingToolChange = false;
  penFinishFeedbackMessage: string | null = null;
  private penFinishFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
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
  get isCreatingShape(): boolean { return this.creation.isActive; }
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

  // --- Shared selection/highlight state ---
  lastBbox: { x: number; y: number; width: number; height: number } | null = null;
  private _highlightRectCache: { x: number; y: number; width: number; height: number } | null = null;
  _highlightRectCacheKey = '';

  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isResizingSelection && this.resize.overlayRect) return this.resize.overlayRect;
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

  // --- Zoom marquee state ---
  isZoomMarquee = false;
  private zoomMarqueeStart: { clientX: number; clientY: number } | null = null;
  private zoomMarqueeEnd: { clientX: number; clientY: number } | null = null;
  private zoomMarqueeJustEnded = false;

  get zoomMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.isZoomMarquee || !this.zoomMarqueeStart || !this.zoomMarqueeEnd) return null;
    const left = Math.min(this.zoomMarqueeStart.clientX, this.zoomMarqueeEnd.clientX);
    const top = Math.min(this.zoomMarqueeStart.clientY, this.zoomMarqueeEnd.clientY);
    const width = Math.abs(this.zoomMarqueeEnd.clientX - this.zoomMarqueeStart.clientX);
    const height = Math.abs(this.zoomMarqueeEnd.clientY - this.zoomMarqueeStart.clientY);
    return { left, top, width, height };
  }

  // --- Selection marquee state ---
  isSelectionMarquee = false;
  private selectionMarqueeStart: { clientX: number; clientY: number } | null = null;
  private selectionMarqueeEnd: { clientX: number; clientY: number } | null = null;
  private selectionMarqueeJustEnded = false;

  get selectionMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.isSelectionMarquee || !this.selectionMarqueeStart || !this.selectionMarqueeEnd) return null;
    const left = Math.min(this.selectionMarqueeStart.clientX, this.selectionMarqueeEnd.clientX);
    const top = Math.min(this.selectionMarqueeStart.clientY, this.selectionMarqueeEnd.clientY);
    const width = Math.abs(this.selectionMarqueeEnd.clientX - this.selectionMarqueeStart.clientX);
    const height = Math.abs(this.selectionMarqueeEnd.clientY - this.selectionMarqueeStart.clientY);
    return { left, top, width, height };
  }

  drilledIntoGroupId: string | null = null;

  // --- GestureContext implementation ---
  private get gestureCtx(): GestureContext {
    return {
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory,
      canvasView: this.canvasView,
      cdr: this.cdr,
      svgContainer: this.svgContainer,
      zoomWrapper: this.zoomWrapper,
      highlightOverlayContainer: this.highlightOverlayContainer,
      overlayViewBox: this.overlayViewBox,
      clientToEditorSvgPoint: (cx: number, cy: number) => this.clientToEditorSvgPoint(cx, cy),
      svgBboxToOverlayPixels: (bbox: Rect) => this.svgBboxToOverlayPixels(bbox),
      invalidateHighlightCache: () => { this._highlightRectCacheKey = ''; },
      setLastBbox: (bbox: Rect | null) => { this.lastBbox = bbox; }
    };
  }

  // --- Keyboard shortcuts ---
  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
    if (this.shouldIgnoreKeyboardShortcuts(event)) return;

    const selectorActive = this.editorTool.getCurrentTool() === 'selector';

    if (event.key === 'Escape') {
      if (this.isSelectionMarquee || this.isZoomMarquee) {
        this.cancelActiveMarquees();
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
      this.isSelectionMarquee = false;
      this.selectionMarqueeStart = null;
      this.selectionMarqueeEnd = null;
      changed = true;
    }
    if (this.isZoomMarquee) {
      this.isZoomMarquee = false;
      this.zoomMarqueeStart = null;
      this.zoomMarqueeEnd = null;
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
    if (this.editorTool.getCurrentTool() === 'pen' && this.isPenSessionActive) {
      if (this.penPendingSegment) {
        this.penPendingLastClient = { x: event.clientX, y: event.clientY };
      }
      const pt = this.clientToEditorSvgPoint(event.clientX, event.clientY);
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
      this.selectionMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
      this.cdr.detectChanges();
      return;
    }
    if (this.isZoomMarquee) {
      this.zoomMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
      this.cdr.detectChanges();
      return;
    }
    if (this.isResizingSelection) {
      this.resize.move(this.gestureCtx, event.clientX, event.clientY);
      return;
    }
    if (this.isRotatingSelection) {
      this.rotate.move(this.gestureCtx, event.clientX, event.clientY);
      return;
    }
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape) {
      this.drag.move(this.gestureCtx, event.clientX, event.clientY);
    }
  }

  onDocumentMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;

    if (this.editorTool.getCurrentTool() === 'pen' && this.penPendingSegment) {
      this.commitPenPendingSegment(event);
      return;
    }

    if (this.isCreatingShape) {
      this.creation.end(this.gestureCtx, event.clientX, event.clientY, event.shiftKey);
      return;
    }

    if (this.isSelectionMarquee && this.selectionMarqueeStart && this.selectionMarqueeEnd) {
      this.commitSelectionMarquee(event);
      return;
    }
    if (this.isZoomMarquee && this.zoomMarqueeStart && this.zoomMarqueeEnd) {
      this.commitZoomMarquee();
      return;
    }

    this.isPanning = false;

    if (this.isResizingSelection) {
      this.resize.end(this.gestureCtx);
      return;
    }
    if (this.isRotatingSelection) {
      this.rotate.end(this.gestureCtx);
      return;
    }
    if (this.isDraggingShape) {
      this.drag.end(this.gestureCtx, event.clientX, event.clientY);
    }
  }

  private commitSelectionMarquee(event: MouseEvent): void {
    const screenW = Math.abs(this.selectionMarqueeEnd!.clientX - this.selectionMarqueeStart!.clientX);
    const screenH = Math.abs(this.selectionMarqueeEnd!.clientY - this.selectionMarqueeStart!.clientY);
    const isTinyDrag = screenW < MARQUEE_MIN_DRAG_PX && screenH < MARQUEE_MIN_DRAG_PX;
    if (isTinyDrag) {
      this.selectionMarqueeJustEnded = false;
    } else {
      const startSvg = this.clientToEditorSvgPoint(
        this.selectionMarqueeStart!.clientX,
        this.selectionMarqueeStart!.clientY
      );
      const endSvg = this.clientToEditorSvgPoint(
        this.selectionMarqueeEnd!.clientX,
        this.selectionMarqueeEnd!.clientY
      );
      if (startSvg && endSvg) {
        const x = Math.min(startSvg.x, endSvg.x);
        const y = Math.min(startSvg.y, endSvg.y);
        const w = Math.max(0, Math.abs(endSvg.x - startSvg.x));
        const h = Math.max(0, Math.abs(endSvg.y - startSvg.y));
        const hits = this.svgManipulation.getShapePropertiesIntersectingRect({ x, y, width: w, height: h });
        const expanded = this.svgManipulation.expandSelectionByClipGroups(hits);
        if (event.shiftKey) {
          if (expanded.length > 0) {
            this.shapeSelection.mergeShapesIntoSelection(expanded);
          }
        } else if (expanded.length > 0) {
          this.shapeSelection.selectShapes(expanded);
        } else {
          this.shapeSelection.clearSelection();
        }
        this.svgManipulation.clearHighlight();
        this.selectionMarqueeJustEnded = true;
      } else {
        this.selectionMarqueeJustEnded = false;
      }
    }
    this.isSelectionMarquee = false;
    this.selectionMarqueeStart = null;
    this.selectionMarqueeEnd = null;
    this.cdr.detectChanges();
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
      if (scale <= 0) {
        this.isZoomMarquee = false;
        this.zoomMarqueeStart = null;
        this.zoomMarqueeEnd = null;
        this.cdr.detectChanges();
        return;
      }
      const startSvg = {
        x: (this.zoomMarqueeStart!.clientX - rawRect.left) / scale,
        y: (this.zoomMarqueeStart!.clientY - rawRect.top) / scale
      };
      const endSvg = {
        x: (this.zoomMarqueeEnd!.clientX - rawRect.left) / scale,
        y: (this.zoomMarqueeEnd!.clientY - rawRect.top) / scale
      };
      const x = Math.min(startSvg.x, endSvg.x);
      const y = Math.min(startSvg.y, endSvg.y);
      const w = Math.max(0, Math.abs(endSvg.x - startSvg.x));
      const h = Math.max(0, Math.abs(endSvg.y - startSvg.y));
      const screenW = Math.abs(this.zoomMarqueeEnd!.clientX - this.zoomMarqueeStart!.clientX);
      const screenH = Math.abs(this.zoomMarqueeEnd!.clientY - this.zoomMarqueeStart!.clientY);
      const isTinyDrag = screenW < MARQUEE_MIN_DRAG_PX && screenH < MARQUEE_MIN_DRAG_PX;
      if (isTinyDrag) {
        this.zoomMarqueeJustEnded = false;
      } else if (w > 0 && h > 0 && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
        this.canvasView.zoomToFitRect(x, y, w, h, this.wrapperWidth, this.wrapperHeight);
        const wrapperEl = this.zoomWrapper()?.nativeElement;
        if (viewportEl && wrapperEl) {
          const wrapperRect = wrapperEl.getBoundingClientRect();
          const containerRect = viewportEl.getBoundingClientRect();
          this.canvasView.panX += containerRect.left - wrapperRect.left;
          this.canvasView.panY += containerRect.top - wrapperRect.top;
        }
        this.updateViewBoxOverlayRect();
        this.zoomMarqueeJustEnded = true;
      } else {
        this.zoomMarqueeJustEnded = false;
      }
    } else {
      this.zoomMarqueeJustEnded = false;
    }
    this.isZoomMarquee = false;
    this.zoomMarqueeStart = null;
    this.zoomMarqueeEnd = null;
    this.cdr.detectChanges();
  }

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService,
    public editorTool: EditorToolService,
    public canvasView: CanvasViewService,
    private cdr: ChangeDetectorRef,
    private editorHistory: EditorHistoryService
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
    });
    effect(() => {
      this.editorHistory.revision();
      this.drilledIntoGroupId = null;
      setTimeout(() => this.syncSelectionFromDom(), 0);
    });
    effect(() => {
      const shapes = this.shapeSelection.selectedShapes();
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
    this.isSelectionMarquee = false;
    this.isZoomMarquee = false;
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
      this.isZoomMarquee = true;
      this.zoomMarqueeStart = { clientX: event.clientX, clientY: event.clientY };
      this.zoomMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
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
        return;
      }
      const pt = this.clientToEditorSvgPoint(event.clientX, event.clientY);
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
    if (this.editorTool.getCurrentTool() !== 'selector' || !this.svgContent() || !this.canvasView.isInitialized()) return;
    const target = event.target as Element;

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
      this.isSelectionMarquee = true;
      this.selectionMarqueeStart = { clientX: event.clientX, clientY: event.clientY };
      this.selectionMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
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
    if (this.drag.consumeJustEnded()) return;
    if (this.resize.consumeJustEnded()) return;
    if (this.rotate.consumeJustEnded()) return;
    if (this.creation.consumeJustEnded()) return;
    if (this.editorTool.getCurrentTool() === 'pan') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pen') {
      return;
    }
    if (this.editorTool.isCreationTool()) {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'zoom') {
      if (this.zoomMarqueeJustEnded) {
        this.zoomMarqueeJustEnded = false;
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

    if (this.selectionMarqueeJustEnded) {
      this.selectionMarqueeJustEnded = false;
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

  onCanvasDoubleClick(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pen') return;
    if (this.editorTool.getCurrentTool() !== 'selector') return;
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const selectedId = selected[0].id;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const selectedEl = svgInstance.findOne(`#${selectedId}`)?.node as Element | null;
    if (!selectedEl || selectedEl.tagName?.toLowerCase() !== 'g') return;

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
}
