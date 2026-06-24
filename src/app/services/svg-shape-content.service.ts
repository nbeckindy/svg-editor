import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement, Image as SvgJsImage, Matrix, G, namespaces } from '@svgdotjs/svg.js';
import { ShapeProperties } from '../models/shape-properties.interface';
import type {
  CreatableShapeType,
  InsertRasterImageAttrs,
  ShapeCreationAttrs,
  SvgShapeContentPort
} from './svg-shape-content.port';
import type { ClipboardPayload } from '../models/clipboard-payload';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';
import { CONTENT_SHAPE_SELECTOR, EDITOR_CONTENT_GROUP_ID, SVG_NS } from './svg-editor-stage.constants';
import { SvgShapePaintService } from './shape-content/svg-shape-paint.service';
import { SvgShapePathDataService } from './shape-content/svg-shape-path-data.service';
import { SvgShapeTextService } from './shape-content/svg-shape-text.service';
import { SvgSelectionHitTestService } from './shape-content/svg-selection-hit-test.service';
import { SvgClipboardService } from './shape-content/svg-clipboard.service';
import type { AxisAlignedRect } from '../utils/marquee-selection';

@Injectable({ providedIn: 'root' })
export class SvgShapeContentService implements SvgShapeContentPort {
  private readonly drawingStyleDefaults = inject(DrawingStyleDefaultsService);
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly geometry = inject(SvgSelectionGeometryService);
  private readonly paint = inject(SvgShapePaintService);
  private readonly pathData = inject(SvgShapePathDataService);
  private readonly text = inject(SvgShapeTextService);
  private readonly hitTest = inject(SvgSelectionHitTestService);
  private readonly clipboard = inject(SvgClipboardService);

  getRenderedPaint(node: Element) { return this.paint.getRenderedPaint(node); }
  isStrokeVisiblyPainted(node: Element) { return this.paint.isStrokeVisiblyPainted(node); }
  getShapeProperties(element: SvgJsElement) { return this.paint.getShapeProperties(element); }
  updateFillColor(shapeId: string, color: string) { this.paint.updateFillColor(shapeId, color); }
  addStroke(shapeId: string, color: string, width: number) { this.paint.addStroke(shapeId, color, width); }
  removeStroke(shapeId: string) { this.paint.removeStroke(shapeId); }
  updateStrokeColor(shapeId: string, color: string) { this.paint.updateStrokeColor(shapeId, color); }
  updateStrokeDasharray(shapeId: string, dasharray: string) { this.paint.updateStrokeDasharray(shapeId, dasharray); }
  updateStrokeDashoffset(shapeId: string, dashoffset: number) { this.paint.updateStrokeDashoffset(shapeId, dashoffset); }
  updateOpacity(shapeId: string, opacity: number) { this.paint.updateOpacity(shapeId, opacity); }
  bakeEffectiveFillToLocal(shapeId: string) { this.paint.bakeEffectiveFillToLocal(shapeId); }
  bakeEffectiveStrokeToLocal(shapeId: string) { this.paint.bakeEffectiveStrokeToLocal(shapeId); }
  restoreBakedFillPresentation(shapeId: string, before: { fillAttr: string | null; fillStyleValue: string }) {
    this.paint.restoreBakedFillPresentation(shapeId, before);
  }
  restoreBakedStrokePresentation(shapeId: string, before: {
    strokeAttr: string | null; strokeStyleValue: string; strokeWidthAttr: string | null; strokeWidthStyleValue: string;
  }) { this.paint.restoreBakedStrokePresentation(shapeId, before); }

  updatePathData(pathId: string, d: string) { this.pathData.updatePathData(pathId, d); }
  getPathNodeHandleLinkRaw(pathId: string) { return this.pathData.getPathNodeHandleLinkRaw(pathId); }
  setPathNodeHandleLinkRaw(pathId: string, value: string | null) { this.pathData.setPathNodeHandleLinkRaw(pathId, value); }
  insertPathIntoContentGroup(d: string, attrs?: { fill?: string; stroke?: string; strokeWidth?: number }, options?: { closedPath?: boolean }) {
    return this.pathData.insertPathIntoContentGroup(d, attrs, options);
  }

  getTextContent(textId: string) { return this.text.getTextContent(textId); }
  updateTextContent(textId: string, text: string) { this.text.updateTextContent(textId, text); }
  updateTextFontFamily(textId: string, fontFamily: string) { this.text.updateTextFontFamily(textId, fontFamily); }
  updateTextFontSize(textId: string, fontSize: number) { this.text.updateTextFontSize(textId, fontSize); }
  updateTextFontWeight(textId: string, fontWeight: string) { this.text.updateTextFontWeight(textId, fontWeight); }
  updateTextFontStyle(textId: string, fontStyle: string) { this.text.updateTextFontStyle(textId, fontStyle); }
  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end') { this.text.updateTextAnchor(textId, textAnchor); }
  updateTextPaintOrder(textId: string, paintOrder: string | undefined) { this.text.updateTextPaintOrder(textId, paintOrder); }
  updateTextVectorEffect(textId: string, effect: string | undefined) { this.text.updateTextVectorEffect(textId, effect); }

  /**
   * Same as {@link getShapePropertiesInSameClipGroup} but uses `readProps` so a façade can supply
   * a spied `getShapeProperties` (unit tests mock the manipulation service, not the shape slice).
   */
  getShapePropertiesInSameClipGroupReadingWith(
    shape: SvgJsElement,
    readProps: (el: SvgJsElement) => ShapeProperties
  ): ShapeProperties[] {
    const node = shape.node as Element | null;
    const single = (): ShapeProperties[] => [readProps(shape)];
    if (!node || !this.doc.getSVGInstance()) return single();
    if (typeof node.closest !== 'function') return single();
    const contentRoot = node.closest(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentRoot) return single();
    const clipHost = node.closest('[clip-path], [mask]');
    if (!clipHost || !contentRoot.contains(clipHost)) return single();
    const domShapes = clipHost.querySelectorAll(CONTENT_SHAPE_SELECTOR);
    if (domShapes.length === 0) return single();
    const out: ShapeProperties[] = [];
    domShapes.forEach((el) => {
      const id = el.getAttribute('id');
      if (!id) return;
      const s = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (s) out.push(readProps(s));
    });
    return out.length > 0 ? out : single();
  }

  /**
   * All editor content shapes under the same nearest `clip-path` or `mask` ancestor as `shape`
   * (so the clipped group moves/resizes as one). If none, returns only this shape.
   */
  getShapePropertiesInSameClipGroup(shape: SvgJsElement): ShapeProperties[] {
    return this.getShapePropertiesInSameClipGroupReadingWith(shape, (el) => this.getShapeProperties(el));
  }

  /**
   * @see getShapePropertiesInSameClipGroupReadingWith
   */
  expandSelectionByClipGroupsReadingWith(
    shapes: ShapeProperties[],
    readProps: (el: SvgJsElement) => ShapeProperties
  ): ShapeProperties[] {
    if (shapes.length === 0) return [];
    const seen = new Set<string>();
    const result: ShapeProperties[] = [];
    for (const s of shapes) {
      const shape = this.doc.getSVGInstance()?.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!shape) continue;
      const group = this.getShapePropertiesInSameClipGroupReadingWith(shape, readProps);
      for (const p of group) {
        if (!seen.has(p.id)) {
          seen.add(p.id);
          result.push(p);
        }
      }
    }
    return result;
  }

  /**
   * Expand each hit to its clip/mask group and dedupe (marquee order preserved).
   */
  expandSelectionByClipGroups(shapes: ShapeProperties[]): ShapeProperties[] {
    return this.expandSelectionByClipGroupsReadingWith(shapes, (el) => this.getShapeProperties(el));
  }

  /**
   * Nearest ancestor `<g>` with an `id` between this shape and the editor content group (for
   * "select parent" when fill/stroke is inherited).
   */
  getNearestGroupAncestorId(shapeId: string): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const start = shape?.node as Element | null;
    const contentRoot = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`)?.node as Element | null;
    if (!start || !contentRoot) return null;
    let current: Element | null = start.parentElement;
    while (current && current !== contentRoot && contentRoot.contains(current)) {
      if (current.tagName?.toLowerCase() === 'g' && (current as Element).id) {
        return (current as Element).id;
      }
      current = current.parentElement;
    }
    return null;
  }

  restoreRemovedShapesInContentGroup(
    shapeIds: string[],
    serializedMarkup: ReadonlyMap<string, string>,
    insertionIndices: ReadonlyMap<string, number>
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const contentNode = contentGroup?.node as Element | undefined;
    if (!contentNode) return;

    const sorted = [...shapeIds]
      .filter((id) => serializedMarkup.has(id))
      .sort((a, b) => (insertionIndices.get(a) ?? 0) - (insertionIndices.get(b) ?? 0));

    for (const id of sorted) {
      const markup = serializedMarkup.get(id);
      if (!markup) continue;
      const idx = insertionIndices.get(id);
      const temp = document.createElementNS(SVG_NS, 'g');
      temp.innerHTML = markup;
      const newNode = temp.firstElementChild;
      if (!newNode) continue;

      const children = contentNode.children;
      if (idx !== undefined && idx < children.length) {
        contentNode.insertBefore(newNode, children[idx]);
      } else {
        contentNode.appendChild(newNode);
      }
    }

    this.doc.bumpDocumentRevision();
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
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape || typeof shape.matrix !== 'function') return;
    let localDx = dx;
    let localDy = dy;

    // Convert root-SVG delta into the shape's parent-space delta so ancestor transforms
    // (e.g. scaled/flipped groups) don't amplify or flip movement on mouseup commit.
    try {
      const node = shape.node as SVGGraphicsElement;
      const parent = node?.parentElement as unknown as SVGGraphicsElement | null;
      const parentCtm = parent?.getCTM?.();
      if (parentCtm) {
        const det = parentCtm.a * parentCtm.d - parentCtm.b * parentCtm.c;
        if (Number.isFinite(det) && Math.abs(det) > 1e-12) {
          localDx = (parentCtm.d * dx - parentCtm.c * dy) / det;
          localDy = (-parentCtm.b * dx + parentCtm.a * dy) / det;
        }
      }
    } catch {
      // fall back to raw delta if CTM math is unavailable
    }

    const m = shape.matrix();
    shape.matrix(new Matrix().translate(localDx, localDy).multiply(m));
    this.doc.bumpDocumentRevision();
  }

  /**
   * Show or hide a shape (e.g. hide original during drag, show again on drop).
   */
  setShapeVisibility(shapeId: string, visible: boolean): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      if (visible) {
        shape.attr('visibility', null);
      } else {
        shape.attr('visibility', 'hidden');
      }
    }
  }

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    return this.hitTest.getShapePropertiesIntersectingRect(rect);
  }

  clearHighlight(): void {}

  /**
   * Remove shapes from the document. Selection/marquee rules apply: ids are expanded to the same
   * clip-path/mask groups as {@link expandSelectionByClipGroups} so a clipped set is removed together.
   */
  removeShapes(shapeIds: string[]): void {
    if (!this.doc.getSVGInstance() || shapeIds.length === 0) return;
    const props: ShapeProperties[] = [];
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (shape) props.push(this.getShapeProperties(shape));
    }
    if (props.length === 0) return;
    const expanded = this.expandSelectionByClipGroups(props);
    const toRemove = [...new Set(expanded.map((p) => p.id))];
    for (const id of toRemove) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (shape) shape.remove();
    }
    if (toRemove.length > 0) this.doc.bumpDocumentRevision();
  }

  /**
   * Create a new SVG shape inside the content group.
   * Returns the new element's ID, or null if not initialized.
   */
  addShape(type: CreatableShapeType, attrs: ShapeCreationAttrs): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`) as G | null;
    if (!contentGroup) return null;

    const usedIds = new Set<string>();
    contentGroup.find('*').forEach((el: SvgJsElement) => {
      const id = el.id();
      if (id) usedIds.add(id);
    });
    let newId: string;
    do {
      newId = `shape-${Math.random().toString(36).substr(2, 9)}`;
    } while (usedIds.has(newId));

    let shape: SvgJsElement;

    const defaults = this.drawingStyleDefaults.defaults();
    const fill = attrs.fill ?? defaults.fill;
    const stroke = attrs.stroke ?? defaults.stroke;
    const strokeWidth = attrs.strokeWidth ?? defaults.strokeWidth;

    if (type === 'rect') {
      const w = attrs.width ?? 100;
      const h = attrs.height ?? 100;
      const x = attrs.x ?? 0;
      const y = attrs.y ?? 0;
      const el = contentGroup.rect(w, h).move(x, y);
      el.fill(fill);
      el.stroke({ color: stroke, width: strokeWidth });
      shape = el;
    } else if (type === 'ellipse') {
      const rx = attrs.rx ?? 50;
      const ry = attrs.ry ?? 50;
      const cx = attrs.cx ?? rx;
      const cy = attrs.cy ?? ry;
      const el = contentGroup.ellipse(rx * 2, ry * 2).center(cx, cy);
      el.fill(fill);
      el.stroke({ color: stroke, width: strokeWidth });
      shape = el;
    } else if (type === 'line') {
      const x1 = attrs.x1 ?? 0;
      const y1 = attrs.y1 ?? 0;
      const x2 = attrs.x2 ?? 100;
      const y2 = attrs.y2 ?? 100;
      const el = contentGroup.line(x1, y1, x2, y2);
      // Canonical rule: line creation ignores fill.
      el.fill('none');
      el.stroke({ color: stroke, width: strokeWidth });
      shape = el;
    } else {
      const x = attrs.x ?? 0;
      const y = attrs.y ?? 0;
      const textContent = attrs.textContent ?? 'Text';
      // `plain()` avoids svg.js tspan layout calls that rely on getBBox, which jsdom lacks.
      const el = contentGroup.plain(textContent);
      el.attr({
        x,
        y,
        fill,
        stroke,
        'stroke-width': strokeWidth,
        'font-size': attrs.fontSize ?? defaults.fontSize,
        'font-family': attrs.fontFamily ?? defaults.fontFamily,
        'font-weight': attrs.fontWeight ?? defaults.fontWeight,
        'font-style': attrs.fontStyle ?? defaults.fontStyle,
        'text-anchor': attrs.textAnchor ?? defaults.textAnchor
      });
      shape = el;
    }

    shape.id(newId);
    this.doc.bumpDocumentRevision();
    return newId;
  }

  /**
   * Insert an `<image>` into the editor content group.
   * Mirrors {@link addShape} id allocation and document revision bump.
   */
  insertRasterImageIntoContentGroup(attrs: InsertRasterImageAttrs): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`) as G | null;
    if (!contentGroup) return null;

    const usedIds = new Set<string>();
    contentGroup.find('*').forEach((el: SvgJsElement) => {
      const id = el.id();
      if (id) usedIds.add(id);
    });
    let newId: string;
    do {
      newId = `shape-${Math.random().toString(36).substr(2, 9)}`;
    } while (usedIds.has(newId));

    const shape = contentGroup.put(new SvgJsImage()) as SvgJsElement;
    shape.id(newId);
    shape.attr('href', attrs.href, namespaces.xlink);
    shape.attr({
      x: attrs.x,
      y: attrs.y,
      width: attrs.width,
      height: attrs.height
    });
    if (attrs.preserveAspectRatio != null && attrs.preserveAspectRatio !== '') {
      shape.attr('preserveAspectRatio', attrs.preserveAspectRatio);
    }
    this.doc.bumpDocumentRevision();
    return newId;
  }

  /**
   * Remove a single shape by ID (no clip-group expansion). Used by undo of AddShapeCommand.
   */
  removeShape(shapeId: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (shape) {
      shape.remove();
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Re-insert a serialized shape element (outerHTML) into the content group at the specified
   * DOM index. Used by redo of AddShapeCommand.
   */
  insertShapeMarkup(markup: string, insertionIndex?: number): void {
    if (!this.doc.getSVGInstance()) return;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return;

    const parent = contentGroup.node as Element;
    const temp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    temp.innerHTML = markup;
    const newNode = temp.firstElementChild;
    if (!newNode) return;

    if (insertionIndex != null && insertionIndex < parent.children.length) {
      parent.insertBefore(newNode, parent.children[insertionIndex]);
    } else {
      parent.appendChild(newNode);
    }

    this.doc.bumpDocumentRevision();
  }

  createClipboardPayload(shapeIds: string[]): ClipboardPayload {
    return this.clipboard.createClipboardPayload(shapeIds);
  }

  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] } {
    return this.clipboard.pasteClipboardPayload(payload, offset);
  }
}
