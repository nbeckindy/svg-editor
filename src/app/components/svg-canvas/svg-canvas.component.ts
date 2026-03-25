import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';
import { computeProportionalResizedUnion, type BBox, type ResizeCorner } from '../../utils/selection-resize';
import { MARQUEE_MIN_DRAG_PX } from '../../utils/marquee-selection';

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
      !this.isSelectionMarquee &&
      this.wrapperWidth > 0 &&
      !!this.lastBbox
    );
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
  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isResizingSelection && this.resizeOverlayRect) return this.resizeOverlayRect;
    if (this.isDraggingShape && this.dragOverlayRect) return this.dragOverlayRect;
    if (!this.lastBbox || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this._highlightRectCache = null;
      this._highlightRectCacheKey = '';
      return null;
    }
    const key = `${this.lastBbox.x}-${this.lastBbox.y}-${this.lastBbox.width}-${this.lastBbox.height}-${this.wrapperWidth}-${this.wrapperHeight}-${this.canvasView.scale}`;
    if (this._highlightRectCacheKey === key) {
      return this._highlightRectCache;
    }
    this._highlightRectCacheKey = key;
    this._highlightRectCache = this.svgBboxToOverlayPixels(this.lastBbox);
    return this._highlightRectCache;
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
  private dragGhostEl: HTMLElement | null = null;

  /** Proportional resize from corner handles (ghost preview; DOM updates on mouseup). */
  isResizingSelection = false;
  private resizeHandle: ResizeCorner | null = null;
  private resizeUnionStart: BBox | null = null;
  private resizeLastUnion: BBox | null = null;
  private resizeSnapshot: Map<string, Matrix> = new Map();
  private resizeGhostEl: HTMLElement | null = null;
  private resizeGhostInnerSvgEl: SVGSVGElement | null = null;
  /** Overlay pixels for selection outline during resize (matches ghost). */
  private resizeOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  /** After resize mouseup, ignore next canvas click so selection is not cleared. */
  private resizeJustEnded = false;

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

  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  onKeyUp(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
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
    if (this.isResizingSelection && this.resizeHandle && this.resizeUnionStart && this.resizeGhostEl) {
      const point = this.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (point) {
        const unionAfter = computeProportionalResizedUnion(this.resizeUnionStart, this.resizeHandle, point);
        this.resizeLastUnion = unionAfter;
        this.updateResizeGhost(unionAfter);
      }
      this.cdr.detectChanges();
      return;
    }
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape && this.dragGhostEl && this.dragStartSvg && this.dragStartBbox) {
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
          if (event.shiftKey) {
            if (hits.length > 0) {
              this.shapeSelection.mergeShapesIntoSelection(hits);
            }
          } else if (hits.length > 0) {
            this.shapeSelection.selectShapes(hits);
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
      this.svgManipulation.applyUnionScaleFromSnapshot(
        ids,
        this.resizeUnionStart,
        this.resizeLastUnion,
        this.resizeSnapshot,
        this.resizeHandle
      );
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
      this.resizeGhostInnerSvgEl = null;
      const unionBbox = this.svgManipulation.getUnionBBox(ids);
      if (unionBbox) {
        this.lastBbox = unionBbox;
        this._highlightRectCacheKey = '';
      }
      this.resizeJustEnded = true;
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
      for (const shapeId of this.dragShapeIds) {
        this.svgManipulation.translateShape(shapeId, dx, dy);
        this.svgManipulation.setShapeVisibility(shapeId, true);
      }
      this.removeDragGhost();
      this.dragOverlayRect = null;
      this.isDraggingShape = false;
      this.dragShapeIds = [];
      this.dragStartSvg = null;
      this.dragStartBbox = null;
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
    if (!this.dragGhostEl) return;
    const scr =
      this.overlayPixelsToFixedScreenRect(this.dragOverlayRect) ??
      this.svgDocumentBboxToFixedScreenRect(currentBbox);
    if (!scr) return;
    const w = Number.isFinite(scr.width) ? Math.max(0, scr.width) : 0;
    const h = Number.isFinite(scr.height) ? Math.max(0, scr.height) : 0;
    this.dragGhostEl.style.left = `${scr.left}px`;
    this.dragGhostEl.style.top = `${scr.top}px`;
    this.dragGhostEl.style.width = `${w}px`;
    this.dragGhostEl.style.height = `${h}px`;
    const innerSvg = this.dragGhostEl.querySelector('svg');
    this.applyGhostWrapperSvgLayout(this.dragGhostEl, innerSvg);
    this.cdr.detectChanges();
  }

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService,
    public editorTool: EditorToolService,
    public canvasView: CanvasViewService,
    private cdr: ChangeDetectorRef
  ) {
    effect(() => {
      this.svgContent();
      this.canvasView.resetZoom();
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
    const vb = this.parseOverlayViewBox();
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!vb || !mainSvg) return null;
    const r = mainSvg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
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

  /**
   * Ghost wrappers are fixed-position divs with an inner root SVG from SVG.js. Default `display:inline`
   * on SVG participates in line-box / baseline layout; when width/height are tiny, the painted SVG
   * shifts vertically vs overlay geometry (looks like “downward drift”).
   */
  private applyGhostWrapperSvgLayout(wrapper: HTMLElement, innerSvg: SVGSVGElement | null): void {
    wrapper.style.lineHeight = '0';
    if (innerSvg) {
      innerSvg.style.display = 'block';
      innerSvg.style.verticalAlign = 'top';
    }
  }

  private initializeSVG(): void {
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
    if (!this.isEditorContentShapeTarget(target)) {
      this.isSelectionMarquee = true;
      this.selectionMarqueeStart = { clientX: event.clientX, clientY: event.clientY };
      this.selectionMarqueeEnd = { clientX: event.clientX, clientY: event.clientY };
      event.preventDefault();
      return;
    }
    if (target.tagName === 'svg' || !target.id) return;
    if (!this.shapeSelection.isShapeSelected(target.id)) return;
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
    this.isDraggingShape = true;
    this.dragShapeIds = selectedIds;
    this.dragStartSvg = { x: point.x, y: point.y };
    event.preventDefault();
  }

  private createDragGhost(shapeId: string, bbox: { x: number; y: number; width: number; height: number }, shapeScreenRect: DOMRect): void {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (!shape?.node) return;
    const ghostLeft = shapeScreenRect.left;
    const ghostTop = shapeScreenRect.top;
    const ghostWidth = shapeScreenRect.width;
    const ghostHeight = shapeScreenRect.height;
    const overlayContainer = this.highlightOverlayContainer()?.nativeElement;
    const dragOverlayRect = overlayContainer
      ? {
          x: shapeScreenRect.left - overlayContainer.getBoundingClientRect().left,
          y: shapeScreenRect.top - overlayContainer.getBoundingClientRect().top,
          width: shapeScreenRect.width,
          height: shapeScreenRect.height
        }
      : this.svgBboxToOverlayPixels(bbox);
    const wrapper = document.createElement('div');
    wrapper.className = 'drag-ghost';
    wrapper.style.position = 'fixed';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    wrapper.style.overflow = 'visible';
    wrapper.style.left = ghostLeft + 'px';
    wrapper.style.top = ghostTop + 'px';
    wrapper.style.width = ghostWidth + 'px';
    wrapper.style.height = ghostHeight + 'px';
    
    const ghostSvgInstance = SVG()
      .addTo(wrapper)
      .size(ghostWidth, ghostHeight)
      .viewbox(0, 0, bbox.width, bbox.height)
      .attr({ overflow: 'visible', preserveAspectRatio: 'none' });
    const worldToBbox = ghostSvgInstance.group();
    worldToBbox.matrix(new Matrix().translate(-bbox.x, -bbox.y));
    const ghostClone = shape.clone(true, true) as SVGElement;
    if (typeof ghostClone?.attr === 'function') {
      ghostClone.attr('visibility', 'visible');
    }
    worldToBbox.add(ghostClone);
    this.applyGhostWrapperSvgLayout(wrapper, ghostSvgInstance.node as SVGSVGElement);
    document.body.appendChild(wrapper);
    this.dragGhostEl = wrapper;
    this.dragOverlayRect = dragOverlayRect;
    this.cdr.detectChanges();
  }

  private createUnionDragGhost(
    unionBbox: { x: number; y: number; width: number; height: number },
    selectedIds: string[]
  ): void {
    this.dragOverlayRect = this.svgBboxToOverlayPixels(unionBbox);
    const scr =
      this.overlayPixelsToFixedScreenRect(this.dragOverlayRect) ??
      this.svgDocumentBboxToFixedScreenRect(unionBbox);
    if (!scr) return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const ghostW = Number.isFinite(scr.width) ? Math.max(0, scr.width) : 0;
    const ghostH = Number.isFinite(scr.height) ? Math.max(0, scr.height) : 0;
    const svgW = ghostW > 0 ? ghostW : GHOST_SVG_MIN_PX;
    const svgH = ghostH > 0 ? ghostH : GHOST_SVG_MIN_PX;
    const wrapper = document.createElement('div');
    wrapper.className = 'drag-ghost drag-ghost-union';
    wrapper.style.position = 'fixed';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    wrapper.style.left = `${scr.left}px`;
    wrapper.style.top = `${scr.top}px`;
    wrapper.style.width = `${ghostW}px`;
    wrapper.style.height = `${ghostH}px`;
    wrapper.style.overflow = 'visible';
    // ViewBox (0,0, w, h) so translated clones at (0,0)-(w,h) fill the ghost; viewBox was (unionBbox.x, unionBbox.y, ...) which didn't match post-dmove content
    const ghostSvg = SVG()
      .addTo(wrapper)
      .size(svgW, svgH)
      .viewbox(0, 0, unionBbox.width, unionBbox.height)
      .attr({ overflow: 'visible', preserveAspectRatio: 'none' });
    const worldToUnion = ghostSvg.group();
    worldToUnion.matrix(new Matrix().translate(-unionBbox.x, -unionBbox.y));
    const orderedIds = this.svgManipulation.getShapeIdsInDomOrder(selectedIds);
    for (const id of orderedIds) {
      const shape = svgInstance.findOne(`#${id}`) as SVGElement | undefined;
      if (!shape?.node) continue;
      const bbox = this.svgManipulation.getShapeBBox(id);
      if (!bbox) continue;
      const clone = shape.clone(true, true) as SVGElement;
      if (typeof clone?.attr === 'function') {
        clone.attr('visibility', 'visible');
      }
      worldToUnion.add(clone);
    }
    this.applyGhostWrapperSvgLayout(wrapper, ghostSvg.node as SVGSVGElement);
    document.body.appendChild(wrapper);
    this.dragGhostEl = wrapper;
    this.cdr.detectChanges();
  }

  private removeDragGhost(): void {
    if (this.dragGhostEl?.parentNode) {
      this.dragGhostEl.parentNode.removeChild(this.dragGhostEl);
    }
    this.dragGhostEl = null;
  }

  private createResizeGhost(unionBbox: BBox, selectedIds: string[]): void {
    const o = this.svgBboxToOverlayPixels(unionBbox);
    const scr = this.overlayPixelsToFixedScreenRect(o) ?? this.svgDocumentBboxToFixedScreenRect(unionBbox);
    if (!scr) return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const ghostW = Number.isFinite(scr.width) ? Math.max(0, scr.width) : 0;
    const ghostH = Number.isFinite(scr.height) ? Math.max(0, scr.height) : 0;
    const svgW = ghostW > 0 ? ghostW : GHOST_SVG_MIN_PX;
    const svgH = ghostH > 0 ? ghostH : GHOST_SVG_MIN_PX;
    const wrapper = document.createElement('div');
    wrapper.className = 'drag-ghost resize-ghost';
    wrapper.style.position = 'fixed';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    wrapper.style.left = `${scr.left}px`;
    wrapper.style.top = `${scr.top}px`;
    wrapper.style.width = `${ghostW}px`;
    wrapper.style.height = `${ghostH}px`;
    wrapper.style.overflow = 'visible';
    const ghostSvg = SVG()
      .addTo(wrapper)
      .size(svgW, svgH)
      .viewbox(0, 0, unionBbox.width, unionBbox.height)
      .attr({ overflow: 'visible', preserveAspectRatio: 'none' });
    const svgNode = ghostSvg.node as SVGSVGElement;
    this.resizeGhostInnerSvgEl = svgNode;
    const worldToUnion = ghostSvg.group();
    worldToUnion.matrix(new Matrix().translate(-unionBbox.x, -unionBbox.y));
    const orderedIds = this.svgManipulation.getShapeIdsInDomOrder(selectedIds);
    for (const id of orderedIds) {
      const shape = svgInstance.findOne(`#${id}`) as SVGElement | undefined;
      if (!shape?.node) continue;
      const bbox = this.svgManipulation.getShapeBBox(id);
      if (!bbox) continue;
      const clone = shape.clone(true, true) as SVGElement;
      if (typeof clone?.attr === 'function') {
        clone.attr('visibility', 'visible');
      }
      worldToUnion.add(clone);
    }
    this.applyGhostWrapperSvgLayout(wrapper, svgNode);
    document.body.appendChild(wrapper);
    this.resizeGhostEl = wrapper;
    this.cdr.detectChanges();
  }

  private updateResizeGhost(unionAfter: BBox): void {
    this.resizeOverlayRect = this.svgBboxToOverlayPixels(unionAfter);
    if (!this.resizeGhostEl || !this.resizeGhostInnerSvgEl) return;
    if (!this.resizeOverlayRect) return;
    const scr =
      this.overlayPixelsToFixedScreenRect(this.resizeOverlayRect) ??
      this.svgDocumentBboxToFixedScreenRect(unionAfter);
    if (!scr) return;
    const w = Number.isFinite(scr.width) ? Math.max(0, scr.width) : 0;
    const h = Number.isFinite(scr.height) ? Math.max(0, scr.height) : 0;
    const svgW = w > 0 ? w : GHOST_SVG_MIN_PX;
    const svgH = h > 0 ? h : GHOST_SVG_MIN_PX;
    this.resizeGhostEl.style.left = `${scr.left}px`;
    this.resizeGhostEl.style.top = `${scr.top}px`;
    this.resizeGhostEl.style.width = `${w}px`;
    this.resizeGhostEl.style.height = `${h}px`;
    // Match inner <svg> pixel size to the wrapper. CSS scale()+transform-origin on a small svg
    // used the svg's box, not the resized wrapper — wrong anchor for nw/ne/sw (se was OK).
    (SVG(this.resizeGhostInnerSvgEl) as Svg).size(svgW, svgH);
    this.resizeGhostInnerSvgEl.style.transform = '';
    this.resizeGhostInnerSvgEl.style.transformOrigin = '';
    this.applyGhostWrapperSvgLayout(this.resizeGhostEl, this.resizeGhostInnerSvgEl);
    this.cdr.detectChanges();
  }

  private removeResizeGhost(): void {
    if (this.resizeGhostEl?.parentNode) {
      this.resizeGhostEl.parentNode.removeChild(this.resizeGhostEl);
    }
    this.resizeGhostEl = null;
    this.resizeGhostInnerSvgEl = null;
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
        this.updateViewBoxOverlayRect();
        this.cdr.detectChanges();
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
      const properties = this.svgManipulation.getShapeProperties(svgElement);
      if (event.shiftKey) {
        this.shapeSelection.toggleShapeInSelection(properties);
      } else {
        this.shapeSelection.selectShape(properties);
      }
      this.svgManipulation.highlightShape(properties.id);
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
