import { SVG, Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import type { GhostPreviewFragment, Rect } from './gesture-context';
import type { GhostUnionSvgPort } from '../../../history/transform-gesture-svg.port';

const GHOST_SVG_MIN_PX = 1e-6;
const EDITOR_GHOST_ATTR = 'data-editor-ghost';

export class GhostSession {
  private defPrefix: string | null = null;
  private defElements: Element[] = [];

  clearDefs(): void {
    for (const el of this.defElements) {
      el.parentNode?.removeChild(el);
    }
    this.defElements = [];
    this.defPrefix = null;
  }

  installDefs(rootSvg: SVGSVGElement, urlRefs: Set<string>): void {
    if (urlRefs.size === 0) return;
    if (!this.defPrefix) {
      this.defPrefix = `__eg_${Math.random().toString(36).slice(2)}_`;
    }
    const prefix = this.defPrefix;
    const defs = SVG(rootSvg).defs();
    urlRefs.forEach((id) => {
      const src = rootSvg.getElementById(id);
      if (!src) return;
      const clone = src.cloneNode(true) as Element;
      clone.id = `${prefix}${id}`;
      defs.node.appendChild(clone);
      this.defElements.push(clone);
    });
  }

  getDefPrefix(): string {
    return this.defPrefix ?? '';
  }

  rewriteUrlRefs(root: Element, urlRefIds: Set<string>): void {
    if (urlRefIds.size === 0) return;
    const prefix = this.defPrefix ?? '';
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

  collectClipAndMaskUrlRefs(root: Element): Set<string> {
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

  stripIds(root: Element): void {
    const walk = (el: Element) => {
      el.removeAttribute('id');
      el.removeAttribute('xml:id');
      for (const c of Array.from(el.children)) walk(c);
    };
    walk(root);
  }

  buildShapeSubtree(
    shapeId: string,
    svgInstance: Svg,
    rootSvg: SVGSVGElement
  ): { subtree: Element; urlRefs: Set<string> } | null {
    const shape = svgInstance.findOne(`#${shapeId}`) as SvgJsElement | undefined;
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
    const urlRefs = this.collectClipAndMaskUrlRefs(subtree);
    const clonedShape = subtree.matches?.(`#${shapeId}`)
      ? subtree
      : (subtree.querySelector?.(`#${shapeId}`) as Element | null);
    if (clonedShape) {
      clonedShape.setAttribute('visibility', 'visible');
    }
    this.stripIds(subtree);
    return { subtree, urlRefs };
  }

  mountFragment(
    svgInstance: Svg,
    contentGroupEl: Element,
    insertBefore: Element,
    unionBbox: Rect,
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

    contentGroupEl.insertBefore(outer.node, this.resolveInsertAnchor(contentGroupEl, insertBefore));
    return { outerGroup: outer, nestedSvg: nested, worldToUnion };
  }

  /**
   * Ensure insertBefore anchor is a direct child of `contentGroupEl`.
   * Selections may target nested descendants inside groups.
   */
  private resolveInsertAnchor(contentGroupEl: Element, insertBefore: Element): Element | null {
    if (insertBefore.parentElement === contentGroupEl) return insertBefore;
    let cur: Element | null = insertBefore;
    while (cur && cur.parentElement && cur.parentElement !== contentGroupEl) {
      cur = cur.parentElement;
    }
    if (cur && cur.parentElement === contentGroupEl) return cur;
    return null;
  }

  buildFragmentsForUnion(
    svg: GhostUnionSvgPort,
    unionBbox: Rect,
    selectedIds: string[]
  ): GhostPreviewFragment[] {
    const svgInstance = svg.getSVGInstance();
    if (!svgInstance) return [];
    const rootSvg = svgInstance.node as SVGSVGElement;
    const contentGroupEl = this.getContentGroupEl(svgInstance);
    if (!contentGroupEl) return [];

    const orderedIds = svg.getShapeIdsInDomOrder(selectedIds);
    const unionUrlRefs = new Set<string>();
    const builtList: { id: string; subtree: Element; urlRefs: Set<string> }[] = [];

    for (const id of orderedIds) {
      const built = this.buildShapeSubtree(id, svgInstance, rootSvg);
      if (!built) continue;
      built.urlRefs.forEach((r) => unionUrlRefs.add(r));
      builtList.push({ id, subtree: built.subtree, urlRefs: built.urlRefs });
    }

    if (builtList.length === 0) return [];

    this.installDefs(rootSvg, unionUrlRefs);

    const frags: GhostPreviewFragment[] = [];
    for (const { id, subtree } of builtList) {
      if (unionUrlRefs.size > 0) {
        this.rewriteUrlRefs(subtree, unionUrlRefs);
      }
      const shapeNode = svgInstance.findOne(`#${id}`)?.node as Element | undefined;
      if (!shapeNode) continue;
      frags.push(this.mountFragment(svgInstance, contentGroupEl, shapeNode, unionBbox, subtree));
    }
    return frags;
  }

  removeFragments(fragments: GhostPreviewFragment[]): void {
    for (const f of fragments) {
      f.outerGroup.remove();
    }
    this.clearDefs();
  }

  getContentGroupEl(svgInstance: Svg): Element | null {
    const cg = svgInstance.findOne('[data-editor-content-group]');
    return cg?.node ? (cg.node as Element) : null;
  }
}
