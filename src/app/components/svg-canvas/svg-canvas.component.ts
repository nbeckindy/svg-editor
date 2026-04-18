import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
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
  RemoveShapesCommand
} from '../../models/editor-commands';

/** Target number of major ticks visible across the ruler at any zoom level. */
const RULER_TICK_COUNT = 30;
/** SVG.js `.size()` must be > 0; wrapper CSS can be subpixel to match the blue overlay. */
const GHOST_SVG_MIN_PX = 1e-6;

const CONTENT_SHAPE_TAGS = new Set([
  'circle',
  'rect',
  'path',
  'polygon',
  'ellipse',
  'line',
  'polyline'
]);

/** After loading SVG, fit the editor stage in the canvas with this much inset (margin). */
const INITIAL_LOAD_VIEWPORT_FIT_FRACTION = 0.88;

/** In-document preview clones (drag / resize / rotate); participates in SVG paint order. */
const EDITOR_GHOST_ATTR = 'data-editor-ghost';

type GhostPreviewFragment = {
  outerGroup: SVGElement;
  nestedSvg: Svg;
  worldToUnion: SVGElement;
};

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
  /** Offset of zoom-wrapper (content) origin from viewport top-left; used so ruler 0,0 aligns with content 0,0. */
  rulerOriginOffsetX = 0;
  rulerOriginOffsetY = 0;
  get overlayWidthPx(): number {
    return this.wrapperWidth * this.canvasView.scale;
  }
  get overlayHeightPx(): number {
    return this.wrapperHeight * this.canvasView.scale;
  }
  /** Current zoom as percentage (100% = original SVG size). */
  get zoomLevelPercent(): number {
    return Math.round(this.canvasView.scale * 100);
  }

  /** Horizontal ruler ticks: position (px) and value (viewBox units). 0,0 aligns with content origin. */
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

  /** Vertical ruler ticks (half as many as horizontal). */
  /** Corner resize handles when selector is active and selection exists. */
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

  /** Offset above selection (overlay SVG units) for the rotate handle. */
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
  /** SVG-coordinate bbox of selected shape; overlay pixel rect is derived from this so zoom updates the highlight. */
  private lastBbox: { x: number; y: number; width: number; height: number } | null = null;
  /** During drag, overlay rect in overlay-container pixel coords so the blue outline follows the ghost. */
  private dragOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  /** Cache key and result so the getter is stable across re-reads in the same CD cycle (avoids NG0100). */
  private _highlightRectCache: { x: number; y: number; width: number; height: number } | null = null;
  private _highlightRectCacheKey = '';
  /**
   * Axis-aligned selection frame in overlay pixel space (only right angles), matching typical design-tool UX.
   * Prefer the tight screen-space union of selected elements’ `getBoundingClientRect()` so the box hugs
   * **rendered** ink after rotation/transform; falls back to mapping `lastBbox` when DOM rects are unavailable.
   */
  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isResizingSelection && this.resizeOverlayRect) return this.resizeOverlayRect;
    if (this.isRotatingSelection && this.rotateUnionStart && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
      return this.svgBboxToOverlayPixels(this.rotateUnionStart);
    }
    if (this.isDraggingShape && this.dragOverlayRect) return this.dragOverlayRect;
    if (!this.lastBbox || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this._highlightRectCache = null;
      this._highlightRectCacheKey = '';
      return null;
    }
    // Include documentRevision: lastBbox alone can match after different rotations (same user-space
    // AABB) while getBoundingClientRect changes — caching only on lastBbox would reuse stale DOM union.
    // Include selected ids so switching selection without bbox change still invalidates.
    const idKey = this.shapeSelection.getSelectedShapes().map((s) => s.id).join(',');
    const key = `${this.lastBbox.x}-${this.lastBbox.y}-${this.lastBbox.width}-${this.lastBbox.height}-${this.wrapperWidth}-${this.wrapperHeight}-${this.canvasView.scale}-${this.canvasView.panX}-${this.canvasView.panY}-${this.svgManipulation.documentRevision()}-${idKey}`;
    if (this._highlightRectCacheKey === key) {
      return this._highlightRectCache;
    }
    this._highlightRectCacheKey = key;
    // Prefer screen-space union → overlay pixels so the frame matches painted bounds (same as
    // getBoundingClientRect), avoiding user-space ↔ overlay rounding drift with preserveAspectRatio
    // none + CSS zoom on the zoom wrapper.
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

  /** Debug: filter DevTools console with `[selection-highlight]`. */
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

  /**
   * Union of selected shapes’ client rects relative to the highlight overlay — i.e. the smallest axis-aligned
   * rectangle in **screen pixels** that contains the painted bounds (tight AABB of what the browser draws).
   */
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

  /**
   * Overlay-space rect per selected shape (for multi-select: one outline each so every item reads as selected).
   * Empty when 0–1 shapes, while transforming, or when overlay/DOM is unavailable (falls back to union `highlightRect`).
   */
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

  /** SVG `transform` for the blue selection frame while rotating (union center, same angle as commit). */
  selectionRotateHighlightTransform(_hr: { x: number; y: number; width: number; height: number }): string {
    if (!this.isRotatingSelection || !this.rotatePivotDoc) return '';
    const po = this.svgBboxToOverlayPixels({
      x: this.rotatePivotDoc.x,
      y: this.rotatePivotDoc.y,
      width: 0,
      height: 0
    });
    return `rotate(${radiansToDegrees(this.rotateAccumulatedRad)},${po.x},${po.y})`;
  }

  /** Set only in syncOverlayViewBox so it stays stable during CD. Document viewBox stroke drawn in overlay so it stays constant width at any zoom. */
  private _viewBoxOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  get viewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    return this._viewBoxOverlayRect;
  }
  /** Screen rect for zoom marquee overlay (position: fixed; left, top, width, height in px). */
  get zoomMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.isZoomMarquee || !this.zoomMarqueeStart || !this.zoomMarqueeEnd) return null;
    const left = Math.min(this.zoomMarqueeStart.clientX, this.zoomMarqueeEnd.clientX);
    const top = Math.min(this.zoomMarqueeStart.clientY, this.zoomMarqueeEnd.clientY);
    const width = Math.abs(this.zoomMarqueeEnd.clientX - this.zoomMarqueeStart.clientX);
    const height = Math.abs(this.zoomMarqueeEnd.clientY - this.zoomMarqueeStart.clientY);
    return { left, top, width, height };
  }
  /** Screen rect for selection marquee (selector tool). */
  get selectionMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    if (!this.isSelectionMarquee || !this.selectionMarqueeStart || !this.selectionMarqueeEnd) return null;
    const left = Math.min(this.selectionMarqueeStart.clientX, this.selectionMarqueeEnd.clientX);
    const top = Math.min(this.selectionMarqueeStart.clientY, this.selectionMarqueeEnd.clientY);
    const width = Math.abs(this.selectionMarqueeEnd.clientX - this.selectionMarqueeStart.clientX);
    const height = Math.abs(this.selectionMarqueeEnd.clientY - this.selectionMarqueeStart.clientY);
    return { left, top, width, height };
  }
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;

  /** Shape drag: when user drags the selected element(s) we hide them and show a ghost until mouseup. */
  isDraggingShape = false;
  /** Ids of all shapes being dragged (one or many for group drag). */
  private dragShapeIds: string[] = [];
  /** True after drag ends so we ignore the following click (which would target SVG root and clear selection). */
  private dragJustEnded = false;
  private dragStartSvg: { x: number; y: number } | null = null;
  private dragStartBbox: { x: number; y: number; width: number; height: number } | null = null;
  private dragSnapshot: Map<string, Matrix> = new Map();
  private dragGhostFragments: GhostPreviewFragment[] = [];

  /** Proportional resize from corner handles (ghost preview; DOM updates on mouseup). */
  isResizingSelection = false;
  private resizeHandle: ResizeCorner | null = null;
  private resizeUnionStart: BBox | null = null;
  private resizeLastUnion: BBox | null = null;
  private resizeSnapshot: Map<string, Matrix> = new Map();
  private resizeGhostFragments: GhostPreviewFragment[] = [];
  /** Overlay pixels for selection outline during resize (matches ghost). */
  private resizeOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  /** After resize mouseup, ignore next canvas click so selection is not cleared. */
  private resizeJustEnded = false;

  /** Rotation from selection handle (ghost preview; DOM updates on mouseup). */
  isRotatingSelection = false;
  private rotateSnapshot: Map<string, Matrix> = new Map();
  private rotateUnionStart: BBox | null = null;
  private rotatePivotDoc: { x: number; y: number } | null = null;
  private rotateAccumulatedRad = 0;
  private rotateLastPointerSvg: { x: number; y: number } | null = null;
  private rotateGhostFragments: GhostPreviewFragment[] = [];
  private rotateJustEnded = false;

  /** Prefixed def clones in root `<defs>` so nested ghost SVGs can reference `url(#id)` uniquely. */
  private ghostDefPrefix: string | null = null;
  private ghostDefElements: Element[] = [];

  /** Zoom marquee: drag-to-rectangle zoom. */
  isZoomMarquee = false;
  private zoomMarqueeStart: { clientX: number; clientY: number } | null = null;
  private zoomMarqueeEnd: { clientX: number; clientY: number } | null = null;
  /** After marquee mouseup, ignore the next click so it doesn't zoom in. */
  private zoomMarqueeJustEnded = false;

  /** Selection marquee: drag-to-rectangle multi-select (selector tool). */
  isSelectionMarquee = false;
  private selectionMarqueeStart: { clientX: number; clientY: number } | null = null;
  private selectionMarqueeEnd: { clientX: number; clientY: number } | null = null;
  /** After selection marquee mouseup, ignore the next click so it doesn't clear selection. */
  private selectionMarqueeJustEnded = false;

  /**
   * Document keyboard shortcuts for the canvas (see `shouldIgnoreKeyboardShortcuts`):
   * - **Ctrl/Cmd+A** (selector tool): select all shapes in paint order; clip/mask groups expanded like marquee.
   * - **Escape**: cancel selection or zoom marquee if active; otherwise clear selection.
   * - **Delete / Backspace** (selector tool): remove selected shapes (clip/mask groups expanded); no-op if nothing selected.
   */
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
      if (this.shapeSelection.getSelectedShapes().length > 0) {
        this.shapeSelection.clearSelection();
        this.svgManipulation.clearHighlight();
        event.preventDefault();
      }
      return;
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

    if (
      selectorActive &&
      (event.key === 'Delete' || event.key === 'Backspace') &&
      this.shapeSelection.getSelectedShapes().length > 0
    ) {
      const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const cmd = new RemoveShapesCommand(this.svgManipulation, ids);
      this.editorHistory.pushAndExecute(cmd);
      this.shapeSelection.clearSelection();
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

  onDocumentMouseMove(event: MouseEvent): void {
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
    if (this.isResizingSelection && this.resizeHandle && this.resizeUnionStart && this.resizeGhostFragments.length > 0) {
      const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (point) {
        const unionAfter = computeProportionalResizedUnion(this.resizeUnionStart, this.resizeHandle, point);
        this.resizeLastUnion = unionAfter;
        this.updateResizeGhost(unionAfter);
      }
      this.cdr.detectChanges();
      return;
    }
    if (
      this.isRotatingSelection &&
      this.rotateGhostFragments.length > 0 &&
      this.rotateUnionStart &&
      this.rotatePivotDoc &&
      this.rotateLastPointerSvg
    ) {
      const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (point) {
        const d = rotationDeltaFromPointerMoveRad(this.rotatePivotDoc, this.rotateLastPointerSvg, point);
        this.rotateAccumulatedRad += d;
        this.rotateLastPointerSvg = point;
        this.updateRotateGhost(this.rotateAccumulatedRad);
      }
      this.cdr.detectChanges();
      return;
    }
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape && this.dragGhostFragments.length > 0 && this.dragStartSvg && this.dragStartBbox) {
      const currentSvg = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (currentSvg) {
        const dx = currentSvg.x - this.dragStartSvg.x;
        const dy = currentSvg.y - this.dragStartSvg.y;
        const currentBbox = {
          x: this.dragStartBbox.x + dx,
          y: this.dragStartBbox.y + dy,
          width: this.dragStartBbox.width,
          height: this.dragStartBbox.height
        };
        this.updateDragGhostAndOverlay(currentBbox);
      }
    }
  }

  onDocumentMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    if (this.isSelectionMarquee && this.selectionMarqueeStart && this.selectionMarqueeEnd) {
      const screenW = Math.abs(this.selectionMarqueeEnd.clientX - this.selectionMarqueeStart.clientX);
      const screenH = Math.abs(this.selectionMarqueeEnd.clientY - this.selectionMarqueeStart.clientY);
      const isTinyDrag =
        screenW < MARQUEE_MIN_DRAG_PX && screenH < MARQUEE_MIN_DRAG_PX;
      if (isTinyDrag) {
        this.selectionMarqueeJustEnded = false;
      } else {
        const startSvg = this.clientToEditorSvgPoint(
          this.selectionMarqueeStart.clientX,
          this.selectionMarqueeStart.clientY
        );
        const endSvg = this.clientToEditorSvgPoint(
          this.selectionMarqueeEnd.clientX,
          this.selectionMarqueeEnd.clientY
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
      return;
    }
    if (this.isZoomMarquee && this.zoomMarqueeStart && this.zoomMarqueeEnd) {
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
          x: (this.zoomMarqueeStart.clientX - rawRect.left) / scale,
          y: (this.zoomMarqueeStart.clientY - rawRect.top) / scale
        };
        const endSvg = {
          x: (this.zoomMarqueeEnd.clientX - rawRect.left) / scale,
          y: (this.zoomMarqueeEnd.clientY - rawRect.top) / scale
        };
        {
          const x = Math.min(startSvg.x, endSvg.x);
          const y = Math.min(startSvg.y, endSvg.y);
          const w = Math.max(0, Math.abs(endSvg.x - startSvg.x));
          const h = Math.max(0, Math.abs(endSvg.y - startSvg.y));
          const screenW = Math.abs(this.zoomMarqueeEnd.clientX - this.zoomMarqueeStart.clientX);
          const screenH = Math.abs(this.zoomMarqueeEnd.clientY - this.zoomMarqueeStart.clientY);
          const isTinyDrag =
            screenW < MARQUEE_MIN_DRAG_PX && screenH < MARQUEE_MIN_DRAG_PX;
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
        }
      } else {
        this.zoomMarqueeJustEnded = false;
      }
      this.isZoomMarquee = false;
      this.zoomMarqueeStart = null;
      this.zoomMarqueeEnd = null;
      this.cdr.detectChanges();
      return;
    }
    this.isPanning = false;
    if (this.isResizingSelection && this.resizeHandle && this.resizeUnionStart && this.resizeLastUnion) {
      const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const cmd = new UnionScaleCommand(
        this.svgManipulation, ids,
        this.resizeUnionStart, this.resizeLastUnion,
        this.resizeSnapshot, this.resizeHandle
      );
      this.editorHistory.pushAndExecute(cmd);
      for (const id of ids) {
        this.svgManipulation.setShapeVisibility(id, true);
      }
      this.removeResizeGhost();
      this.isResizingSelection = false;
      this.resizeHandle = null;
      this.resizeUnionStart = null;
      this.resizeLastUnion = null;
      this.resizeSnapshot = new Map();
      this.resizeOverlayRect = null;
      const unionBbox = this.svgManipulation.getUnionBBox(ids);
      if (unionBbox) {
        this.lastBbox = unionBbox;
        this._highlightRectCacheKey = '';
      }
      this.resizeJustEnded = true;
      this.cdr.detectChanges();
      return;
    }
    if (this.isRotatingSelection && this.rotateUnionStart && this.rotatePivotDoc) {
      const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const committedRotateRad = this.rotateAccumulatedRad;
      const cmd = new UnionRotateCommand(
        this.svgManipulation, ids,
        this.rotatePivotDoc, radiansToDegrees(committedRotateRad),
        this.rotateSnapshot
      );
      this.editorHistory.pushAndExecute(cmd);
      for (const id of ids) {
        this.svgManipulation.setShapeVisibility(id, true);
      }
      this.removeRotateGhost();
      this.isRotatingSelection = false;
      this.rotateUnionStart = null;
      this.rotatePivotDoc = null;
      this.rotateAccumulatedRad = 0;
      this.rotateLastPointerSvg = null;
      this.rotateSnapshot = new Map();
      const unionBbox = this.svgManipulation.getUnionBBox(ids);
      if (unionBbox) {
        this.lastBbox = unionBbox;
        this._highlightRectCacheKey = '';
      }
      this.rotateJustEnded = true;
      this.cdr.detectChanges();
      return;
    }
    if (this.isDraggingShape && this.dragShapeIds.length > 0 && this.dragStartSvg) {
      let dx = 0;
      let dy = 0;
      const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (point) {
        dx = point.x - this.dragStartSvg.x;
        dy = point.y - this.dragStartSvg.y;
      }
      const dragCmds: EditorCommand[] = this.dragShapeIds.map(
        (id) => new TranslateCommand(this.svgManipulation, id, dx, dy, this.dragSnapshot)
      );
      this.editorHistory.pushAndExecute(
        dragCmds.length === 1 ? dragCmds[0] : new CompositeCommand(dragCmds, 'Move shapes')
      );
      for (const shapeId of this.dragShapeIds) {
        this.svgManipulation.setShapeVisibility(shapeId, true);
      }
      this.removeDragGhost();
      this.dragOverlayRect = null;
      this.isDraggingShape = false;
      this.dragShapeIds = [];
      this.dragStartSvg = null;
      this.dragStartBbox = null;
      this.dragSnapshot = new Map();
      this.dragJustEnded = true;
      const selectedIds = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      const unionBbox = this.svgManipulation.getUnionBBox(selectedIds);
      if (unionBbox) {
        this.lastBbox = unionBbox;
        this._highlightRectCacheKey = '';
      }
      this.cdr.detectChanges();
    }
  }

  private updateDragGhostAndOverlay(currentBbox: { x: number; y: number; width: number; height: number }): void {
    this.dragOverlayRect = this.svgBboxToOverlayPixels(currentBbox);
    if (this.dragGhostFragments.length === 0 || !this.dragStartBbox) return;
    // Move the outer <g> only. Updating nested <svg> x/y/viewBox/size + inner matrix every frame
    // can fail to apply visually with SVG.js; translate is stable and matches fixed-screen drag.
    const dx = currentBbox.x - this.dragStartBbox.x;
    const dy = currentBbox.y - this.dragStartBbox.y;
    const m = new Matrix().translate(dx, dy);
    for (const f of this.dragGhostFragments) {
      (f.outerGroup as Svg).matrix(m);
    }
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
      this.svgContent();
      this.canvasView.resetZoom();
    });
    effect(() => {
      this.editorHistory.revision();
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
        // Rely on next CD run (e.g. fixture.detectChanges() in tests) so we don't trigger NG0100
        this.cdr.markForCheck();
      }, 0);
    });
    effect(() => {
      if (this.svgContent() && this.svgContainer()?.nativeElement) {
        setTimeout(() => this.initializeSVG(), 0);
      }
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {}

  ngAfterViewInit(): void {
    if (this.svgContent()) {
      this.initializeSVG();
    }
  }

  /** Sync overlay from the main SVG (editor stage). Its viewBox is the union of document viewBox and content; shape bboxes are in the same coordinate system. */
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

  /** Recompute and set _viewBoxOverlayRect. Uses the same logic as syncOverlayViewBox (document viewBox → svgBboxToOverlayPixels) so zoom and select stay in sync. */
  private updateViewBoxOverlayRect(): void {
    this.syncOverlayViewBox();
  }

  /** Convert SVG viewBox bbox to overlay pixel coordinates. Uses the main SVG viewport and its position within the wrapper so alignment matches the browser. */
  private svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
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

  /**
   * Pointer → editor SVG user space (same coordinates as shape bboxes / union). Uses the live
   * rendered SVG rect and `overlayViewBox` — avoids double-counting pan (already in getBoundingClientRect)
   * and matches non-uniform viewBox ↔ pixel mapping.
   */
  private clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
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

  /**
   * Fixed-position drag/resize ghosts must use the same mapping as the painted SVG (screen px),
   * not overlay-inner coords (which are relative to the zoom wrapper and can diverge from the
   * highlight host when rulers/layout offset the overlay).
   */
  private svgDocumentBboxToFixedScreenRect(bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { left: number; top: number; width: number; height: number } | null {
    const vb = this.parseOverlayViewBox();
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!vb || !mainSvg) return null;
    const r = mainSvg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const { vbMinX, vbMinY, vbW, vbH } = vb;
    return {
      left: r.left + ((bbox.x - vbMinX) / vbW) * r.width,
      top: r.top + ((bbox.y - vbMinY) / vbH) * r.height,
      width: (bbox.width / vbW) * r.width,
      height: (bbox.height / vbH) * r.height
    };
  }

  /**
   * Same pixel rect as `highlightRect` / `svgBboxToOverlayPixels` → fixed screen box. Using this
   * for ghosts keeps them locked to the blue preview; `svgDocumentBboxToFixedScreenRect` can
   * diverge slightly (wrapper-relative vs host offset), visible when the box is subpixel.
   */
  private overlayPixelsToFixedScreenRect(o: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { left: number; top: number; width: number; height: number } | null {
    const host = this.highlightOverlayContainer()?.nativeElement?.getBoundingClientRect();
    if (!host) return null;
    return {
      left: host.left + o.x,
      top: host.top + o.y,
      width: o.width,
      height: o.height
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

  private initializeSVG(): void {
    this.editorHistory.clear();
    this.svgManipulation.initializeSVG(this.svgContainer()!.nativeElement, this.svgContent());
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
    const content = this.svgContent();
    // Only auto-fit when the svg came from the built-in icon palette.
    // (File uploads should not unexpectedly change the editor viewport.)
    if (content && content.includes('svg-editor-test-icon')) {
      queueMicrotask(() => this.applyInitialFitToViewport());
    }
  }

  /**
   * Zoom/pan so the full editor SVG viewBox (stage: grey + page + content) fits in the canvas
   * viewport with a small margin. Retries on the next frame if layout size is not ready yet.
   */
  private applyInitialFitToViewport(attempt = 0): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) {
      return;
    }
    // Avoid re-reading layout when the test already set wrapper dimensions.
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

    // Fit to the actual rendered SVG element size. `initializeSVG()` sizes the editor stage using
    // the source SVG `width/height` (which may differ from the `viewBox`), and our zoom transform
    // operates on the SVG element itself.
    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) {
      return;
    }

    // The `.svg-canvas` container centers its inline-block children using flexbox. SVG transforms
    // do not affect layout size, so the "layout center" depends on the *unscaled* SVG size.
    // Our `zoomToFitRect()` computes pan as if the SVG starts at the viewport origin, so we
    // subtract the flexbox centering offset here to keep the artwork in-bounds.
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

    // The viewBox border uses bounding boxes (getBoundingClientRect). Those can be computed
    // against the old transform if we run synchronously right after updating pan/scale.
    // Refresh on the next tick to eliminate the occasional stale border.
    this.cdr.markForCheck();
    setTimeout(() => {
      this.updateViewBoxOverlayRect();
      this.cdr.markForCheck();
    }, 0);
  }

  onCanvasMouseDown(event: MouseEvent): void {
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
    if (this.editorTool.getCurrentTool() !== 'selector' || !this.svgContent() || !this.canvasView.isInitialized()) return;
    const target = event.target as Element;
    const resizeEl = target.closest?.('[data-resize-handle]');
    if (resizeEl) {
      const corner = resizeEl.getAttribute('data-resize-handle') as ResizeCorner | null;
      if (corner && (corner === 'nw' || corner === 'ne' || corner === 'sw' || corner === 'se')) {
        const selectedIds = this.shapeSelection.getSelectedShapes().map((s) => s.id);
        if (selectedIds.length === 0) return;
        const union = this.svgManipulation.getUnionBBox(selectedIds);
        if (!union) return;
        this.resizeUnionStart = union;
        this.resizeHandle = corner;
        this.resizeSnapshot = this.svgManipulation.snapshotSelectionTransforms(selectedIds);
        for (const id of selectedIds) {
          this.svgManipulation.setShapeVisibility(id, false);
        }
        this.resizeLastUnion = union;
        this.resizeOverlayRect = this.svgBboxToOverlayPixels(union);
        this.createResizeGhost(union, selectedIds);
        this.isResizingSelection = true;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const rotateEl = target.closest?.('[data-rotate-handle]');
    if (rotateEl) {
      const selectedIds = this.shapeSelection.getSelectedShapes().map((s) => s.id);
      if (selectedIds.length === 0) return;
      const union = this.svgManipulation.getUnionBBox(selectedIds);
      if (!union) return;
      const unionCenterPivot = unionRotationPivot(union);
      const geomPivot = this.svgManipulation.getSelectionRotationPivot(selectedIds);
      const pivot = geomPivot ?? unionCenterPivot;
      this.rotateUnionStart = union;
      this.rotatePivotDoc = pivot;
      this.rotateAccumulatedRad = 0;
      this.rotateSnapshot = this.svgManipulation.snapshotSelectionTransforms(selectedIds);
      for (const id of selectedIds) {
        this.svgManipulation.setShapeVisibility(id, false);
      }
      const p0 = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (!p0) {
        for (const id of selectedIds) {
          this.svgManipulation.setShapeVisibility(id, true);
        }
        this.rotateUnionStart = null;
        this.rotatePivotDoc = null;
        this.rotateSnapshot = new Map();
        return;
      }
      this.rotateLastPointerSvg = p0;
      if (!this.createRotateGhost(union, selectedIds)) {
        for (const id of selectedIds) {
          this.svgManipulation.setShapeVisibility(id, true);
        }
        this.rotateUnionStart = null;
        this.rotatePivotDoc = null;
        this.rotateSnapshot = new Map();
        this.rotateLastPointerSvg = null;
        return;
      }
      this.isRotatingSelection = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.isEditorContentShapeTarget(target)) {
      this.isSelectionMarquee = true;
      this.selectionMarqueeStart = { clientX: event.clientX, clientY: event.clientY };
      this.selectionMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
      event.preventDefault();
      return;
    }
    if (target.tagName === 'svg' || !target.id) return;
    if (!this.shapeSelection.isShapeSelected(target.id)) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    const selectedIds = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    for (const id of selectedIds) {
      this.svgManipulation.setShapeVisibility(id, false);
    }
    const svgInstance = this.svgManipulation.getSVGInstance();
    const shape = svgInstance?.findOne(`#${target.id}`) as SVGElement | undefined;
    const shapeEl = shape?.node as Element | undefined;
    if (selectedIds.length === 1) {
      const bbox = this.svgManipulation.getShapeBBox(target.id);
      if (!bbox) {
        this.svgManipulation.setShapeVisibility(target.id, true);
        return;
      }
      this.dragStartBbox = bbox;
      const shapeScreenRect =
        typeof (target as Element).getBoundingClientRect === 'function'
          ? (target as Element).getBoundingClientRect()
          : shapeEl!.getBoundingClientRect();

      this.createDragGhost(target.id, bbox, shapeScreenRect);
    } else {
      const unionBbox = this.svgManipulation.getUnionBBox(selectedIds);
      if (!unionBbox) {
        for (const id of selectedIds) this.svgManipulation.setShapeVisibility(id, true);
        return;
      }
      this.dragStartBbox = unionBbox;
      this.createUnionDragGhost(unionBbox, selectedIds);
    }
    if (this.dragGhostFragments.length === 0) {
      for (const id of selectedIds) {
        this.svgManipulation.setShapeVisibility(id, true);
      }
      return;
    }
    this.isDraggingShape = true;
    this.dragShapeIds = selectedIds;
    this.dragStartSvg = { x: point.x, y: point.y };
    this.dragSnapshot = this.svgManipulation.snapshotSelectionTransforms(selectedIds);
    event.preventDefault();
  }

  private createDragGhost(shapeId: string, bbox: { x: number; y: number; width: number; height: number }, shapeScreenRect: DOMRect): void {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const rootSvg = svgInstance.node as SVGSVGElement;
    const built = this.buildDragGhostShapeSubtree(shapeId, svgInstance, rootSvg);
    if (!built) return;
    const contentGroupEl = this.getEditorContentGroupEl(svgInstance);
    const shapeNode = svgInstance.findOne(`#${shapeId}`)?.node as Element | undefined;
    if (!contentGroupEl || !shapeNode) return;

    this.installGhostSessionDefs(rootSvg, built.urlRefs);
    const prefix = this.ghostDefPrefix ?? '';
    if (built.urlRefs.size > 0) {
      this.rewriteGhostUrlRefs(built.subtree, prefix, built.urlRefs);
    }

    const frag = this.mountGhostFragment(svgInstance, contentGroupEl, shapeNode, bbox, built.subtree);
    this.dragGhostFragments = [frag];

    const overlayContainer = this.highlightOverlayContainer()?.nativeElement;
    this.dragOverlayRect = overlayContainer
      ? {
          x: shapeScreenRect.left - overlayContainer.getBoundingClientRect().left,
          y: shapeScreenRect.top - overlayContainer.getBoundingClientRect().top,
          width: shapeScreenRect.width,
          height: shapeScreenRect.height
        }
      : this.svgBboxToOverlayPixels(bbox);
    this.cdr.detectChanges();
  }

  /** Collect `url(#id)` targets from `clip-path` and `mask` attributes on `root` and its descendants. */
  private collectClipAndMaskUrlRefsFromElementTree(root: Element): Set<string> {
    const refs = new Set<string>();
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    all.forEach((el) => {
      const cp = el.getAttribute('clip-path');
      const mk = el.getAttribute('mask');
      [cp, mk].forEach((val) => {
        if (!val) return;
        const m = val.match(/url\(#([^)]+)\)/i);
        if (m?.[1]) refs.add(m[1]);
      });
    });
    return refs;
  }

  /**
   * Clone a shape plus the ancestor chain down to `[data-editor-content-group]` (same as single-shape drag ghost)
   * so nested `transform` / `clip-path` on groups is preserved. Leaf-only clones collapse local path geometry to one origin.
   */
  private buildDragGhostShapeSubtree(
    shapeId: string,
    svgInstance: Svg,
    rootSvg: SVGSVGElement
  ): { subtree: Element; urlRefs: Set<string> } | null {
    const shape = svgInstance.findOne(`#${shapeId}`) as SVGElement | undefined;
    if (!shape?.node) return null;
    const shapeNode = shape.node as Element;
    const contentGroup = shapeNode.closest?.('[data-editor-content-group]');
    if (!contentGroup) return null;
    const chain: Element[] = [];
    let cur: Element | null = shapeNode;
    while (cur && cur !== rootSvg && cur !== contentGroup) {
      chain.push(cur);
      cur = cur.parentElement;
    }
    if (chain.length === 0) return null;
    let subtree = chain[0].cloneNode(true) as Element;
    for (let i = 1; i < chain.length; i++) {
      const parentClone = chain[i].cloneNode(false) as Element;
      parentClone.appendChild(subtree);
      subtree = parentClone;
    }
    const urlRefs = this.collectClipAndMaskUrlRefsFromElementTree(subtree);
    const clonedShape = subtree.matches?.(`#${shapeId}`)
      ? subtree
      : (subtree.querySelector?.(`#${shapeId}`) as Element | null);
    if (clonedShape) {
      clonedShape.setAttribute('visibility', 'visible');
    }
    // Ghost clones must not reuse document ids or `findOne('#id')` / translate commit target the clone.
    this.stripIdsFromGhostSubtree(subtree);
    return { subtree, urlRefs };
  }

  private stripIdsFromGhostSubtree(root: Element): void {
    const walk = (el: Element) => {
      el.removeAttribute('id');
      el.removeAttribute('xml:id');
      for (const c of Array.from(el.children)) walk(c);
    };
    walk(root);
  }

  private getEditorContentGroupEl(svgInstance: Svg): Element | null {
    const cg = svgInstance.findOne('[data-editor-content-group]');
    return cg?.node ? (cg.node as Element) : null;
  }

  private clearGhostSessionDefs(): void {
    for (const el of this.ghostDefElements) {
      el.parentNode?.removeChild(el);
    }
    this.ghostDefElements = [];
    this.ghostDefPrefix = null;
  }

  private installGhostSessionDefs(rootSvg: SVGSVGElement, urlRefs: Set<string>): void {
    if (urlRefs.size === 0) return;
    if (!this.ghostDefPrefix) {
      this.ghostDefPrefix = `__eg_${Math.random().toString(36).slice(2)}_`;
    }
    const prefix = this.ghostDefPrefix;
    const defs = SVG(rootSvg).defs();
    urlRefs.forEach((id) => {
      const src = rootSvg.getElementById(id);
      if (!src) return;
      const clone = src.cloneNode(true) as Element;
      clone.id = `${prefix}${id}`;
      defs.node.appendChild(clone);
      this.ghostDefElements.push(clone);
    });
  }

  private rewriteGhostUrlRefs(root: Element, prefix: string, urlRefIds: Set<string>): void {
    if (urlRefIds.size === 0) return;
    const rewrite = (val: string): string => {
      let out = val;
      for (const id of urlRefIds) {
        out = out.split(`url(#${id})`).join(`url(#${prefix}${id})`);
      }
      return out;
    };
    const walk = (el: Element) => {
      for (const name of ['clip-path', 'mask', 'fill', 'stroke', 'filter']) {
        const v = el.getAttribute(name);
        if (v) el.setAttribute(name, rewrite(v));
      }
      const st = el.getAttribute('style');
      if (st) el.setAttribute('style', rewrite(st));
      for (const c of Array.from(el.children)) walk(c);
    };
    walk(root);
  }

  /**
   * One nested &lt;svg&gt; per selected shape, inserted **before** that shape, so SVG paint order
   * matches non-selected siblings between the selection.
   */
  private mountGhostFragment(
    svgInstance: Svg,
    contentGroupEl: Element,
    insertBefore: Element,
    unionBbox: { x: number; y: number; width: number; height: number },
    subtree: Element
  ): GhostPreviewFragment {
    const outer = SVG().group();
    outer.attr(EDITOR_GHOST_ATTR, 'true');
    outer.attr('pointer-events', 'none');

    const uw = Math.max(unionBbox.width, GHOST_SVG_MIN_PX);
    const uh = Math.max(unionBbox.height, GHOST_SVG_MIN_PX);
    const nested = SVG().addTo(outer) as Svg;
    nested
      .attr({ x: unionBbox.x, y: unionBbox.y, width: uw, height: uh, overflow: 'visible', preserveAspectRatio: 'none' })
      .viewbox(0, 0, unionBbox.width, unionBbox.height)
      .size(uw, uh);
    const innerEl = nested.node as SVGSVGElement;
    innerEl.style.display = 'block';
    innerEl.style.verticalAlign = 'top';

    const worldToUnion = nested.group();
    worldToUnion.matrix(new Matrix().translate(-unionBbox.x, -unionBbox.y));
    worldToUnion.node.appendChild(subtree);

    contentGroupEl.insertBefore(outer.node, insertBefore);
    return { outerGroup: outer, nestedSvg: nested, worldToUnion };
  }

  private buildGhostFragmentsForUnion(svgInstance: Svg, unionBbox: BBox, selectedIds: string[]): GhostPreviewFragment[] {
    const rootSvg = svgInstance.node as SVGSVGElement;
    const contentGroupEl = this.getEditorContentGroupEl(svgInstance);
    if (!contentGroupEl) return [];

    const orderedIds = this.svgManipulation.getShapeIdsInDomOrder(selectedIds);
    const unionUrlRefs = new Set<string>();
    const builtList: { id: string; subtree: Element; urlRefs: Set<string> }[] = [];

    for (const id of orderedIds) {
      const built = this.buildDragGhostShapeSubtree(id, svgInstance, rootSvg);
      if (!built) continue;
      built.urlRefs.forEach((r) => unionUrlRefs.add(r));
      builtList.push({ id, subtree: built.subtree, urlRefs: built.urlRefs });
    }

    if (builtList.length === 0) return [];

    this.installGhostSessionDefs(rootSvg, unionUrlRefs);
    const prefix = this.ghostDefPrefix ?? '';

    const frags: GhostPreviewFragment[] = [];
    for (const { id, subtree } of builtList) {
      if (unionUrlRefs.size > 0) {
        this.rewriteGhostUrlRefs(subtree, prefix, unionUrlRefs);
      }
      const shapeNode = svgInstance.findOne(`#${id}`)?.node as Element | undefined;
      if (!shapeNode) continue;
      frags.push(this.mountGhostFragment(svgInstance, contentGroupEl, shapeNode, unionBbox, subtree));
    }
    return frags;
  }

  private createUnionDragGhost(
    unionBbox: { x: number; y: number; width: number; height: number },
    selectedIds: string[]
  ): void {
    this.dragOverlayRect = this.svgBboxToOverlayPixels(unionBbox);
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    this.dragGhostFragments = this.buildGhostFragmentsForUnion(svgInstance, unionBbox, selectedIds);
    this.cdr.detectChanges();
  }

  private removeDragGhost(): void {
    for (const f of this.dragGhostFragments) {
      f.outerGroup.remove();
    }
    this.dragGhostFragments = [];
    this.clearGhostSessionDefs();
  }

  private createResizeGhost(unionBbox: BBox, selectedIds: string[]): void {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    this.resizeGhostFragments = this.buildGhostFragmentsForUnion(svgInstance, unionBbox, selectedIds);
    this.cdr.detectChanges();
  }

  private updateResizeGhost(unionAfter: BBox): void {
    this.resizeOverlayRect = this.svgBboxToOverlayPixels(unionAfter);
    if (this.resizeGhostFragments.length === 0) return;
    if (!this.resizeOverlayRect) return;
    const uw = Math.max(unionAfter.width, GHOST_SVG_MIN_PX);
    const uh = Math.max(unionAfter.height, GHOST_SVG_MIN_PX);
    const m = new Matrix().translate(-unionAfter.x, -unionAfter.y);
    for (const f of this.resizeGhostFragments) {
      f.nestedSvg.attr({ x: unionAfter.x, y: unionAfter.y, width: uw, height: uh });
      f.nestedSvg.viewbox(0, 0, unionAfter.width, unionAfter.height);
      (f.nestedSvg as Svg).size(uw, uh);
      f.worldToUnion.matrix(m);
    }
    this.cdr.detectChanges();
  }

  private removeResizeGhost(): void {
    for (const f of this.resizeGhostFragments) {
      f.outerGroup.remove();
    }
    this.resizeGhostFragments = [];
    this.clearGhostSessionDefs();
  }

  /** @returns true if the ghost was created and appended */
  private createRotateGhost(unionBbox: BBox, selectedIds: string[]): boolean {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return false;
    this.rotateGhostFragments = this.buildGhostFragmentsForUnion(svgInstance, unionBbox, selectedIds);
    if (this.rotateGhostFragments.length === 0) return false;
    this.cdr.detectChanges();
    return true;
  }

  private updateRotateGhost(accumulatedRad: number): void {
    if (!this.rotateUnionStart || this.rotateGhostFragments.length === 0 || !this.rotatePivotDoc) {
      return;
    }
    const T = rotateGhostWorldToUnionMatrix(this.rotateUnionStart, this.rotatePivotDoc, accumulatedRad);
    for (const f of this.rotateGhostFragments) {
      f.worldToUnion.matrix(T);
    }
    this.cdr.detectChanges();
  }

  private removeRotateGhost(): void {
    for (const f of this.rotateGhostFragments) {
      f.outerGroup.remove();
    }
    this.rotateGhostFragments = [];
    this.clearGhostSessionDefs();
  }

  onCanvasClick(event: MouseEvent): void {
    const clickTarget = event.target as Element;
    if (this.dragJustEnded) {
      this.dragJustEnded = false;
      return;
    }
    if (this.resizeJustEnded) {
      this.resizeJustEnded = false;
      return;
    }
    if (this.rotateJustEnded) {
      this.rotateJustEnded = false;
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pan') {
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

    const svgElement =
      clickTarget.id && (this.svgManipulation.getSVGInstance()?.findOne(`#${clickTarget.id}`) as SVGElement);
    if (svgElement) {
      const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(svgElement);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(expanded);
      } else {
        this.shapeSelection.selectShapes(expanded);
      }
    } else {
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
    }
  }

  /** True when the event target is a user shape inside the editor content group (not stage chrome). */
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
