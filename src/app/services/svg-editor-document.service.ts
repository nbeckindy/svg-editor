import { Injectable, signal, computed } from '@angular/core';
import { SVG, Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import {
  ArtboardModel,
  ArtboardResizeAnchor,
  DEFAULT_ARTBOARD,
  DEFAULT_ARTBOARD_RESIZE_ANCHOR,
  computeArtboardOriginForResize
} from '../models/artboard.model';
import {
  CONTENT_SHAPE_SELECTOR,
  EDITOR_CONTENT_GROUP_ID,
  EDITOR_OUTSIDE_RECT_ATTR,
  EDITOR_VIEWBOX_RECT_ATTR,
  OUTSIDE_VIEWBOX_FILL
} from './svg-editor-stage.constants';

/**
 * Owns the mounted editor-stage SVG instance, document revision signal, and artboard/viewBox
 * state shared across manipulation slices.
 */
@Injectable({
  providedIn: 'root'
})
export class SvgEditorDocumentService {
  /** Bumped when logical document content changes (for debug / reactive views). */
  readonly documentRevision = signal(0);

  private readonly _artboard = signal<ArtboardModel>({ ...DEFAULT_ARTBOARD });
  /** Reactive artboard state (width, height, origin, background color). */
  readonly artboard = computed(() => this._artboard());

  private readonly _artboardResizeAnchor = signal<ArtboardResizeAnchor>(DEFAULT_ARTBOARD_RESIZE_ANCHOR);
  /** Fixed point used when changing artboard dimensions (editor preference, not exported). */
  readonly artboardResizeAnchor = computed(() => this._artboardResizeAnchor());

  private svgInstance: Svg | null = null;
  /** Stored document viewBox for export and overlay (e.g. "0 0 100 100"). */
  private documentViewBox = '0 0 100 100';
  private documentPreserveAspectRatio = 'xMidYMid meet';

  bumpDocumentRevision(): void {
    this.documentRevision.update((n) => n + 1);
  }

  getSVGInstance(): Svg | null {
    return this.svgInstance;
  }

  getDocumentViewBox(): string {
    return this.documentViewBox;
  }

  getArtboard(): ArtboardModel {
    return this._artboard();
  }

  /**
   * Update artboard dimensions. Syncs the viewBox rect, outside rect, and stage viewBox
   * without changing the root SVG element's pixel size (that's managed by zoom/layout).
   */
  setArtboardSize(
    width: number,
    height: number,
    explicitOrigin?: { minX: number; minY: number }
  ): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
    if (!this.svgInstance) return;

    const prev = this._artboard();
    const { minX, minY } =
      explicitOrigin ??
      computeArtboardOriginForResize(prev, width, height, this._artboardResizeAnchor());

    this._artboard.set({ ...prev, width, height, minX, minY });
    this.documentViewBox = `${minX} ${minY} ${width} ${height}`;

    const outsideRect = this.svgInstance.findOne(`[${EDITOR_OUTSIDE_RECT_ATTR}]`) as SvgJsElement | null;
    const viewBoxRect = this.svgInstance.findOne(`[${EDITOR_VIEWBOX_RECT_ATTR}]`) as SvgJsElement | null;

    if (viewBoxRect) {
      viewBoxRect.size(width, height);
      viewBoxRect.move(minX, minY);
    }

    if (outsideRect) {
      const margin = Math.max(width, height) * 0.5;
      const outerW = width + margin * 2;
      const outerH = height + margin * 2;
      outsideRect.size(outerW, outerH);
      outsideRect.move(minX - margin, minY - margin);
    }

    this.syncStageViewBox();
    this.bumpDocumentRevision();
  }

  setArtboardResizeAnchor(anchor: ArtboardResizeAnchor): void {
    this._artboardResizeAnchor.set(anchor);
  }

  private syncStageViewBox(): void {
    if (!this.svgInstance) return;

    const outsideRect = this.svgInstance.findOne(`[${EDITOR_OUTSIDE_RECT_ATTR}]`) as SvgJsElement | null;
    if (!outsideRect) return;

    let uMinX = Number(outsideRect.attr('x')) || 0;
    let uMinY = Number(outsideRect.attr('y')) || 0;
    let uW = Number(outsideRect.attr('width')) || 100;
    let uH = Number(outsideRect.attr('height')) || 100;

    const node = this.svgInstance.node as SVGSVGElement;
    const elW = Number(node.getAttribute('width')) || node.clientWidth || uW;
    const elH = Number(node.getAttribute('height')) || node.clientHeight || uH;
    const desiredRatio = elW / elH;
    const currentRatio = uW / uH;

    if (
      Number.isFinite(desiredRatio) &&
      Number.isFinite(currentRatio) &&
      desiredRatio > 0 &&
      currentRatio > 0 &&
      Math.abs(currentRatio - desiredRatio) > 1e-6
    ) {
      const cx = uMinX + uW / 2;
      const cy = uMinY + uH / 2;
      if (currentRatio > desiredRatio) {
        const newH = uW / desiredRatio;
        uMinY = cy - newH / 2;
        uH = newH;
      } else {
        const newW = uH * desiredRatio;
        uMinX = cx - newW / 2;
        uW = newW;
      }
    }

    this.svgInstance.viewbox(uMinX, uMinY, uW, uH);
  }

  setBackgroundColor(color: string): void {
    if (!this.svgInstance) return;
    const prev = this._artboard();
    this._artboard.set({ ...prev, backgroundColor: color });

    const viewBoxRect = this.svgInstance.findOne(`[${EDITOR_VIEWBOX_RECT_ATTR}]`) as SvgJsElement | null;
    if (viewBoxRect) {
      viewBoxRect.fill(color);
    }
    this.bumpDocumentRevision();
  }

  initializeSVG(container: HTMLElement, svgContent: string): void {
    container.innerHTML = '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    if (!svgElement) {
      return;
    }

    const vb = svgElement.getAttribute('viewBox');
    const par = svgElement.getAttribute('preserveAspectRatio');
    if (vb) this.documentViewBox = vb;
    if (par) this.documentPreserveAspectRatio = par;
    if (!vb) {
      const w = svgElement.getAttribute('width') || (svgElement as unknown as { clientWidth?: number }).clientWidth || 100;
      const h = svgElement.getAttribute('height') || (svgElement as unknown as { clientHeight?: number }).clientHeight || 100;
      const width = typeof w === 'string' && w.endsWith('%') ? 100 : Number(w) || 100;
      const height = typeof h === 'string' && h.endsWith('%') ? 100 : Number(h) || 100;
      this.documentViewBox = `0 0 ${width} ${height}`;
    }

    const parts = this.documentViewBox.split(/\s+/);
    const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
    const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
    const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
    const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;

    this._artboard.set({
      width: vbW,
      height: vbH,
      minX: vbMinX,
      minY: vbMinY,
      backgroundColor: '#ffffff'
    });

    const contentBbox = this.computeContentBbox(svgElement);
    let uMinX = Math.min(vbMinX, contentBbox.x);
    let uMinY = Math.min(vbMinY, contentBbox.y);
    const uMaxX = Math.max(vbMinX + vbW, contentBbox.x + contentBbox.width);
    const uMaxY = Math.max(vbMinY + vbH, contentBbox.y + contentBbox.height);
    let uW = uMaxX - uMinX || vbW;
    let uH = uMaxY - uMinY || vbH;

    let initW = vbW;
    let initH = vbH;
    const wAttr = svgElement.getAttribute('width');
    const hAttr = svgElement.getAttribute('height');
    if (wAttr && !wAttr.endsWith('%')) {
      const n = Number(wAttr);
      if (!Number.isNaN(n)) initW = n;
    }
    if (hAttr && !hAttr.endsWith('%')) {
      const n = Number(hAttr);
      if (!Number.isNaN(n)) initH = n;
    }

    const clipPathCount = svgElement.querySelectorAll('clipPath').length;
    const maskCount = svgElement.querySelectorAll('mask').length;
    const hasClipPathAttr = svgElement.querySelectorAll('[clip-path]').length > 0;
    const hasMaskAttr = svgElement.querySelectorAll('[mask]').length > 0;

    const hasClippingOrMasking = clipPathCount > 0 || maskCount > 0 || hasClipPathAttr || hasMaskAttr;
    if (!vb && hasClippingOrMasking) {
      uMinX = vbMinX;
      uMinY = vbMinY;
      uW = vbW;
      uH = vbH;
    }

    const desiredRatio = initW / initH;
    const currentRatio = uW / uH;
    if (
      Number.isFinite(desiredRatio) &&
      Number.isFinite(currentRatio) &&
      desiredRatio > 0 &&
      currentRatio > 0 &&
      Math.abs(currentRatio - desiredRatio) > 1e-6
    ) {
      const cx = uMinX + uW / 2;
      const cy = uMinY + uH / 2;
      if (currentRatio > desiredRatio) {
        const newUHeight = uW / desiredRatio;
        uMinY = cy - newUHeight / 2;
        uH = newUHeight;
      } else {
        const newUWidth = uH * desiredRatio;
        uMinX = cx - newUWidth / 2;
        uW = newUWidth;
      }
    }

    const editorSvg = SVG()
      .addTo(container)
      .size(initW, initH)
      .viewbox(uMinX, uMinY, uW, uH)
      .attr({ overflow: 'visible', preserveAspectRatio: 'none' });

    editorSvg
      .rect(uW, uH)
      .move(uMinX, uMinY)
      .fill(OUTSIDE_VIEWBOX_FILL)
      .attr(EDITOR_OUTSIDE_RECT_ATTR, 'true');

    editorSvg
      .rect(vbW, vbH)
      .move(vbMinX, vbMinY)
      .fill('#ffffff')
      .stroke('none')
      .attr(EDITOR_VIEWBOX_RECT_ATTR, 'true');

    const contentGroup = editorSvg.group().attr(EDITOR_CONTENT_GROUP_ID, 'true');
    Array.from(svgElement.children).forEach((el) => {
      contentGroup.node.appendChild(el.cloneNode(true));
    });

    this.svgInstance = SVG(container.firstElementChild as SVGSVGElement);
    this.makeShapesClickable();
    this.bumpDocumentRevision();
  }

  private computeContentBbox(svgElement: Element): { x: number; y: number; width: number; height: number } {
    const shapeSelectors = CONTENT_SHAPE_SELECTOR;
    const computeFromRoot = (root: Element): { x: number; y: number; width: number; height: number } | null => {
      const nodes = root.querySelectorAll(shapeSelectors);
      if (nodes.length === 0) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      nodes.forEach((node) => {
        const el = node as SVGGraphicsElement;
        if (typeof el.getBBox !== 'function') return;
        const b = el.getBBox();
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      });
      if (minX === Infinity) return null;
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };

    const fallbackFromDocumentViewBox = (): { x: number; y: number; width: number; height: number } => {
      const parts = this.documentViewBox.split(/\s+/);
      const w = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
      const h = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
      return { x: 0, y: 0, width: w, height: h };
    };

    const first = computeFromRoot(svgElement);
    if (first && Number.isFinite(first.width) && Number.isFinite(first.height) && first.width !== 0 && first.height !== 0) {
      return first;
    }

    if (typeof document !== 'undefined' && typeof document.body !== 'undefined') {
      const tempHost = document.createElement('div');
      tempHost.style.position = 'absolute';
      tempHost.style.left = '-100000px';
      tempHost.style.top = '-100000px';
      tempHost.style.width = '0';
      tempHost.style.height = '0';
      tempHost.style.overflow = 'visible';
      try {
        const imported = document.importNode(svgElement, true) as Element;
        tempHost.appendChild(imported);
        document.body.appendChild(tempHost);
        const second = computeFromRoot(imported);
        if (second && Number.isFinite(second.width) && Number.isFinite(second.height) && second.width !== 0 && second.height !== 0) {
          return second;
        }
      } catch {
        // ignore
      } finally {
        tempHost.remove();
      }
    }

    return fallbackFromDocumentViewBox();
  }

  private makeShapesClickable(): void {
    if (!this.svgInstance) return;
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const scope = contentGroup ?? this.svgInstance;
    const shapes = scope.find(CONTENT_SHAPE_SELECTOR);

    const usedIds = new Set<string>();
    scope.find('*').forEach((el: SvgJsElement) => {
      const id = el.id();
      if (id) usedIds.add(id);
    });

    shapes.forEach((shape: SvgJsElement) => {
      try {
        shape.css({ cursor: 'pointer' });
      } catch {
        // jsdom or detached nodes may not support style.setProperty
      }
      if (!shape.id()) {
        let newId: string;
        do {
          newId = `shape-${Math.random().toString(36).substr(2, 9)}`;
        } while (usedIds.has(newId));
        usedIds.add(newId);
        shape.id(newId);
      }
    });
  }

  exportSVG(): string {
    if (!this.svgInstance) return '';
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return this.svgInstance.svg();
    const xmlns = this.svgInstance.node.getAttribute('xmlns') || 'http://www.w3.org/2000/svg';
    const inner = (contentGroup.node as Element).innerHTML;
    const ab = this._artboard();
    return `<svg xmlns="${xmlns}" width="${ab.width}" height="${ab.height}" viewBox="${this.documentViewBox}" preserveAspectRatio="${this.documentPreserveAspectRatio}">${inner}</svg>`;
  }
}
