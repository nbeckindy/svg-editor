import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../../models/shape-properties.interface';
import type { SvgShapePaintPort, SvgShapePaintReadout } from './svg-shape-paint.port';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { SvgShapeTextService } from './svg-shape-text.service';
import { SvgShapeRectService } from './svg-shape-rect.service';

@Injectable({ providedIn: 'root' })
export class SvgShapePaintService implements SvgShapePaintPort {
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly text = inject(SvgShapeTextService);
  private readonly rect = inject(SvgShapeRectService);

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
    const urlMatch = rawValue.match(SvgShapePaintService.URL_PAINT_RE);
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

    const textFields = this.text.readShapeTextFields(element, node);
    const rectFields = this.rect.readShapeRectFields(element, node);

    return {
      ...textFields,
      ...rectFields,
      id: element.id() || '',
      type: element.type,
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
}
