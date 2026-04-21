import { Injectable, signal, computed } from '@angular/core';
import { SVG, Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import { PaintSourceInfo, PaintType, ShapeProperties } from '../models/shape-properties.interface';
import { ArtboardModel, DEFAULT_ARTBOARD } from '../models/artboard.model';
import { type ResizeCorner, oppositeCornerForHandle } from '../utils/selection-resize';
import {
  axisAlignedRectContains,
  axisAlignedRectsIntersect,
  marqueeEdgeSamplePoints,
  marqueeSamplePoints,
  type AxisAlignedRect
} from '../utils/marquee-selection';
import { localBBoxToRootUserAabb, screenRectToRootSvgUserRect } from '../utils/svg-screen-user';

/** Class name for the editor content group (shapes live here). */
const EDITOR_CONTENT_GROUP_ID = 'data-editor-content-group';
const CONTENT_SHAPE_SELECTOR = 'circle, rect, path, polygon, ellipse, line, polyline, text, image, use';
/** Attribute to mark the viewBox rect (white fill, thin black stroke). */
const EDITOR_VIEWBOX_RECT_ATTR = 'data-editor-viewbox-rect';
/** Attribute to mark the light grey "outside" viewBox rect. */
const EDITOR_OUTSIDE_RECT_ATTR = 'data-editor-outside-rect';
/** 25% black fill for area outside document viewBox. */
const OUTSIDE_VIEWBOX_FILL = '#bfbfbf';

export interface LayerStackItem {
  id: string;
  type: string;
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface LayerTreeNode {
  id: string;
  type: string;
  name: string;
  children?: LayerTreeNode[];
  visible: boolean;
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Tags skipped when building the layer tree (non-content structural elements). */
const LAYER_TREE_SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'style', 'title', 'desc']);

interface RenderedPaint {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService {
  private getRenderedPaint(node: Element): RenderedPaint {
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
  private isStrokeVisiblyPainted(node: Element): boolean {
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

  private static readonly URL_PAINT_RE = /^\s*url\(\s*(['"]?)#([^)'"]+)\1\s*\)/i;

  /**
   * Classify a raw fill/stroke value as solid, gradient, pattern, or none.
   * Also extracts the `url(#id)` reference when present so the UI can display it.
   */
  private classifyPaint(rawValue: string | null | undefined): { type: PaintType; url?: string } {
    if (!rawValue || rawValue.trim() === '' || rawValue.trim().toLowerCase() === 'none') {
      return { type: 'none' };
    }
    const urlMatch = rawValue.match(SvgManipulationService.URL_PAINT_RE);
    if (urlMatch) {
      const refId = urlMatch[2];
      const refEl = this.svgInstance?.findOne(`#${refId}`)?.node as Element | undefined;
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

  /** Bumped when logical document content changes (for debug / reactive views); not bumped for visibility-only changes during drag. */
  readonly documentRevision = signal(0);

  private readonly _artboard = signal<ArtboardModel>({ ...DEFAULT_ARTBOARD });
  /** Reactive artboard state (width, height, origin, background color). */
  readonly artboard = computed(() => this._artboard());

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
   * Update artboard dimensions. Syncs the editor stage DOM (viewBox rect, outside rect, root stage viewBox/size).
   * Rejects zero/negative values.
   */
  setArtboardSize(width: number, height: number): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
    if (!this.svgInstance) return;

    const prev = this._artboard();
    const minX = prev.minX;
    const minY = prev.minY;

    this._artboard.set({ ...prev, width, height });
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

    this.svgInstance.size(width, height);
    const vb = this.svgInstance.viewbox();
    this.svgInstance.viewbox(
      vb.x, vb.y,
      vb.width, vb.height
    );

    this.bumpDocumentRevision();
  }

  /**
   * Update artboard background color. Editor-only (not exported as content).
   */
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

  /** Return current artboard state (read-only snapshot). */
  getArtboard(): ArtboardModel {
    return this._artboard();
  }

  /**
   * Initialize SVG.js with content: build editor-stage root (grey + viewBox rect + content group)
   * so all elements are visible; export serializes the logical document only.
   */
  initializeSVG(container: HTMLElement, svgContent: string): void {
    container.innerHTML = '';
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const hasTestMarker = svgContent.includes('svg-editor-test-icon');
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

    // If the source SVG does not declare a `viewBox`, we synthesize one from width/height.
    // In that case, Inkscape/defs-based clips can produce `getBBox()` values that include
    // geometry that is clipped away (invisible). That causes fit-to-view to center
    // invisible regions. When clips/masks exist and there is no source viewBox, clamp the
    // editor stage bounds to the synthesized viewBox so we only fit visible space.
    const hasClippingOrMasking = clipPathCount > 0 || maskCount > 0 || hasClipPathAttr || hasMaskAttr;
    if (!vb && hasClippingOrMasking) {
      uMinX = vbMinX;
      uMinY = vbMinY;
      uW = vbW;
      uH = vbH;
    }

    // Avoid visible distortion: editor stage uses SVG.js `preserveAspectRatio='none'`, which
    // stretches viewBox X/Y independently to the element's pixel width/height (initW/initH).
    // If our computed stage viewBox uW/uH ratio differs from initW/initH, the artwork will
    // appear squashed/unsquashed. Expand the stage viewBox to match the element aspect ratio.
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
        // Too wide -> increase height
        const newUHeight = uW / desiredRatio;
        uMinY = cy - newUHeight / 2;
        uH = newUHeight;
      } else {
        // Too tall -> increase width
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

    const shadowFilter = editorSvg.defs().element('filter').attr({ id: 'artboard-shadow', x: '-5%', y: '-5%', width: '110%', height: '110%' });
    shadowFilter.element('feDropShadow').attr({ dx: '0', dy: '1', stdDeviation: '3', 'flood-color': 'rgba(0,0,0,0.2)' });

    editorSvg
      .rect(vbW, vbH)
      .move(vbMinX, vbMinY)
      .fill('#ffffff')
      .stroke({ color: '#cccccc', width: 1 })
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('filter', 'url(#artboard-shadow)')
      .attr(EDITOR_VIEWBOX_RECT_ATTR, 'true');

    const contentGroup = editorSvg.group().attr(EDITOR_CONTENT_GROUP_ID, 'true');
    Array.from(svgElement.children).forEach((el) => {
      contentGroup.node.appendChild(el.cloneNode(true));
    });

    this.svgInstance = SVG(container.firstElementChild as SVGSVGElement);
    this.makeShapesClickable();
    this.bumpDocumentRevision();
  }

  private bumpDocumentRevision(): void {
    this.documentRevision.update((n) => n + 1);
  }

  /**
   * Compute union bbox of all shape elements in the given SVG element (document coordinates).
   */
  private computeContentBbox(svgElement: Element): { x: number; y: number; width: number; height: number } {
    const shapeSelectors = CONTENT_SHAPE_SELECTOR;
    const computeFromRoot = (root: Element): { x: number; y: number; width: number; height: number } | null => {
      const nodes = root.querySelectorAll(shapeSelectors);
      if (nodes.length === 0) return null;
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
      if (minX === Infinity) return null;
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };

    const fallbackFromDocumentViewBox = (): { x: number; y: number; width: number; height: number } => {
      const parts = this.documentViewBox.split(/\s+/);
      const w = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
      const h = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
      return { x: 0, y: 0, width: w, height: h };
    };

    // First attempt: compute from the parsed (detached) DOM.
    const first = computeFromRoot(svgElement);
    if (first && Number.isFinite(first.width) && Number.isFinite(first.height) && first.width !== 0 && first.height !== 0) {
      return first;
    }

    // Second attempt (fix): getBBox() often returns empty/zero boxes for detached SVG nodes.
    // Import the parsed SVG into the real DOM (offscreen) so bbox math can succeed.
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
        // ignore and fall back
      } finally {
        tempHost.remove();
      }
    }

    return fallbackFromDocumentViewBox();
  }

  /**
   * Make all shapes in the content group clickable (excludes editor viewBox/outside rects).
   */
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

  /**
   * Get shape properties by element
   */
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

    const fillClassification = this.classifyPaint(fillCss || rawFill);
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

    const strokeClassification = this.classifyPaint(strokeCss || rawStroke);
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

    return {
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

  /**
   * All editor content shapes under the same nearest `clip-path` or `mask` ancestor as `shape`
   * (so the clipped group moves/resizes as one). If none, returns only this shape.
   */
  getShapePropertiesInSameClipGroup(shape: SvgJsElement): ShapeProperties[] {
    const node = shape.node as Element | null;
    const single = (): ShapeProperties[] => [this.getShapeProperties(shape)];
    if (!node || !this.svgInstance) return single();
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
      const s = this.svgInstance!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (s) out.push(this.getShapeProperties(s));
    });
    return out.length > 0 ? out : single();
  }

  /**
   * Expand each hit to its clip/mask group and dedupe (marquee order preserved).
   */
  expandSelectionByClipGroups(shapes: ShapeProperties[]): ShapeProperties[] {
    if (shapes.length === 0) return [];
    const seen = new Set<string>();
    const result: ShapeProperties[] = [];
    for (const s of shapes) {
      const shape = this.svgInstance?.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!shape) continue;
      const group = this.getShapePropertiesInSameClipGroup(shape);
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
   * Update fill color of a shape
   */
  updateFillColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.fill(color);
      this.bumpDocumentRevision();
    }
  }

  /**
   * Add stroke to a shape
   */
  addStroke(shapeId: string, color: string, width: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke({ color, width });
      this.bumpDocumentRevision();
    }
  }

  /**
   * Remove stroke from a shape
   */
  removeStroke(shapeId: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke('none');
      this.bumpDocumentRevision();
    }
  }

  /**
   * Update stroke color
   */
  updateStrokeColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.stroke({ color });
      this.bumpDocumentRevision();
    }
  }

  /**
   * Update `stroke-dasharray` on a shape. Pass `'none'` or `''` to remove dashing.
   */
  updateStrokeDasharray(shapeId: string, dasharray: string): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape) return;
    const normalized = dasharray.trim();
    if (!normalized || normalized.toLowerCase() === 'none') {
      shape.attr('stroke-dasharray', null);
    } else {
      shape.attr('stroke-dasharray', normalized);
    }
    this.bumpDocumentRevision();
  }

  /**
   * Update `stroke-dashoffset` on a shape. Pass `0` to reset.
   */
  updateStrokeDashoffset(shapeId: string, dashoffset: number): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape) return;
    if (dashoffset === 0) {
      shape.attr('stroke-dashoffset', null);
    } else {
      shape.attr('stroke-dashoffset', dashoffset);
    }
    this.bumpDocumentRevision();
  }

  /**
   * Update opacity of a shape
   */
  updateOpacity(shapeId: string, opacity: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.opacity(opacity);
      this.bumpDocumentRevision();
    }
  }

  /**
   * Nearest ancestor `<g>` with an `id` between this shape and the editor content group (for
   * "select parent" when fill/stroke is inherited).
   */
  getNearestGroupAncestorId(shapeId: string): string | null {
    if (!this.svgInstance) return null;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const start = shape?.node as Element | null;
    const contentRoot = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`)?.node as Element | null;
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
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement | undefined;
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
      this.bumpDocumentRevision();
    } else {
      this.updateFillColor(shapeId, props.fill);
    }
  }

  /**
   * Same as {@link bakeEffectiveFillToLocal} for stroke (and width).
   */
  bakeEffectiveStrokeToLocal(shapeId: string): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement | undefined;
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
      this.bumpDocumentRevision();
    } else {
      this.addStroke(shapeId, props.stroke, props.strokeWidth);
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
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
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
    this.bumpDocumentRevision();
  }

  /**
   * Show or hide a shape (e.g. hide original during drag, show again on drop).
   */
  setShapeVisibility(shapeId: string, visible: boolean): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (shape) {
      shape.attr('visibility', visible ? 'visible' : 'hidden');
    }
  }

  /**
   * @param preferScreenBounds When true (default), use **painted** screen bounds first (clip/mask,
   *   stroke, letterboxing via root CTM). Falls back to local `getBBox()` ×
   *   `getTransformToElement(root)`, then SVG.js bbox × `matrixify()` (e.g. hidden during rotate when
   *   `getBoundingClientRect` is zero).
   */
  getShapeBBox(
    shapeId: string,
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    const preferScreenBounds = options?.preferScreenBounds !== false;
    if (!this.svgInstance) return null;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape?.node) return null;
    const node = shape.node as SVGGraphicsElement;
    const rootSvg = this.svgInstance.node as SVGSVGElement | null;

    // Painted bounds (default): `getBBox()` ignores clip-path; screen rect matches what the user sees.
    if (
      preferScreenBounds &&
      rootSvg &&
      typeof node.getBoundingClientRect === 'function' &&
      typeof rootSvg.getBoundingClientRect === 'function'
    ) {
      const rr = rootSvg.getBoundingClientRect();
      const sr = node.getBoundingClientRect();
      if (
        rr.width > 0 &&
        rr.height > 0 &&
        sr.width > 0 &&
        sr.height > 0 &&
        Number.isFinite(sr.left) &&
        Number.isFinite(sr.top)
      ) {
        const fromCtm = screenRectToRootSvgUserRect(rootSvg, sr);
        if (fromCtm) {
          return fromCtm;
        }
        // Legacy linear map (wrong for letterboxed `meet` / non-uniform `none`); kept if CTM APIs are missing.
        const vbAttr = rootSvg.getAttribute('viewBox') || this.documentViewBox;
        const parts = vbAttr.split(/\s+/);
        const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
        const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
        const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
        const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
        const x = vbMinX + ((sr.left - rr.left) / rr.width) * vbW;
        const y = vbMinY + ((sr.top - rr.top) / rr.height) * vbH;
        const width = (sr.width / rr.width) * vbW;
        const height = (sr.height / rr.height) * vbH;
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          return { x, y, width, height };
        }
      }
    }

    // Local `getBBox()` × `getTransformToElement(root)`: full chain to root SVG user space
    // (parent `<g>` transforms, not only this node’s `transform` — unlike SVG.js `matrixify()`).
    if (rootSvg && typeof node.getBBox === 'function') {
      try {
        const local = node.getBBox();
        const fromDom = localBBoxToRootUserAabb(node, rootSvg, local);
        if (
          fromDom &&
          Number.isFinite(fromDom.width) &&
          Number.isFinite(fromDom.height) &&
          fromDom.width >= 0 &&
          fromDom.height >= 0
        ) {
          return fromDom;
        }
      } catch {
        // fall through: e.g. jsdom / detached node
      }
    }

    // svg.js bbox() × matrixify(): fallback when `getTransformToElement` is unavailable (no full
    // ancestor chain), same as before.
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
   * @see getShapeBBox for `options.preferScreenBounds`
   */
  getUnionBBox(
    shapeIds: string[],
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    const bboxes = shapeIds
      .map((id) => this.getShapeBBox(id, options))
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
   * User shapes the marquee should select (`rect` in editor SVG coordinates).
   * - If the shape bbox is **fully inside** the marquee, it is selected (no paint sampling needed),
   *   so thin or sparse geometry still selects when fully enclosed.
   * - Otherwise, requires marquee–bbox overlap and a paint hit on **interior** samples and/or **points
   *   along the four marquee edges** (`isPointInFill` / `isPointInStroke`) so edges crossing the shape
   *   select it, while a marquee lying only in a hole (no edge through paint) does not.
   */
  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    if (!this.svgInstance) return [];
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const scope = contentGroup ?? this.svgInstance;
    const shapes = scope.find(CONTENT_SHAPE_SELECTOR) as SvgJsElement[];
    const out: ShapeProperties[] = [];
    for (const shape of shapes) {
      const id = shape.id();
      if (!id) continue;
      const bbox = this.getShapeBBox(id);
      if (!bbox || !axisAlignedRectsIntersect(rect, bbox)) continue;
      if (axisAlignedRectContains(rect, bbox)) {
        out.push(this.getShapeProperties(shape));
        continue;
      }
      const node = shape.node as SVGGraphicsElement | undefined;
      if (!node || !this.shapeMarqueeIntersectsPaint(shape, rect)) continue;
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
    if (!this.svgInstance || shapeIds.length === 0) return;
    const props: ShapeProperties[] = [];
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (shape) props.push(this.getShapeProperties(shape));
    }
    if (props.length === 0) return;
    const expanded = this.expandSelectionByClipGroups(props);
    const toRemove = [...new Set(expanded.map((p) => p.id))];
    for (const id of toRemove) {
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (shape) shape.remove();
    }
    if (toRemove.length > 0) this.bumpDocumentRevision();
  }

  /**
   * Export the logical document (viewBox + content), not the editor-stage SVG.
   *
   * Note: consumers that re-parse this as strict XML (e.g. the SVG debug panel) can fail on
   * Inkscape-style files when prefixed elements lose root `xmlns:*` declarations; see the future-work
   * note in `svg-debug-xml.ts` (post-processing + user warning).
   */
  exportSVG(): string {
    if (!this.svgInstance) return '';
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return this.svgInstance.svg();
    const xmlns = this.svgInstance.node.getAttribute('xmlns') || 'http://www.w3.org/2000/svg';
    const inner = (contentGroup.node as Element).innerHTML;
    const ab = this._artboard();
    return `<svg xmlns="${xmlns}" width="${ab.width}" height="${ab.height}" viewBox="${this.documentViewBox}" preserveAspectRatio="${this.documentPreserveAspectRatio}">${inner}</svg>`;
  }

  /**
   * Get SVG instance for direct manipulation
   */
  getSVGInstance(): Svg | null {
    return this.svgInstance;
  }

  /**
   * Return all editable content shapes in DOM/painter order.
   * First item is visually back-most, last item is front-most.
   */
  getLayerStackItems(): LayerStackItem[] {
    if (!this.svgInstance) return [];
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return [];
    const out: LayerStackItem[] = [];
    const contentShapeTags = new Set(CONTENT_SHAPE_SELECTOR.split(', '));

    const walk = (parent: Element): void => {
      for (const child of Array.from(parent.children)) {
        const tagName = child.tagName?.toLowerCase?.() || '';
        if (tagName === 'g') {
          walk(child);
          continue;
        }
        if (!contentShapeTags.has(tagName)) continue;
        const id = (child as Element).id;
        if (!id) continue;
        const shape = this.svgInstance!.findOne(`#${id}`) as SvgJsElement | null;
        const renderedPaint = this.getRenderedPaint(child as Element);
        const rawFill = shape ? (shape.attr('fill') as string | null) : null;
        const rawStroke = shape ? (shape.attr('stroke') as string | null) : null;
        const rawStrokeWidth = shape ? Number.parseFloat(String(shape.attr('stroke-width') ?? '')) : Number.NaN;
        const rawOpacity = shape ? Number.parseFloat(String(shape.attr('opacity') ?? '')) : Number.NaN;
        const fill = renderedPaint.fill ?? (rawFill || undefined);
        const strokeVisible = this.isStrokeVisiblyPainted(child as Element);
        let stroke: string | undefined;
        let strokeWidth: number | undefined;
        if (strokeVisible) {
          stroke =
            renderedPaint.stroke && renderedPaint.stroke !== 'none'
              ? renderedPaint.stroke
              : rawStroke && rawStroke !== 'none'
                ? rawStroke
                : undefined;
          const w = Number.isFinite(renderedPaint.strokeWidth ?? Number.NaN)
            ? (renderedPaint.strokeWidth as number)
            : Number.isFinite(rawStrokeWidth)
              ? rawStrokeWidth
              : 0;
          strokeWidth = Number.isFinite(w) ? w : 0;
        }
        const opacity = Number.isFinite(renderedPaint.opacity ?? Number.NaN)
          ? renderedPaint.opacity
          : (Number.isFinite(rawOpacity) ? rawOpacity : undefined);
        out.push({
          id,
          type: tagName,
          elementMarkup: (child as Element).outerHTML,
          fill,
          stroke,
          strokeWidth,
          opacity
        });
      }
    };
    walk(contentGroup.node as Element);
    return out;
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

    const walk = (parent: Element): void => {
      for (const child of Array.from(parent.children)) {
        const tagName = child.tagName?.toLowerCase?.() || '';
        if (tagName === 'g') {
          walk(child);
          continue;
        }
        const id = (child as Element).id;
        if (id && idSet.has(id)) ordered.push(id);
      }
    };
    walk(contentGroup.node as Element);
    return ordered.length > 0 ? ordered : [...shapeIds];
  }

  /**
   * Rotation pivot in root SVG user space: average of each shape's local bbox center
   * (`shape.bbox()` → cx/cy) transformed by {@link SvgJsElement#matrixify}. Unlike the axis-aligned
   * union bbox center, this stays aligned with the painted rotation center after prior rotations
   * (the union AABB center drifts for non-square selections).
   */
  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null {
    if (!this.svgInstance || shapeIds.length === 0) return null;
    const pts: { x: number; y: number }[] = [];
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!shape || typeof shape.bbox !== 'function' || typeof shape.matrixify !== 'function') continue;
      try {
        const local = shape.bbox();
        const m = shape.matrixify();
        if (!local || !m) continue;
        const w = local.w ?? local.width;
        const h = local.h ?? local.height;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
        const cx = Number.isFinite(local.cx) ? local.cx : local.x + w / 2;
        const cy = Number.isFinite(local.cy) ? local.cy : local.y + h / 2;
        const v = m.valueOf() as { a: number; b: number; c: number; d: number; e: number; f: number };
        pts.push({
          x: v.a * cx + v.c * cy + v.e,
          y: v.b * cx + v.d * cy + v.f
        });
      } catch {
        /* skip */
      }
    }
    if (pts.length === 0) {
      const u = this.getUnionBBox(shapeIds);
      return u ? { x: u.x + u.width / 2, y: u.y + u.height / 2 } : null;
    }
    const sx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const sy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: sx, y: sy };
  }

  /**
   * Clone each shape's current transform matrix for resize commit (SVG.js).
   */
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix> {
    const map = new Map<string, Matrix>();
    if (!this.svgInstance) return map;
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
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
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
    this.bumpDocumentRevision();
  }

  /**
   * Apply rotation about a pivot in root SVG user space (same as union bbox / pointer mapping).
   * Composes: newMatrix = rotate(deg,cx,cy) * snapshotMatrix (`angleDeg` in degrees, SVG.js convention).
   */
  applyUnionRotationFromSnapshot(
    shapeIds: string[],
    pivot: { x: number; y: number },
    angleDeg: number,
    snapshot: Map<string, Matrix>
  ): void {
    if (!this.svgInstance) return;
    if (!Number.isFinite(angleDeg)) return;
    const T = new Matrix().rotate(angleDeg, pivot.x, pivot.y);
    for (const id of shapeIds) {
      const shape = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
    this.bumpDocumentRevision();
  }

  /**
   * Build a hierarchical tree of the content group. Groups appear as branch nodes with `children`;
   * leaves are shapes. DOM order (first child = back-most in paint order).
   */
  getLayerTree(): LayerTreeNode[] {
    if (!this.svgInstance) return [];
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return [];
    const contentShapeTags = new Set(CONTENT_SHAPE_SELECTOR.split(', '));

    const buildNode = (child: Element): LayerTreeNode | null => {
      const tagName = child.tagName?.toLowerCase?.() || '';
      if (LAYER_TREE_SKIP_TAGS.has(tagName)) return null;

      const id = child.id || '';
      const name = child.getAttribute('data-name') || id || tagName;
      const visible = !this.isNodeHidden(child);
      const elementMarkup = child.outerHTML;

      if (tagName === 'g') {
        const children: LayerTreeNode[] = [];
        for (const grandchild of Array.from(child.children)) {
          const node = buildNode(grandchild);
          if (node) children.push(node);
        }
        const paint = this.getRenderedPaint(child);
        return { id, type: 'g', name, children, visible, elementMarkup, ...paint };
      }

      if (!contentShapeTags.has(tagName)) return null;
      if (!id) return null;

      const shape = this.svgInstance!.findOne(`#${id}`) as SvgJsElement | null;
      const renderedPaint = this.getRenderedPaint(child);
      const rawFill = shape ? (shape.attr('fill') as string | null) : null;
      const rawStroke = shape ? (shape.attr('stroke') as string | null) : null;
      const rawStrokeWidth = shape ? Number.parseFloat(String(shape.attr('stroke-width') ?? '')) : Number.NaN;
      const rawOpacity = shape ? Number.parseFloat(String(shape.attr('opacity') ?? '')) : Number.NaN;
      const fill = renderedPaint.fill ?? (rawFill || undefined);
      const strokePainted = this.isStrokeVisiblyPainted(child);
      let stroke: string | undefined;
      let strokeWidth: number | undefined;
      if (strokePainted) {
        stroke =
          renderedPaint.stroke && renderedPaint.stroke !== 'none'
            ? renderedPaint.stroke
            : rawStroke && rawStroke !== 'none'
              ? rawStroke
              : undefined;
        const w = Number.isFinite(renderedPaint.strokeWidth ?? Number.NaN)
          ? (renderedPaint.strokeWidth as number)
          : Number.isFinite(rawStrokeWidth)
            ? rawStrokeWidth
            : 0;
        strokeWidth = Number.isFinite(w) ? w : 0;
      }
      const opacity = Number.isFinite(renderedPaint.opacity ?? Number.NaN)
        ? renderedPaint.opacity
        : (Number.isFinite(rawOpacity) ? rawOpacity : undefined);

      return { id, type: tagName, name, visible, elementMarkup, fill, stroke, strokeWidth, opacity };
    };

    const root = contentGroup.node as Element;
    const result: LayerTreeNode[] = [];
    for (const child of Array.from(root.children)) {
      const node = buildNode(child);
      if (node) result.push(node);
    }
    return result;
  }

  /** Whether a DOM node is hidden via `display:none` or `visibility:hidden`. */
  private isNodeHidden(node: Element): boolean {
    const displayAttr = node.getAttribute('display');
    if (displayAttr === 'none') return true;
    const display = (node as HTMLElement | SVGElement).style?.getPropertyValue('display')?.trim();
    if (display === 'none') return true;
    const visibility = node.getAttribute('visibility');
    if (visibility === 'hidden') return true;
    const visStyle = (node as HTMLElement | SVGElement).style?.getPropertyValue('visibility')?.trim();
    if (visStyle === 'hidden') return true;
    return false;
  }

  /**
   * Move the element one position forward in its parent's children (swap with next sibling).
   * Returns true if moved.
   */
  moveElementForward(elementId: string): boolean {
    if (!this.svgInstance) return false;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const next = node.nextElementSibling;
    if (!next || !node.parentNode) return false;
    node.parentNode.insertBefore(next, node);
    this.bumpDocumentRevision();
    return true;
  }

  /**
   * Move the element one position backward in its parent's children (swap with previous sibling).
   * Returns true if moved.
   */
  moveElementBackward(elementId: string): boolean {
    if (!this.svgInstance) return false;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const prev = node.previousElementSibling;
    if (!prev || !node.parentNode) return false;
    node.parentNode.insertBefore(node, prev);
    this.bumpDocumentRevision();
    return true;
  }

  /** Move element to last child of its parent (front-most in paint order). */
  moveElementToFront(elementId: string): boolean {
    if (!this.svgInstance) return false;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const parent = node.parentNode;
    if (!parent) return false;
    if (node === parent.lastElementChild) return false;
    parent.appendChild(node);
    this.bumpDocumentRevision();
    return true;
  }

  /** Move element to first child of its parent (back-most in paint order). */
  moveElementToBack(elementId: string): boolean {
    if (!this.svgInstance) return false;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const parent = node.parentNode;
    if (!parent) return false;
    if (node === parent.firstElementChild) return false;
    parent.insertBefore(node, parent.firstElementChild);
    this.bumpDocumentRevision();
    return true;
  }

  /**
   * Toggle visibility of an element (shape or group).
   * If currently visible, set `display: none`. If hidden, remove `display: none`.
   * Returns the new visibility state (true = now visible).
   */
  toggleLayerVisibility(elementId: string): boolean {
    if (!this.svgInstance) return true;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return true;
    const hidden = this.isNodeHidden(el.node as Element);
    if (hidden) {
      el.attr('display', null);
      try { (el.node as SVGElement).style?.removeProperty('display'); } catch { /* jsdom */ }
      el.attr('visibility', null);
    } else {
      el.attr('display', 'none');
    }
    this.bumpDocumentRevision();
    return hidden;
  }

  /** Check if an element has `display:none` or `visibility:hidden`. */
  isElementVisible(elementId: string): boolean {
    if (!this.svgInstance) return true;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return true;
    return !this.isNodeHidden(el.node as Element);
  }

  /**
   * Create a new `<g>` element containing the given elements. The group is inserted at the
   * position of the first element in DOM order; elements are moved into it preserving relative
   * order. Returns the new group id or null on failure.
   */
  groupSelectedElements(elementIds: string[]): string | null {
    if (!this.svgInstance || elementIds.length === 0) return null;
    const contentGroup = this.svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return null;

    const elements: { el: SvgJsElement; node: Element }[] = [];
    for (const id of elementIds) {
      const el = this.svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (el?.node) elements.push({ el, node: el.node as Element });
    }
    if (elements.length === 0) return null;

    // Sort into DOM order by comparing document position
    elements.sort((a, b) => {
      const pos = a.node.compareDocumentPosition(b.node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const firstNode = elements[0].node;
    const parent = firstNode.parentNode;
    if (!parent) return null;

    const groupId = `group-${Math.random().toString(36).substr(2, 9)}`;
    const svgNs = 'http://www.w3.org/2000/svg';
    const gEl = document.createElementNS(svgNs, 'g');
    gEl.setAttribute('id', groupId);

    parent.insertBefore(gEl, firstNode);
    for (const { node } of elements) {
      gEl.appendChild(node);
    }

    this.bumpDocumentRevision();
    return groupId;
  }

  /**
   * Ungroup: move children of a `<g>` to its parent (at the group's position), then remove
   * the empty `<g>`. Returns the ids of the ungrouped children.
   */
  ungroupElement(groupId: string): string[] {
    if (!this.svgInstance) return [];
    const el = this.svgInstance.findOne(`#${groupId}`) as SvgJsElement | undefined;
    if (!el?.node) return [];
    const node = el.node as Element;
    if (node.tagName?.toLowerCase() !== 'g') return [];
    const parent = node.parentNode;
    if (!parent) return [];

    const childIds: string[] = [];
    const children = Array.from(node.children);
    for (const child of children) {
      if (child.id) childIds.push(child.id);
      parent.insertBefore(child, node);
    }
    parent.removeChild(node);
    this.bumpDocumentRevision();
    return childIds;
  }

  /** Set a `data-name` attribute on the element for display in the layer panel. */
  renameElement(elementId: string, newName: string): void {
    if (!this.svgInstance) return;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (el) {
      el.attr('data-name', newName);
      this.bumpDocumentRevision();
    }
  }

  /** Return `data-name` attribute if set, else the element id. */
  getElementName(elementId: string): string {
    if (!this.svgInstance) return elementId;
    const el = this.svgInstance.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el) return elementId;
    const name = el.attr('data-name') as string | null;
    return name || el.id() || elementId;
  }
}
