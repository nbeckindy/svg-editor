import { Component, Input, AfterViewInit, ViewChild, ElementRef, OnChanges, HostListener, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { SVG, Element as SVGElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <div
      class="canvas-container"
      [class.zoom-mode]="(editorTool.currentTool$ | async) === 'zoom'"
      [class.zoom-mode-out]="(editorTool.currentTool$ | async) === 'zoom' && altKeyPressed"
      [class.pan-mode]="(editorTool.currentTool$ | async) === 'pan'"
      [class.pan-dragging]="isPanning">
      <div class="svg-canvas" (click)="onCanvasClick($event)" (mousedown)="onCanvasMouseDown($event)">
        <div class="canvas-inner">
          <div
            #zoomWrapper
            class="svg-zoom-wrapper"
            [style.transform]="'translate(' + canvasView.panX + 'px,' + canvasView.panY + 'px) scale(' + canvasView.scale + ')'"
            style="transform-origin: 0 0">
            <div #svgContainer></div>
          </div>
          <div
            #highlightOverlayContainer
            class="highlight-overlay-container"
            [style.left.px]="canvasView.panX"
            [style.top.px]="canvasView.panY"
            [style.width.px]="overlayWidthPx"
            [style.height.px]="overlayHeightPx">
            <svg
              class="highlight-overlay"
              [attr.viewBox]="'0 0 ' + overlayWidthPx + ' ' + overlayHeightPx"
              preserveAspectRatio="none"
              overflow="visible">
              @if (highlightRect) {
                <rect
                  [attr.x]="highlightRect.x"
                  [attr.y]="highlightRect.y"
                  [attr.width]="highlightRect.width"
                  [attr.height]="highlightRect.height"
                  fill="none"
                  stroke="#2196F3"
                  stroke-width="2"/>
              }
            </svg>
          </div>
        </div>
      </div>
      @if (!svgContent) {
        <div class="placeholder">
          <p>Load an SVG file to begin editing</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      background: white;
    }
    .svg-canvas {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .svg-zoom-wrapper {
      display: inline-block;
    }
    .canvas-inner {
      position: relative;
      display: inline-block;
    }
    .highlight-overlay-container {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
      overflow: visible;
    }
    .highlight-overlay-container .highlight-overlay {
      width: 100%;
      height: 100%;
      display: block;
    }
    .placeholder {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #999;
    }
    .canvas-container.zoom-mode {
      cursor: zoom-in;
    }
    .canvas-container.zoom-mode-out {
      cursor: zoom-out;
    }
    .canvas-container.pan-mode {
      cursor: grab;
    }
    .canvas-container.pan-mode.pan-dragging {
      cursor: grabbing;
    }
  `]
})
export class SvgCanvasComponent implements AfterViewInit, OnChanges, OnInit, OnDestroy {
  @Input() svgContent: string = '';
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLElement>;
  @ViewChild('zoomWrapper') zoomWrapper!: ElementRef<HTMLElement>;
  @ViewChild('highlightOverlayContainer') highlightOverlayContainer!: ElementRef<HTMLElement>;
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
  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isDraggingShape && this.dragOverlayRect) return this.dragOverlayRect;
    return this.lastBbox && this.wrapperWidth > 0 && this.wrapperHeight > 0
      ? this.svgBboxToOverlayPixels(this.lastBbox)
      : null;
  }
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private selectionSub?: Subscription;

  /** Shape drag: when user drags the selected element we hide it and show a ghost until mouseup. */
  isDraggingShape = false;
  private dragShapeId: string | null = null;
  private dragStartSvg: { x: number; y: number } | null = null;
  private dragStartBbox: { x: number; y: number; width: number; height: number } | null = null;
  private dragGhostEl: HTMLElement | null = null;

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (this.isPanning) {
      this.canvasView.setPan(
        this.panStartX + (event.clientX - this.panStartClientX),
        this.panStartY + (event.clientY - this.panStartClientY)
      );
    } else if (this.isDraggingShape && this.dragGhostEl && this.dragStartSvg && this.dragStartBbox) {
      const containerRect = this.svgContainer?.nativeElement?.getBoundingClientRect();
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

  @HostListener('document:mouseup', ['$event'])
  onDocumentMouseUp(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.isPanning = false;
    if (this.isDraggingShape && this.dragShapeId && this.dragStartSvg) {
      const rect = this.svgContainer?.nativeElement?.getBoundingClientRect();
      if (rect) {
        const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
        if (point) {
          const dx = point.x - this.dragStartSvg.x;
          const dy = point.y - this.dragStartSvg.y;
          this.svgManipulation.translateShape(this.dragShapeId, dx, dy);
        }
      }
      this.svgManipulation.setShapeVisibility(this.dragShapeId, true);
      this.removeDragGhost();
      this.dragOverlayRect = null;
      this.isDraggingShape = false;
      this.dragShapeId = null;
      this.dragStartSvg = null;
      this.dragStartBbox = null;
      this.cdr.detectChanges();
    }
  }

  private updateDragGhostAndOverlay(currentBbox: { x: number; y: number; width: number; height: number }): void {
    this.dragOverlayRect = this.svgBboxToOverlayPixels(currentBbox);
    if (!this.dragGhostEl) return;
    const overlayContainer = this.highlightOverlayContainer?.nativeElement;
    const rect = overlayContainer?.getBoundingClientRect() ?? this.zoomWrapper?.nativeElement?.getBoundingClientRect();
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
  ) {}

  ngOnInit(): void {
    this.selectionSub = this.shapeSelection.selectedShape$.subscribe((shape) => {
      setTimeout(() => {
        if (!shape) {
          this.lastBbox = null;
        } else {
          this.syncOverlayViewBox();
          const bbox = this.svgManipulation.getShapeBBox(shape.id);
          this.lastBbox = bbox;
        }
        this.cdr.detectChanges();
      }, 0);
    });
  }

  ngOnDestroy(): void {
    this.selectionSub?.unsubscribe();
  }

  ngAfterViewInit(): void {
    if (this.svgContent) {
      this.initializeSVG();
    }
  }

  ngOnChanges(): void {
    if (this.svgContainer && this.svgContent) {
      this.initializeSVG();
    }
  }

  private syncOverlayViewBox(): void {
    const mainSvg = this.svgContainer?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;
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
    const el = this.zoomWrapper?.nativeElement;
    if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      this.wrapperWidth = el.offsetWidth;
      this.wrapperHeight = el.offsetHeight;
    }
  }

  /** Convert SVG viewBox bbox to overlay pixel coordinates. Uses the main SVG viewport and its position within the wrapper so alignment matches the browser. */
  private svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    // #region agent log
    const _logInput = { bbox, overlayViewBox: this.overlayViewBox, wrapperWidth: this.wrapperWidth, wrapperHeight: this.wrapperHeight, canvasScale: this.canvasView.scale };
    // #endregion
    const parts = this.overlayViewBox.split(/\s+/);
    const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
    const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
    const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
    const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
    const canvasScale = this.canvasView.scale;
    const mainSvg = this.svgContainer?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      const sx = (this.wrapperWidth * canvasScale) / vbW;
      const sy = (this.wrapperHeight * canvasScale) / vbH;
      const out = { x: (bbox.x - vbMinX) * sx, y: (bbox.y - vbMinY) * sy, width: bbox.width * sx, height: bbox.height * sy };
      fetch('http://127.0.0.1:7242/ingest/a5b546a5-24cc-4fd4-b0a7-1b08d2ef458e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'svg-canvas.component.ts:svgBboxToOverlayPixels',message:'branch noMainSvg',data:{..._logInput,out,hypothesisId:'H1,H4,H5'},timestamp:Date.now()})}).catch(()=>{});
      return out;
    }
    const wrapperRect = this.zoomWrapper?.nativeElement?.getBoundingClientRect();
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a5b546a5-24cc-4fd4-b0a7-1b08d2ef458e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'svg-canvas.component.ts:svgBboxToOverlayPixels',message:'mainSvg branch',data:{..._logInput,usingVisualRects,wrapperRect:wrapperRect?{left:wrapperRect.left,top:wrapperRect.top,width:wrapperRect.width,height:wrapperRect.height}:null,svgRectLeft:svgRect.left,svgRectTop:svgRect.top,svgLeftInWrapper,svgTopInWrapper,hypothesisId:'H2,H3'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
      const out = { x: usingVisualRects ? px : px * canvasScale, y: usingVisualRects ? py : py * canvasScale, width: bbox.width * sx, height: bbox.height * sy };
      fetch('http://127.0.0.1:7242/ingest/a5b546a5-24cc-4fd4-b0a7-1b08d2ef458e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'svg-canvas.component.ts:svgBboxToOverlayPixels',message:'branch isNone',data:{..._logInput,usingVisualRects,out,hypothesisId:'H1,H2'},timestamp:Date.now()})}).catch(()=>{});
      return out;
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
      const out = { x: svgLeftInWrapper + viewportX, y: svgTopInWrapper + viewportY, width: bbox.width * scaleFit, height: bbox.height * scaleFit };
      fetch('http://127.0.0.1:7242/ingest/a5b546a5-24cc-4fd4-b0a7-1b08d2ef458e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'svg-canvas.component.ts:svgBboxToOverlayPixels',message:'branch meet usingVisualRects',data:{..._logInput,usingVisualRects,viewportX,viewportY,out,hypothesisId:'H1,H2'},timestamp:Date.now()})}).catch(()=>{});
      return out;
    }
    const x = (svgLeftInWrapper + viewportX) * canvasScale;
    const y = (svgTopInWrapper + viewportY) * canvasScale;
    const w = bbox.width * scaleFit * canvasScale;
    const h = bbox.height * scaleFit * canvasScale;
    const out = { x, y, width: w, height: h };
    fetch('http://127.0.0.1:7242/ingest/a5b546a5-24cc-4fd4-b0a7-1b08d2ef458e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'svg-canvas.component.ts:svgBboxToOverlayPixels',message:'branch meet fallback',data:{..._logInput,usingVisualRects,out,hypothesisId:'H1,H2'},timestamp:Date.now()})}).catch(()=>{});
    return out;
  }

  private initializeSVG(): void {
    this.svgManipulation.initializeSVG(this.svgContainer.nativeElement, this.svgContent);
    this.canvasView.init();
    this.syncOverlayViewBox();
    const shape = this.shapeSelection.getSelectedShape();
    if (shape) {
      this.lastBbox = this.svgManipulation.getShapeBBox(shape.id);
    } else {
      this.lastBbox = null;
    }
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
    if (this.editorTool.getCurrentTool() !== 'selector' || !this.svgContent || !this.canvasView.isInitialized()) return;
    const target = event.target as Element;
    if (target.tagName === 'svg' || !target.id) return;
    const selected = this.shapeSelection.getSelectedShape();
    if (!selected || selected.id !== target.id) return;
    const rect = this.svgContainer?.nativeElement?.getBoundingClientRect();
    if (!rect) return;
    const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
    if (!point) return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    const shape = svgInstance?.findOne(`#${selected.id}`) as SVGElement | undefined;
    const shapeEl = shape?.node as Element | undefined;
    if (!shapeEl) return;
    const bbox = this.svgManipulation.getShapeBBox(selected.id);
    if (!bbox) return;
    this.dragStartBbox = bbox;
    const shapeScreenRect =
      typeof (target as Element).getBoundingClientRect === 'function'
        ? (target as Element).getBoundingClientRect()
        : shapeEl.getBoundingClientRect();
    this.svgManipulation.setShapeVisibility(selected.id, false);
    this.createDragGhost(selected.id, bbox, shapeScreenRect);
    this.isDraggingShape = true;
    this.dragShapeId = selected.id;
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
    const overlayContainer = this.highlightOverlayContainer?.nativeElement;
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

  private removeDragGhost(): void {
    if (this.dragGhostEl?.parentNode) {
      this.dragGhostEl.parentNode.removeChild(this.dragGhostEl);
    }
    this.dragGhostEl = null;
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pan') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'zoom') {
      if (!this.svgContent || !this.canvasView.isInitialized()) return;
      const rect = this.svgContainer.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (point) {
        if (event.altKey) {
          this.canvasView.zoomOutAt(point.x, point.y);
        } else {
          this.canvasView.zoomInAt(point.x, point.y);
        }
      }
      return;
    }

    const target = event.target as Element;
    if (target.tagName !== 'svg') {
      const svgElement = this.svgManipulation.getSVGInstance()?.findOne(`#${target.id}`) as SVGElement;
      if (svgElement) {
        const properties = this.svgManipulation.getShapeProperties(svgElement);
        this.shapeSelection.selectShape(properties);
        this.svgManipulation.highlightShape(properties.id);
      }
    } else {
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
    }
  }
}
