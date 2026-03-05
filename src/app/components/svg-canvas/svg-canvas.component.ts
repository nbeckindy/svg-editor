import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect } from '@angular/core';
import { SVG, Element as SVGElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';

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
  readonly svgContent = input<string>('');
  readonly svgContainer = viewChild<ElementRef<HTMLElement>>('svgContainer');
  readonly zoomWrapper = viewChild<ElementRef<HTMLElement>>('zoomWrapper');
  readonly highlightOverlayContainer = viewChild<ElementRef<HTMLElement>>('highlightOverlayContainer');
  altKeyPressed = false;
  isPanning = false;
  overlayViewBox = '0 0 100 100';
  wrapperWidth = 0;
  wrapperHeight = 0;
  get overlayWidthPx(): number {
    return this.wrapperWidth * this.canvasView.scale;
  }
  get overlayHeightPx(): number {
    return this.wrapperHeight * this.canvasView.scale;
  }
  /** SVG-coordinate bbox of selected shape; overlay pixel rect is derived from this so zoom updates the highlight. */
  private lastBbox: { x: number; y: number; width: number; height: number } | null = null;
  /** During drag, overlay rect in overlay-container pixel coords so the blue outline follows the ghost. */
  private dragOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  /** Cache key and result so the getter is stable across re-reads in the same CD cycle (avoids NG0100). */
  private _highlightRectCache: { x: number; y: number; width: number; height: number } | null = null;
  private _highlightRectCacheKey = '';
  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isDraggingShape && this.dragOverlayRect) return this.dragOverlayRect;
    if (!this.lastBbox || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this._highlightRectCache = null;
      this._highlightRectCacheKey = '';
      return null;
    }
    const key = `${this.lastBbox.x}-${this.lastBbox.y}-${this.wrapperWidth}-${this.wrapperHeight}-${this.canvasView.scale}`;
    if (this._highlightRectCacheKey === key) return this._highlightRectCache;
    this._highlightRectCacheKey = key;
    this._highlightRectCache = this.svgBboxToOverlayPixels(this.lastBbox);
    return this._highlightRectCache;
  }
  /** Set only in syncOverlayViewBox so it stays stable during CD. Document viewBox stroke drawn in overlay so it stays constant width at any zoom. */
  private _viewBoxOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  get viewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    return this._viewBoxOverlayRect;
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

  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  onKeyUp(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  onDocumentMouseMove(event: MouseEvent): void {
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape && this.dragGhostEl && this.dragStartSvg && this.dragStartBbox) {
      const containerRect = this.svgContainer()?.nativeElement?.getBoundingClientRect();
      if (containerRect) {
        const currentSvg = this.canvasView.screenToSvg(event.clientX, event.clientY, containerRect);
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
  }

  onDocumentMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.isPanning = false;
    if (this.isDraggingShape && this.dragShapeIds.length > 0 && this.dragStartSvg) {
      const rect = this.svgContainer()?.nativeElement?.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (rect) {
        const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
        if (point) {
          dx = point.x - this.dragStartSvg.x;
          dy = point.y - this.dragStartSvg.y;
        }
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
    const zoomEl = this.zoomWrapper()?.nativeElement;
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const rect = zoomEl?.getBoundingClientRect() ?? overlayEl?.getBoundingClientRect();
    if (!rect) return;
    this.dragGhostEl.style.left = `${rect.left + this.dragOverlayRect.x}px`;
    this.dragGhostEl.style.top = `${rect.top + this.dragOverlayRect.y}px`;
    this.dragGhostEl.style.width = `${this.dragOverlayRect.width}px`;
    this.dragGhostEl.style.height = `${this.dragOverlayRect.height}px`;
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
    if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      this.wrapperWidth = el.offsetWidth;
      this.wrapperHeight = el.offsetHeight;
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
    if (target.tagName === 'svg' || !target.id) return;
    if (!this.shapeSelection.isShapeSelected(target.id)) return;
    const rect = this.svgContainer()?.nativeElement?.getBoundingClientRect();
    if (!rect) return;
    const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
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
    const ghostClone = shape.clone(true, true) as SVGElement;
    if (typeof ghostClone?.attr === 'function') {
      ghostClone.attr('visibility', 'visible').dmove(-bbox.x, -bbox.y);
    }
    ghostSvgInstance.add(ghostClone);
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
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const zoomEl = this.zoomWrapper()?.nativeElement;
    const overlayRect = overlayEl?.getBoundingClientRect();
    const zoomRect = zoomEl?.getBoundingClientRect();
    // svgBboxToOverlayPixels returns offsets from the zoom wrapper; use it as origin so ghost aligns
    const containerRect = zoomRect ?? overlayRect;
    if (!containerRect) return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const ghostW = Math.max(1, this.dragOverlayRect.width);
    const ghostH = Math.max(1, this.dragOverlayRect.height);
    const wrapper = document.createElement('div');
    wrapper.className = 'drag-ghost drag-ghost-union';
    wrapper.style.position = 'fixed';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    wrapper.style.left = `${containerRect.left + this.dragOverlayRect.x}px`;
    wrapper.style.top = `${containerRect.top + this.dragOverlayRect.y}px`;
    wrapper.style.width = `${ghostW}px`;
    wrapper.style.height = `${ghostH}px`;
    wrapper.style.overflow = 'visible';
    // ViewBox (0,0, w, h) so translated clones at (0,0)-(w,h) fill the ghost; viewBox was (unionBbox.x, unionBbox.y, ...) which didn't match post-dmove content
    const ghostSvg = SVG()
      .addTo(wrapper)
      .size(ghostW, ghostH)
      .viewbox(0, 0, unionBbox.width, unionBbox.height)
      .attr({ overflow: 'visible', preserveAspectRatio: 'none' });
    const orderedIds = this.svgManipulation.getShapeIdsInDomOrder(selectedIds);
    for (const id of orderedIds) {
      const shape = svgInstance.findOne(`#${id}`) as SVGElement | undefined;
      if (!shape?.node) continue;
      const bbox = this.svgManipulation.getShapeBBox(id);
      if (!bbox) continue;
      const clone = shape.clone(true, true) as SVGElement;
      if (typeof clone?.attr === 'function') {
        clone.attr('visibility', 'visible').dmove(-unionBbox.x, -unionBbox.y);
      }
      ghostSvg.add(clone);
    }
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

  onCanvasClick(event: MouseEvent): void {
    const clickTarget = event.target as Element;
    if (this.dragJustEnded) {
      this.dragJustEnded = false;
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pan') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'zoom') {
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
}
