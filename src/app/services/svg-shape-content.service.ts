import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement, Image as SvgJsImage, Matrix, G, namespaces } from '@svgdotjs/svg.js';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../models/shape-properties.interface';
import type {
  CreatableShapeType,
  InsertRasterImageAttrs,
  ShapeCreationAttrs,
  SvgShapeContentPort,
  SvgShapePaintReadout
} from './svg-shape-content.port';
import type { ClipboardPayload, ClipboardShapeSnapshot } from '../models/clipboard-payload';
import {
  axisAlignedRectContains,
  axisAlignedRectsIntersect,
  marqueeEdgeSamplePoints,
  marqueeSamplePoints,
  type AxisAlignedRect
} from '../utils/marquee-selection';
import { getShapeIdsInDomOrderFromSvg } from '../utils/svg-shape-ids-dom-order';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';
import { CONTENT_SHAPE_SELECTOR, EDITOR_CONTENT_GROUP_ID, SVG_NS } from './svg-editor-stage.constants';

const URL_REF_RE = /url\(\s*(['"]?)#([^)'"\\s]+)\1\s*\)/g;

@Injectable({ providedIn: 'root' })
export class SvgShapeContentService implements SvgShapeContentPort {
  private readonly drawingStyleDefaults = inject(DrawingStyleDefaultsService);
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly geometry = inject(SvgSelectionGeometryService);

  private static readonly URL_PAINT_RE = /^\s*url\(\s*(['"]?)#([^)'"\\s]+)\1\s*\)/i;

  getRenderedPaint(node: Element): SvgShapePaintReadout {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return {};
    try {
      const style = window.getComputedStyle(node as unknown as globalThis.Element);
      const strokeWidth = Number.parseFloat(style.strokeWidth || '');
      const opacity = Number.parseFloat(style.opacity || '');
      return {
        fill: style.fill || undefined,
        stroke: style.stroke || undefined,
        strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : undefined,
        opacity: Number.isFinite(opacity) ? opacity : undefined
      };
    } catch {
      return {};
    }
  }

  /**
   * Whether a stroke is actually painted. Browsers often report `stroke` as `rgb(0, 0, 0)` with
   * `stroke-width: 1` from getComputedStyle even when the used value is `none`, so nothing is drawn.
   */
  isStrokeVisiblyPainted(node: Element): boolean {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return false;
    }
    try {
      const raw = node.getAttribute('stroke');
      const inlineSt = (node as SVGGraphicsElement).style?.getPropertyValue('stroke')?.trim() ?? '';
      const hasPresentationOrInline =
        (raw != null && raw !== '' && raw.toLowerCase() !== 'none') || inlineSt !== '';

      if (hasPresentationOrInline) {
        return true;
      }

      const stroke = window.getComputedStyle(node).getPropertyValue('stroke').trim();
      const lower = stroke.toLowerCase();

      if (!stroke || lower === 'none' || lower === 'transparent') {
        return false;
      }

      const looksLikeUaBlackNoise =
        /^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*1\s*)?\)$/i.test(lower) ||
        lower === '#000' ||
        lower === '#000000';

      if (looksLikeUaBlackNoise) {
        const cls = node.getAttribute('class');
        if (cls) {
          node.removeAttribute('class');
          const strokeWithoutClass = window
            .getComputedStyle(node)
            .getPropertyValue('stroke')
            .trim()
            .toLowerCase();
          node.setAttribute('class', cls);
          const strokeWithClass = window
            .getComputedStyle(node)
            .getPropertyValue('stroke')
            .trim()
            .toLowerCase();
          if (strokeWithoutClass !== strokeWithClass) {
            return true;
          }
        }
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Normalize CSS color to `#RRGGBB` for `<input type="color">` and text fields.
   */
  private normalizeColorForPicker(cssColor: string | undefined, fallback: string): string {
    if (!cssColor) return fallback;
    const t = cssColor.trim();
    if (t === 'none' || t === 'transparent') return fallback;
    if (/^\s*url\s*\(/i.test(t)) return fallback;
    const rgb = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      const toHex = (n: number) =>
        Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
      const r = Number(rgb[1]);
      const g = Number(rgb[2]);
      const b = Number(rgb[3]);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }
    if (t.startsWith('#')) {
      if (t.length === 4) {
        return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
      }
      return t.length === 7 ? t.toUpperCase() : fallback;
    }
    return fallback;
  }

  /**
   * True if some ancestor of `el` (walking `parentElement`) specifies this paint via a presentation
   * attribute or inline style. Used to avoid labeling UA/default agreement as "inherited" when no
   * author actually set fill/stroke up the tree (same computed value as the root &lt;svg&gt; defaults).
   */
  private ancestorChainSpecifiesAuthorPaint(el: Element, property: 'fill' | 'stroke'): boolean {
    let current: Element | null = el.parentElement;
    while (current && current.nodeType === 1) {
      if (current.hasAttribute(property)) {
        return true;
      }
      const svgEl = current as HTMLElement | SVGElement;
      const inline = svgEl.style?.getPropertyValue(property)?.trim();
      if (inline) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Detect cascade source for `fill` / `stroke` using short DOM probes (inline > class/stylesheet > presentation attribute > inherited).
   * `inherited` is only used when an ancestor specifies this property via attribute or inline style; otherwise matching parent computed values are `default` (UA defaults / “window”).
   */
  private getPaintSourceForProperty(dom: Element, property: 'fill' | 'stroke'): PaintSourceInfo {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return this.getPaintSourceFallback(dom, property);
    }
    try {
      const el = dom as HTMLElement | SVGElement;
      const inline = el.style?.getPropertyValue(property)?.trim();
      if (inline) {
        return { kind: 'inline-style' };
      }

      const computedBefore = window.getComputedStyle(el).getPropertyValue(property);

      const cls = el.getAttribute('class');
      if (cls) {
        el.removeAttribute('class');
        const computedNoClass = window.getComputedStyle(el).getPropertyValue(property);
        el.setAttribute('class', cls);
        if (computedNoClass !== computedBefore) {
          return { kind: 'class-or-stylesheet', classNames: cls.split(/\s+/).filter(Boolean) };
        }
      }

      const attrVal = el.getAttribute(property);
      if (attrVal !== null) {
        el.removeAttribute(property);
        const computedNoAttr = window.getComputedStyle(el).getPropertyValue(property);
        el.setAttribute(property, attrVal);
        if (computedNoAttr !== computedBefore) {
          return { kind: 'presentation-attr' };
        }
      }

      const parent = el.parentElement;
      if (parent && parent.nodeType === 1) {
        const parentVal = window.getComputedStyle(parent).getPropertyValue(property);
        if (parentVal === computedBefore && !inline && attrVal === null) {
          if (this.ancestorChainSpecifiesAuthorPaint(el, property)) {
            return { kind: 'inherited' };
          }
          return { kind: 'default' };
        }
      }

      return { kind: 'default' };
    } catch {
      // jsdom / some environments throw or omit SVG computed styles; use attribute/class heuristics.
      return this.getPaintSourceFallback(dom, property);
    }
  }

  /** When `getComputedStyle` is unavailable (e.g. some test environments), use coarse heuristics. */
  private getPaintSourceFallback(dom: Element, property: 'fill' | 'stroke'): PaintSourceInfo {
    const el = dom as HTMLElement | SVGElement;
    const inline = el.style?.getPropertyValue(property)?.trim();
    if (inline) {
      return { kind: 'inline-style' };
    }
    const cls = el.getAttribute('class');
    const classNames = cls ? cls.split(/\s+/).filter(Boolean) : [];
    if (el.hasAttribute(property)) {
      if (classNames.length > 0) {
        return { kind: 'class-or-stylesheet', classNames };
      }
      return { kind: 'presentation-attr' };
    }
    if (classNames.length > 0) {
      return { kind: 'class-or-stylesheet', classNames };
    }
    return { kind: 'unknown' };
  }


  /**
   * Classify a raw fill/stroke value as solid, gradient, pattern, or none.
   * Also extracts the `url(#id)` reference when present so the UI can display it.
   */
  private classifyPaint(rawValue: string | null | undefined): { type: PaintType; url?: string } {
    if (!rawValue || rawValue.trim() === '' || rawValue.trim().toLowerCase() === 'none') {
      return { type: 'none' };
    }
    const urlMatch = rawValue.match(SvgShapeContentService.URL_PAINT_RE);
    if (urlMatch) {
      const refId = urlMatch[2];
      const refEl = this.doc.getSVGInstance()?.findOne(`#${refId}`)?.node as Element | undefined;
      const tag = refEl?.tagName?.toLowerCase?.() ?? '';
      if (tag === 'lineargradient' || tag === 'radialgradient') {
        return { type: 'gradient', url: rawValue.trim() };
      }
      if (tag === 'pattern') {
        return { type: 'pattern', url: rawValue.trim() };
      }
      return { type: 'gradient', url: rawValue.trim() };
    }
    return { type: 'solid' };
  }

  /**
   * Read effective `stroke-dasharray` from the element: presentation attribute, inline style, or
   * computed style, in cascade priority. Returns `undefined` when no dash is set (or `none`).
   */
  private readStrokeDasharray(element: SvgJsElement, node: Element): string | undefined {
    const inline = (node as SVGElement).style?.getPropertyValue('stroke-dasharray')?.trim();
    if (inline && inline.toLowerCase() !== 'none') return inline;
    const attr = element.attr('stroke-dasharray') as string | null;
    if (attr && attr.trim().toLowerCase() !== 'none' && attr.trim() !== '') return attr.trim();
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const computed = window.getComputedStyle(node as unknown as globalThis.Element)
          .getPropertyValue('stroke-dasharray')?.trim();
        if (computed && computed.toLowerCase() !== 'none') return computed;
      } catch { /* ignore */ }
    }
    return undefined;
  }

  /**
   * Read effective `stroke-dashoffset`. Returns `0` when unset.
   */
  private readStrokeDashoffset(element: SvgJsElement, node: Element): number {
    const inline = (node as SVGElement).style?.getPropertyValue('stroke-dashoffset')?.trim();
    if (inline) {
      const n = Number.parseFloat(inline);
      if (Number.isFinite(n)) return n;
    }
    const attr = element.attr('stroke-dashoffset');
    if (attr != null) {
      const n = Number.parseFloat(String(attr));
      if (Number.isFinite(n)) return n;
    }
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const computed = window.getComputedStyle(node as unknown as globalThis.Element)
          .getPropertyValue('stroke-dashoffset')?.trim();
        if (computed) {
          const n = Number.parseFloat(computed);
          if (Number.isFinite(n)) return n;
        }
      } catch { /* ignore */ }
    }
    return 0;
  }
  getShapeProperties(element: SvgJsElement): ShapeProperties {
    const node = element.node as Element;
    const rendered = this.getRenderedPaint(node);
    const rawFill = (element.attr('fill') as string | null) ?? null;
    const rawStroke = (element.attr('stroke') as string | null) ?? null;
    const rawStrokeWidth = Number.parseFloat(String(element.attr('stroke-width') ?? ''));
    const rawOpacity = Number.parseFloat(String(element.attr('opacity') ?? ''));

    const fillCss =
      rendered.fill && rendered.fill !== 'none'
        ? rendered.fill
        : rawFill && rawFill !== 'none'
          ? rawFill
          : '';

    const rawFillClassification = this.classifyPaint(rawFill);
    const fillClassification =
      rawFillClassification.type === 'gradient' || rawFillClassification.type === 'pattern'
        ? rawFillClassification
        : this.classifyPaint(fillCss || rawFill);
    let fillForPicker: string | undefined;
    let fillPaintType: PaintType = fillClassification.type;
    let fillUrl: string | undefined;

    if (fillPaintType === 'gradient' || fillPaintType === 'pattern') {
      fillUrl = fillClassification.url;
      fillForPicker = undefined;
    } else if (fillPaintType === 'none') {
      fillForPicker = undefined;
    } else {
      fillForPicker = fillCss ? this.normalizeColorForPicker(fillCss, '#000000') : undefined;
      if (!fillForPicker) fillPaintType = 'none';
    }

    const strokePainted = this.isStrokeVisiblyPainted(node);
    const strokeRenderedPart = rendered.stroke ?? '';
    const rawStrokeStr = rawStroke ?? '';
    let strokeCss = '';
    if (strokePainted) {
      strokeCss =
        strokeRenderedPart && strokeRenderedPart !== 'none'
          ? strokeRenderedPart
          : rawStrokeStr && rawStrokeStr !== 'none'
            ? rawStrokeStr
            : '';
    }
    const sw = Number.isFinite(rendered.strokeWidth ?? Number.NaN)
      ? (rendered.strokeWidth as number)
      : Number.isFinite(rawStrokeWidth)
        ? rawStrokeWidth
        : 0;
    const strokeWidth = strokePainted && Number.isFinite(sw) ? sw : 0;
    const strokeIsNone = !strokePainted || !strokeCss || strokeCss === 'none' || strokeWidth === 0;

    const rawStrokeClassification = this.classifyPaint(rawStroke);
    const strokeClassification =
      rawStrokeClassification.type === 'gradient' || rawStrokeClassification.type === 'pattern'
        ? rawStrokeClassification
        : this.classifyPaint(strokeCss || rawStroke);
    let strokeForPicker: string | undefined;
    let strokePaintType: PaintType = strokeIsNone ? 'none' : strokeClassification.type;
    let strokeUrl: string | undefined;

    if (strokePaintType === 'gradient' || strokePaintType === 'pattern') {
      strokeUrl = strokeClassification.url;
      strokeForPicker = undefined;
    } else if (strokePaintType === 'none') {
      strokeForPicker = undefined;
    } else {
      strokeForPicker = strokeIsNone ? undefined : this.normalizeColorForPicker(strokeCss, '#000000');
    }

    const opacity = Number.isFinite(rendered.opacity ?? Number.NaN)
      ? (rendered.opacity as number)
      : (Number.isFinite(rawOpacity) ? rawOpacity : 1);

    const fillSource = this.getPaintSourceForProperty(node, 'fill');
    const strokeSource = this.getPaintSourceForProperty(node, 'stroke');

    const rawDasharray = this.readStrokeDasharray(element, node);
    const rawDashoffset = this.readStrokeDashoffset(element, node);

    const textNode = node.tagName.toLowerCase() === 'text' ? node : null;
    // SVG default: fill is painted, then stroke (stroke reads as the “outline” on top). `paint-order`
    // can reverse that (e.g. `stroke fill`) where supported — see properties panel help for `<text>`.
    const rawPaintOrder = (element.attr('paint-order') as string | null)?.trim();
    const paintOrder =
      rawPaintOrder && rawPaintOrder.length > 0 && rawPaintOrder.toLowerCase() !== 'normal'
        ? rawPaintOrder
        : undefined;
    const rawVectorEffect = (element.attr('vector-effect') as string | null)?.trim();
    const vectorEffect =
      rawVectorEffect && rawVectorEffect.length > 0 && rawVectorEffect.toLowerCase() !== 'none'
        ? rawVectorEffect
        : undefined;

    const rawFontSize = textNode ? Number.parseFloat(textNode.getAttribute('font-size') ?? '') : Number.NaN;
    const textAnchorAttr = textNode?.getAttribute('text-anchor');
    const textAnchor =
      textAnchorAttr === 'middle' || textAnchorAttr === 'end' || textAnchorAttr === 'start'
        ? textAnchorAttr
        : undefined;

    return {
      id: element.id() || '',
      type: element.type,
      textContent: textNode?.textContent ?? undefined,
      fontFamily: textNode?.getAttribute('font-family') ?? undefined,
      fontSize: Number.isFinite(rawFontSize) ? rawFontSize : undefined,
      fontWeight: textNode?.getAttribute('font-weight') ?? undefined,
      fontStyle: textNode?.getAttribute('font-style') ?? undefined,
      textAnchor,
      paintOrder,
      vectorEffect,
      fill: fillForPicker,
      stroke: strokeForPicker,
      strokeWidth,
      strokeDasharray: rawDasharray,
      strokeDashoffset: rawDashoffset,
      opacity,
      fillPaintType,
      fillUrl,
      strokePaintType,
      strokeUrl,
      fillSource,
      strokeSource
    };
  }

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
   * Update fill color of a shape
   */
  updateFillColor(shapeId: string, color: string): void {
    if (!this.doc.getSVGInstance()) return;
    
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.fill(color);
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Add stroke to a shape
   */
  addStroke(shapeId: string, color: string, width: number): void {
    if (!this.doc.getSVGInstance()) return;
    
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke({ color, width });
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Remove stroke from a shape
   */
  removeStroke(shapeId: string): void {
    if (!this.doc.getSVGInstance()) return;
    
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke('none');
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Update stroke color
   */
  updateStrokeColor(shapeId: string, color: string): void {
    if (!this.doc.getSVGInstance()) return;
    
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke({ color });
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Update `stroke-dasharray` on a shape. Pass `'none'` or `''` to remove dashing.
   */
  updateStrokeDasharray(shapeId: string, dasharray: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape) return;
    const normalized = dasharray.trim();
    if (!normalized || normalized.toLowerCase() === 'none') {
      shape.attr('stroke-dasharray', null);
    } else {
      shape.attr('stroke-dasharray', normalized);
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Update `stroke-dashoffset` on a shape. Pass `0` to reset.
   */
  updateStrokeDashoffset(shapeId: string, dashoffset: number): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape) return;
    if (dashoffset === 0) {
      shape.attr('stroke-dashoffset', null);
    } else {
      shape.attr('stroke-dashoffset', dashoffset);
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Update opacity of a shape
   */
  updateOpacity(shapeId: string, opacity: number): void {
    if (!this.doc.getSVGInstance()) return;
    
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.opacity(opacity);
      this.doc.bumpDocumentRevision();
    }
  }

  /**
   * Replace path `d` for an existing `<path>` element.
   */
  updatePathData(pathId: string, d: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${pathId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'path') return;
    shape.attr('d', d);
    this.doc.bumpDocumentRevision();
  }

  /**
   * Return editable text for a `<text>` (or its child `<tspan>`), preserving simple inline text for MVP.
   */
  getTextContent(textId: string): string | null {
    const textNode = this.resolveTextNode(textId);
    return textNode?.textContent ?? null;
  }

  /**
   * Replace text content for a `<text>` node. `<tspan>` ids are resolved to their parent `<text>`.
   */
  updateTextContent(textId: string, text: string): void {
    const textNode = this.resolveTextNode(textId);
    if (!textNode) return;
    // Use plain DOM text replacement: svg.js `Text.text()` can call `getBBox()` for layout, which
    // is unavailable in jsdom and breaks unit tests; stroke/fill still go through svg.js helpers.
    textNode.textContent = text;
    this.doc.bumpDocumentRevision();
  }

  updateTextFontFamily(textId: string, fontFamily: string): void {
    this.updateTextAttr(textId, 'font-family', fontFamily);
  }

  updateTextFontSize(textId: string, fontSize: number): void {
    this.updateTextAttr(textId, 'font-size', `${fontSize}`);
  }

  updateTextFontWeight(textId: string, fontWeight: string): void {
    this.updateTextAttr(textId, 'font-weight', fontWeight);
  }

  updateTextFontStyle(textId: string, fontStyle: string): void {
    this.updateTextAttr(textId, 'font-style', fontStyle);
  }

  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end'): void {
    this.updateTextAttr(textId, 'text-anchor', textAnchor);
  }

  /**
   * Sets SVG `paint-order` on the target `<text>`. Pass `undefined` or `'normal'` to clear the
   * attribute (browser default: fill then stroke on top).
   */
  updateTextPaintOrder(textId: string, paintOrder: string | undefined): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    const trimmed = paintOrder?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'normal') {
      shape.attr('paint-order', null);
    } else {
      shape.attr('paint-order', trimmed);
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Sets SVG `vector-effect` on the target `<text>`. Use `non-scaling-stroke` so outline width stays
   * constant in screen pixels when the SVG is scaled (e.g. editor zoom); pass `undefined` / `'none'`
   * to clear. See SVG spec — behavior depends on the root viewport transform chain.
   */
  updateTextVectorEffect(textId: string, effect: string | undefined): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    const trimmed = effect?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      shape.attr('vector-effect', null);
    } else {
      shape.attr('vector-effect', trimmed);
    }
    this.doc.bumpDocumentRevision();
  }

  private updateTextAttr(textId: string, attr: string, value: string): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    shape.attr(attr, value);
    this.doc.bumpDocumentRevision();
  }

  /** Resolve a `<text>` SVG.js element from an id on `<text>` or a child like `<tspan>`. */
  private resolveTextSvgShape(textId: string): SvgJsElement | null {
    if (!this.doc.getSVGInstance()) return null;
    let current = this.doc.getSVGInstance()!.findOne(`#${textId}`) as SvgJsElement | undefined;
    if (!current?.node) return null;
    for (let depth = 0; depth < 24 && current; depth++) {
      if (current.type === 'text') {
        return current;
      }
      const parent = current.parent() as SvgJsElement | undefined;
      if (!parent || parent === current) {
        break;
      }
      current = parent;
    }
    return null;
  }

  private resolveTextNode(textId: string): Element | null {
    return (this.resolveTextSvgShape(textId)?.node as Element | null) ?? null;
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

  /**
   * Bake the computed fill onto this element so it is editable as a local value: uses a
   * presentation attribute when that is enough, or inline style when a stylesheet/class would
   * override a presentation attribute.
   */
  bakeEffectiveFillToLocal(shapeId: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;
    const props = this.getShapeProperties(shape);
    if (!props.fill) return;
    const kind = props.fillSource?.kind;
    const node = shape.node as SVGGraphicsElement;
    if (kind === 'inline-style') {
      node.style.removeProperty('fill');
      this.updateFillColor(shapeId, props.fill);
    } else if (kind === 'class-or-stylesheet') {
      node.style.setProperty('fill', props.fill);
      this.doc.bumpDocumentRevision();
    } else {
      this.updateFillColor(shapeId, props.fill);
    }
  }

  /**
   * Same as {@link bakeEffectiveFillToLocal} for stroke (and width).
   */
  bakeEffectiveStrokeToLocal(shapeId: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;
    const props = this.getShapeProperties(shape);
    if (!props.stroke || props.strokeWidth === undefined || props.strokeWidth <= 0) return;
    const kind = props.strokeSource?.kind;
    const node = shape.node as SVGGraphicsElement;
    if (kind === 'inline-style') {
      node.style.removeProperty('stroke');
      node.style.removeProperty('stroke-width');
      this.addStroke(shapeId, props.stroke, props.strokeWidth);
    } else if (kind === 'class-or-stylesheet') {
      node.style.setProperty('stroke', props.stroke);
      node.style.setProperty('stroke-width', String(props.strokeWidth));
      this.doc.bumpDocumentRevision();
    } else {
      this.addStroke(shapeId, props.stroke, props.strokeWidth);
    }
  }

  restoreBakedFillPresentation(
    shapeId: string,
    before: { fillAttr: string | null; fillStyleValue: string }
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;

    if (before.fillAttr !== null) {
      shape.attr('fill', before.fillAttr);
    } else {
      shape.attr('fill', null);
    }

    const node = shape.node as SVGGraphicsElement;
    if (before.fillStyleValue) {
      node.style?.setProperty('fill', before.fillStyleValue);
    } else {
      node.style?.removeProperty('fill');
    }
    this.doc.bumpDocumentRevision();
  }

  restoreBakedStrokePresentation(
    shapeId: string,
    before: {
      strokeAttr: string | null;
      strokeStyleValue: string;
      strokeWidthAttr: string | null;
      strokeWidthStyleValue: string;
    }
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;

    if (before.strokeAttr !== null) {
      shape.attr('stroke', before.strokeAttr);
    } else {
      shape.attr('stroke', null);
    }

    const node = shape.node as SVGGraphicsElement;
    if (before.strokeStyleValue) {
      node.style?.setProperty('stroke', before.strokeStyleValue);
    } else {
      node.style?.removeProperty('stroke');
    }

    if (before.strokeWidthAttr !== null) {
      shape.attr('stroke-width', before.strokeWidthAttr);
    } else {
      shape.attr('stroke-width', null);
    }

    if (before.strokeWidthStyleValue) {
      node.style?.setProperty('stroke-width', before.strokeWidthStyleValue);
    } else {
      node.style?.removeProperty('stroke-width');
    }
    this.doc.bumpDocumentRevision();
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

      try {
        (newNode as SVGElement).style?.setProperty('cursor', 'pointer');
      } catch {
        // jsdom compatibility
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

  /**
   * @param preferScreenBounds When true (default), use **painted** screen bounds first (clip/mask,
   *   stroke, letterboxing via root CTM). Falls back to local `getBBox()` ×
   *   `getTransformToElement(root)`, then SVG.js bbox × `matrixify()` (e.g. hidden during rotate when
   *   `getBoundingClientRect` is zero).
   */

  /**
   * User shapes the marquee should select (`rect` in editor SVG coordinates).
   * - If the shape bbox is **fully inside** the marquee, it is selected (no paint sampling needed),
   *   so thin or sparse geometry still selects when fully enclosed.
   * - Otherwise, requires marquee–bbox overlap and a paint hit on **interior** samples and/or **points
   *   along the four marquee edges** (`isPointInFill` / `isPointInStroke`) so edges crossing the shape
   *   select it, while a marquee lying only in a hole (no edge through paint) does not.
   */

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    if (!this.doc.getSVGInstance()) return [];
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const scope = contentGroup ?? this.doc.getSVGInstance()!;
    const shapes = scope.find(CONTENT_SHAPE_SELECTOR) as SvgJsElement[];
    const out: ShapeProperties[] = [];
    for (const shape of shapes) {
      const id = shape.id();
      if (!id) continue;
      const bbox = this.geometry.getShapeBBox(id);
      if (!bbox || !axisAlignedRectsIntersect(rect, bbox)) continue;
      if (axisAlignedRectContains(rect, bbox)) {
        out.push(this.getShapeProperties(shape));
        continue;
      }
      const node = shape.node as SVGGraphicsElement | undefined;
      if (!node) continue;
      // `<image>`: treat as opaque in its layout box. Partial marquee must not depend on
      // `SVGImageElement.isPointInFill` (often false / inconsistent across UAs vs paths).
      if (node.tagName?.toLowerCase() === 'image') {
        out.push(this.getShapeProperties(shape));
        continue;
      }
      if (!this.shapeMarqueeIntersectsPaint(shape, rect)) continue;
      out.push(this.getShapeProperties(shape));
    }
    return out;
  }

  /**
   * Map marquee sample points from **root SVG user space** (same as `getShapeBBox`) into the
   * element-local space expected by `isPointInFill` / `isPointInStroke`. Prefer SVG.js `matrixify`
   * (matches bbox math and works in jsdom); fall back to `getCTM().inverse()` in the browser.
   */
  private marqueePointToElementLocal(
    shape: SvgJsElement,
    node: SVGGraphicsElement
  ): (p: { x: number; y: number }) => DOMPointInit {
    try {
      if (typeof shape.matrixify === 'function') {
        const m = shape.matrixify();
        if (m && typeof m.inverse === 'function') {
          const inv = m.inverse();
          const v = inv.valueOf() as { a: number; b: number; c: number; d: number; e: number; f: number };
          return (p) => ({
            x: v.a * p.x + v.c * p.y + v.e,
            y: v.b * p.x + v.d * p.y + v.f
          });
        }
      }
    } catch {
      /* try DOM CTM */
    }
    try {
      const ctm = typeof node.getCTM === 'function' ? node.getCTM() : null;
      if (ctm) {
        const inv = ctm.inverse();
        return (p) => ({
          x: inv.a * p.x + inv.c * p.y + inv.e,
          y: inv.b * p.x + inv.d * p.y + inv.f
        });
      }
    } catch {
      /* identity */
    }
    return (p) => p;
  }

  /**
   * True if some interior or **edge** sample in `marquee` hits the element's fill or stroke.
   */
  private shapeMarqueeIntersectsPaint(shape: SvgJsElement, marquee: AxisAlignedRect): boolean {
    const node = shape.node as SVGGraphicsElement;
    const points = [...marqueeSamplePoints(marquee), ...marqueeEdgeSamplePoints(marquee)];
    if (points.length === 0) return false;

    const geom = node as SVGGeometryElement;
    const hasFill = typeof geom.isPointInFill === 'function';
    const hasStroke = typeof geom.isPointInStroke === 'function';
    if (!hasFill && !hasStroke) {
      return true;
    }

    const toLocal = this.marqueePointToElementLocal(shape, node);

    for (const p of points) {
      const pt = toLocal(p);
      if (hasFill) {
        try {
          if (geom.isPointInFill(pt)) return true;
        } catch {
          /* ignore */
        }
      }
      if (hasStroke) {
        try {
          if (geom.isPointInStroke(pt)) return true;
        } catch {
          /* ignore */
        }
      }
    }
    return false;
  }

  /**
   * Clear shape highlight (no-op: overlay is driven by selection state).
   */
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
    try {
      shape.css({ cursor: 'pointer' });
    } catch {
      // jsdom may not support style.setProperty on SVG elements
    }
    this.doc.bumpDocumentRevision();
    return newId;
  }

  /**
   * Insert a `<path>` with the given `d` into the editor content group.
   * Mirrors {@link addShape} id allocation and pointer styling.
   */
  insertPathIntoContentGroup(
    d: string,
    attrs?: { fill?: string; stroke?: string; strokeWidth?: number },
    options?: { closedPath?: boolean }
  ): string | null {
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

    const defaults = this.drawingStyleDefaults.defaults();
    const pathFactory = contentGroup as G & { path(pathD: string): SvgJsElement };
    const shape = pathFactory.path(d);
    shape.id(newId);
    const fill = attrs?.fill ?? (options?.closedPath ? defaults.fill : 'none');
    shape.fill(fill);
    shape.stroke({
      color: attrs?.stroke ?? defaults.stroke,
      width: attrs?.strokeWidth ?? defaults.strokeWidth
    });
    try {
      shape.css({ cursor: 'pointer' });
    } catch {
      /* jsdom */
    }
    this.doc.bumpDocumentRevision();
    return newId;
  }

  /**
   * Insert an `<image>` into the editor content group.
   * Mirrors {@link addShape} id allocation, pointer styling, and document revision bump.
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
    try {
      shape.css({ cursor: 'pointer' });
    } catch {
      /* jsdom */
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
   * DOM index. Used by redo of AddShapeCommand. Sets cursor:pointer on the inserted element.
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

    try {
      (newNode as SVGElement).style?.setProperty('cursor', 'pointer');
    } catch {
      // jsdom compatibility
    }

    this.doc.bumpDocumentRevision();
  }

  createClipboardPayload(shapeIds: string[]): ClipboardPayload {
    if (!this.doc.getSVGInstance() || shapeIds.length === 0) return { shapes: [] };
    const orderedIds = getShapeIdsInDomOrderFromSvg(this.doc.getSVGInstance(), shapeIds);
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const contentNode = contentGroup?.node as Element | undefined;
    const children = contentNode ? Array.from(contentNode.children) : [];

    const shapes: ClipboardShapeSnapshot[] = [];
    for (const id of orderedIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const node = shape?.node as Element | undefined;
      if (!node) continue;
      const insertionIndex = children.indexOf(node);
      shapes.push({
        id,
        markup: node.outerHTML,
        insertionIndex: insertionIndex >= 0 ? insertionIndex : undefined
      });
    }
    return { shapes };
  }

  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] } {
    if (!this.doc.getSVGInstance() || payload.shapes.length === 0) {
      return { insertedIds: [], insertedMarkup: [] };
    }
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const contentNode = contentGroup?.node as Element | undefined;
    if (!contentNode) return { insertedIds: [], insertedMarkup: [] };

    const usedIds = new Set<string>();
    contentNode.querySelectorAll('[id]').forEach((el: Element) => {
      const id = el.id;
      if (id) usedIds.add(id);
    });

    const insertedIds: string[] = [];
    const insertedMarkup: string[] = [];

    for (const shape of payload.shapes) {
      const wrapper = document.createElementNS(SVG_NS, 'g');
      wrapper.innerHTML = shape.markup;
      const root = wrapper.firstElementChild;
      if (!root) continue;

      const idMap = new Map<string, string>();
      root.querySelectorAll('[id]').forEach((el) => {
        const oldId = (el as Element).id;
        if (!oldId) return;
        const newId = this.generateUniqueShapeId(usedIds, oldId);
        idMap.set(oldId, newId);
      });
      if (root.id) {
        const newRootId = this.generateUniqueShapeId(usedIds, root.id);
        idMap.set(root.id, newRootId);
      }

      root.querySelectorAll('[id]').forEach((el) => {
        const mapped = idMap.get((el as Element).id);
        if (mapped) (el as Element).id = mapped;
      });
      if (root.id) {
        const mapped = idMap.get(root.id);
        if (mapped) root.id = mapped;
      }

      this.remapInternalReferences(root, idMap);

      const inserted = root.cloneNode(true) as SVGGraphicsElement;
      if (offset.dx !== 0 || offset.dy !== 0) {
        const existing = inserted.getAttribute('transform');
        const translate = `translate(${offset.dx} ${offset.dy})`;
        inserted.setAttribute('transform', existing ? `${translate} ${existing}` : translate);
      }

      contentNode.appendChild(inserted);
      const insertedId = inserted.id;
      if (insertedId) insertedIds.push(insertedId);

      try {
        (inserted as SVGElement).style?.setProperty('cursor', 'pointer');
      } catch {
        // jsdom compatibility
      }

      insertedMarkup.push(inserted.outerHTML);
    }

    if (insertedIds.length > 0) {
      this.doc.bumpDocumentRevision();
    }
    return { insertedIds, insertedMarkup };
  }

  private generateUniqueShapeId(usedIds: Set<string>, baseId?: string): string {
    let newId = '';
    const normalizedBase = baseId && baseId.trim() ? baseId.trim() : 'shape';
    do {
      newId = `${normalizedBase}-copy-${Math.random().toString(36).slice(2, 8)}`;
    } while (usedIds.has(newId));
    usedIds.add(newId);
    return newId;
  }

  private remapInternalReferences(root: Element, idMap: Map<string, string>): void {
    const remapValue = (raw: string): string => {
      let next = raw;
      next = next.replace(URL_REF_RE, (_match, quote: string, refId: string) => {
        const mapped = idMap.get(refId);
        return mapped ? `url(${quote}#${mapped}${quote})` : _match;
      });
      if (next.startsWith('#')) {
        const refId = next.slice(1);
        const mapped = idMap.get(refId);
        if (mapped) return `#${mapped}`;
      }
      return next;
    };

    const remapNode = (node: Element): void => {
      for (const name of node.getAttributeNames()) {
        const value = node.getAttribute(name);
        if (!value) continue;
        const remapped = remapValue(value);
        if (remapped !== value) {
          node.setAttribute(name, remapped);
        }
      }
      for (const child of Array.from(node.children)) {
        remapNode(child);
      }
    };

    remapNode(root);
  }
}
