import { Injectable } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { ShapeProperties } from '../models/shape-properties.interface';
import { type ResizeCorner, oppositeCornerForHandle } from '../utils/selection-resize';

/** Class name for the editor content group (shapes live here). */
const EDITOR_CONTENT_GROUP_ID = 'data-editor-content-group';
/** Attribute to mark the viewBox rect (white fill, thin black stroke). */
const EDITOR_VIEWBOX_RECT_ATTR = 'data-editor-viewbox-rect';
/** Attribute to mark the light grey "outside" viewBox rect. */
const EDITOR_OUTSIDE_RECT_ATTR = 'data-editor-outside-rect';
/** 25% black fill for area outside document viewBox. */
const OUTSIDE_VIEWBOX_FILL = '#bfbfbf';

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService {
  private svgInstance: Svg | null = null;
  /** Stored document viewBox for export and overlay (e.g. "0 0 100 100"). */
  private documentViewBox = '0 0 100 100';
  private documentPreserveAspectRatio = 'xMidYMid meet';

  /**
   * Return the document viewBox (logical SVG viewBox). Used by canvas for overlay/selection math.
   */
  getDocumentViewBox(): string {
    return this.documentViewBox;
  }

  /**
   * Initialize SVG.js with content: build editor-stage root (grey + viewBox rect + content group)
   * so all elements are visible; export serializes the logical document only.
   */
  initializeSVG(container: HTMLElement, svgContent: string): void {
    container.innerHTML = '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    if (!svgElement) return;

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

    const contentBbox = this.computeContentBbox(svgElement);
    const uMinX = Math.min(vbMinX, contentBbox.x);
    const uMinY = Math.min(vbMinY, contentBbox.y);
    const uMaxX = Math.max(vbMinX + vbW, contentBbox.x + contentBbox.width);
    const uMaxY = Math.max(vbMinY + vbH, contentBbox.y + contentBbox.height);
    const uW = uMaxX - uMinX || vbW;
    const uH = uMaxY - uMinY || vbH;

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
      .attr(EDITOR_VIEWBOX_RECT_ATTR, 'true');

    const contentGroup = editorSvg.group().attr(EDITOR_CONTENT_GROUP_ID, 'true');
    Array.from(svgElement.children).forEach((el) => {
      contentGroup.node.appendChild(el.cloneNode(true));
    });

    this.svgInstance = SVG(container.firstElementChild as SVGSVGElement);
    this.makeShapesClickable();
  }

  /**
   * Compute union bbox of all shape elements in the given SVG element (document coordinates).
   */
  private computeContentBbox(svgElement: Element): { x: number; y: number; width: number; height: number } {
    const shapeSelectors = 'circle, rect, path, polygon, ellipse, line, polyline';
    const nodes = svgElement.querySelectorAll(shapeSelectors);
    if (nodes.length === 0) {
      const parts = this.documentViewBox.split(/\s+/);
      const w = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
      const h = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
      return { x: 0, y: 0, width: w, height: h };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((node) => {
      const el = node as SVGGraphicsElement;
      if (typeof el.getBBox !== 'function') return;
      const b = el.getBBox();
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });
    if (minX === Infinity) {
      const parts = this.documentViewBox.split(/\s+/);
      const w = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
      const h = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
      return { x: 0, y: 0, width: w, height: h };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Make all shapes in the content group clickable (excludes editor viewBox/outside rects).
   */
  private makeShapesClickable(): void {
    if (!this.svgInstance) return;
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const scope = contentGroup ?? this.svgInstance;
    const shapes = scope.find('circle, rect, path, polygon, ellipse, line, polyline');
    shapes.forEach((shape: SVGElement) => {
      try {
        shape.css({ cursor: 'pointer' });
      } catch {
        // jsdom or detached nodes may not support style.setProperty
      }
      if (!shape.id()) {
        shape.id(`shape-${Math.random().toString(36).substr(2, 9)}`);
      }
    });
  }

  /**
   * Get shape properties by element
   */
  getShapeProperties(element: SVGElement): ShapeProperties {
    return {
      id: element.id() || '',
      type: element.type,
      fill: element.attr('fill') || '#000000',
      stroke: element.attr('stroke'),
      strokeWidth: parseFloat(element.attr('stroke-width')) || 0,
      opacity: parseFloat(element.attr('opacity')) || 1
    };
  }

  /**
   * Update fill color of a shape
   */
  updateFillColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.fill(color);
    }
  }

  /**
   * Add stroke to a shape
   */
  addStroke(shapeId: string, color: string, width: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color, width });
    }
  }

  /**
   * Remove stroke from a shape
   */
  removeStroke(shapeId: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke('none');
    }
  }

  /**
   * Update stroke color
   */
  updateStrokeColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color });
    }
  }

  /**
   * Update opacity of a shape
   */
  updateOpacity(shapeId: string, opacity: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.opacity(opacity);
    }
  }

  /**
   * Move a shape by dx, dy in **root SVG user space** (same as selection bbox / pointer mapping).
   *
   * SVG.js `dmove` adjusts geometry attrs (x/y, cx/cy, path `d`, …) in **local** space. After a
   * proportional resize we store scale in `transform`; local dmove no longer shifts the painted
   * bbox by (dx,dy) in user space, so the drag ghost (bbox + delta) and the drop diverge.
   * Prepending `translate(dx,dy)` to the element matrix matches user-space motion for any shape.
   */
  translateShape(shapeId: string, dx: number, dy: number): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (!shape || typeof shape.matrix !== 'function') return;
    const m = shape.matrix();
    shape.matrix(new Matrix().translate(dx, dy).multiply(m));
  }

  /**
   * Show or hide a shape (e.g. hide original during drag, show again on drop).
   */
  setShapeVisibility(shapeId: string, visible: boolean): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.attr('visibility', visible ? 'visible' : 'hidden');
    }
  }

  /**
   * Get shape bounding box in SVG coordinate space. Does not modify the SVG.
   */
  getShapeBBox(shapeId: string): { x: number; y: number; width: number; height: number } | null {
    if (!this.svgInstance) return null;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (!shape?.node) return null;
    const node = shape.node as SVGGraphicsElement;
    // svg.js bbox() wraps DOM getBBox(), which is in the element's *local* space before this
    // element's own `transform`. After resize we set transform via matrix(); multiply so union
    // bbox matches painted geometry.
    if (typeof shape.bbox === 'function' && typeof shape.matrixify === 'function') {
      try {
        const local = shape.bbox();
        const m = shape.matrixify();
        if (local && typeof local.isNulled === 'function' && !local.isNulled() && m) {
          const tb = local.transform(m);
          const w = tb.width ?? tb.w;
          const h = tb.height ?? tb.h;
          if (Number.isFinite(w) && Number.isFinite(h) && w >= 0 && h >= 0) {
            return { x: tb.x, y: tb.y, width: w, height: h };
          }
        }
      } catch {
        // fall through to native getBBox
      }
    }
    if (typeof node.getBBox !== 'function') return null;
    const bbox = node.getBBox();
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  }

  /**
   * Union of bounding boxes for the given shape ids. Returns null if no valid bboxes.
   */
  getUnionBBox(shapeIds: string[]): { x: number; y: number; width: number; height: number } | null {
    const bboxes = shapeIds
      .map((id) => this.getShapeBBox(id))
      .filter((b): b is { x: number; y: number; width: number; height: number } => b != null);
    if (bboxes.length === 0) return null;
    if (bboxes.length === 1) return bboxes[0];
    const minX = Math.min(...bboxes.map((b) => b.x));
    const minY = Math.min(...bboxes.map((b) => b.y));
    const maxX = Math.max(...bboxes.map((b) => b.x + b.width));
    const maxY = Math.max(...bboxes.map((b) => b.y + b.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /**
   * Highlight selected shape (no-op: highlight is drawn by canvas overlay, not by modifying SVG).
   */
  highlightShape(_shapeId: string): void {}

  /**
   * Clear shape highlight (no-op: overlay is driven by selection state).
   */
  clearHighlight(): void {}

  /**
   * Export the logical document (viewBox + content), not the editor-stage SVG.
   */
  exportSVG(): string {
    if (!this.svgInstance) return '';
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return this.svgInstance.svg();
    const xmlns = this.svgInstance.node.getAttribute('xmlns') || 'http://www.w3.org/2000/svg';
    const inner = (contentGroup.node as Element).innerHTML;
    return `<svg xmlns="${xmlns}" viewBox="${this.documentViewBox}" preserveAspectRatio="${this.documentPreserveAspectRatio}">${inner}</svg>`;
  }

  /**
   * Get SVG instance for direct manipulation
   */
  getSVGInstance(): Svg | null {
    return this.svgInstance;
  }

  /**
   * Return the given shape ids in DOM order (order of children in the editor content group).
   * Ids not found in the content group are omitted.
   */
  getShapeIdsInDomOrder(shapeIds: string[]): string[] {
    if (!this.svgInstance || shapeIds.length === 0) return [];
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return [...shapeIds];
    const idSet = new Set(shapeIds);
    const ordered: string[] = [];
    const children = Array.from((contentGroup.node as Element).children);
    for (const child of children) {
      const id = (child as Element).id;
      if (id && idSet.has(id)) ordered.push(id);
    }
    return ordered.length > 0 ? ordered : [...shapeIds];
  }

  /**
   * Clone each shape's current transform matrix for resize commit (SVG.js).
   */
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix> {
    const map = new Map<string, Matrix>();
    if (!this.svgInstance) return map;
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SVGElement | undefined;
      if (shape && typeof shape.matrix === 'function') {
        map.set(id, shape.matrix().clone());
      }
    }
    return map;
  }

  /**
   * Apply uniform scale about the fixed anchor (opposite corner) for proportional resize.
   * Composes: newMatrix = scale(s,s,ax,ay) * snapshotMatrix
   */
  applyUnionScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>,
    handle: ResizeCorner
  ): void {
    if (!this.svgInstance) return;
    const s = unionAfter.width / unionBefore.width;
    if (!Number.isFinite(s) || s <= 0) return;
    const anchor = oppositeCornerForHandle(unionBefore, handle);
    const T = new Matrix().scale(s, s, anchor.x, anchor.y);
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SVGElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
  }
}
