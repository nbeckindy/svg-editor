import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import {
  CONTENT_SHAPE_SELECTOR,
  EDITOR_CONTENT_GROUP_ID,
  LAYER_TREE_SKIP_TAGS
} from './svg-editor-stage.constants';
import type { LayerStackItem, LayerTreeNode, SvgLayerStructurePort } from './svg-layer-structure.port';
import { SvgShapeContentService } from './svg-shape-content.service';
import { getShapeIdsInDomOrderFromSvg } from '../utils/svg-shape-ids-dom-order';
import { isSvgEditorNodeHidden } from '../utils/svg-node-visibility';

@Injectable({ providedIn: 'root' })
export class SvgLayerStructureService implements SvgLayerStructurePort {
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly shapes = inject(SvgShapeContentService);

  getShapeIdsInDomOrder(shapeIds: string[]): string[] {
    return getShapeIdsInDomOrderFromSvg(this.doc.getSVGInstance(), shapeIds);
  }

  moveElementForward(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return false;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const next = node.nextElementSibling;
    if (!next || !node.parentNode) return false;
    node.parentNode.insertBefore(next, node);
    this.doc.bumpDocumentRevision();
    return true;
  }

  moveElementBackward(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return false;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const prev = node.previousElementSibling;
    if (!prev || !node.parentNode) return false;
    node.parentNode.insertBefore(node, prev);
    this.doc.bumpDocumentRevision();
    return true;
  }

  moveElementToFront(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return false;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const parent = node.parentNode;
    if (!parent) return false;
    if (node === parent.lastElementChild) return false;
    parent.appendChild(node);
    this.doc.bumpDocumentRevision();
    return true;
  }

  moveElementToBack(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return false;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return false;
    const node = el.node as Element;
    const parent = node.parentNode;
    if (!parent) return false;
    if (node === parent.firstElementChild) return false;
    parent.insertBefore(node, parent.firstElementChild);
    this.doc.bumpDocumentRevision();
    return true;
  }

  restoreElementSiblingOrder(elementId: string, oldIndex: number): void {
    if (!this.doc.getSVGInstance() || oldIndex < 0) return;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return;
    const node = el.node as Element;
    const parent = node.parentElement;
    if (!parent) return;
    const children = parent.children;
    if (oldIndex >= children.length) {
      parent.appendChild(node);
    } else {
      parent.insertBefore(node, children[oldIndex]);
    }
  }

  toggleLayerVisibility(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return true;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return true;
    const hidden = isSvgEditorNodeHidden(el.node as Element);
    if (hidden) {
      el.attr('display', null);
      try {
        (el.node as SVGElement).style?.removeProperty('display');
      } catch {
        /* jsdom */
      }
      el.attr('visibility', null);
    } else {
      el.attr('display', 'none');
    }
    this.doc.bumpDocumentRevision();
    return hidden;
  }

  isElementVisible(elementId: string): boolean {
    if (!this.doc.getSVGInstance()) return true;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return true;
    return !isSvgEditorNodeHidden(el.node as Element);
  }

  groupSelectedElements(elementIds: string[]): string | null {
    if (!this.doc.getSVGInstance() || elementIds.length === 0) return null;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return null;

    const elements: { el: SvgJsElement; node: Element }[] = [];
    for (const id of elementIds) {
      const el = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (el?.node) elements.push({ el, node: el.node as Element });
    }
    if (elements.length === 0) return null;

    elements.sort((a, b) => {
      const pos = a.node.compareDocumentPosition(b.node);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    const formerParents = new Set<Element>();
    for (const { node } of elements) {
      const p = node.parentElement;
      if (p) formerParents.add(p);
    }

    const contentRoot = contentGroup.node as Element;
    const firstNode = elements[0].node;
    let anchor: Element = firstNode;
    while (anchor.parentElement && anchor.parentElement !== contentRoot) {
      anchor = anchor.parentElement;
    }

    const groupId = `group-${Math.random().toString(36).substr(2, 9)}`;
    const svgNs = 'http://www.w3.org/2000/svg';
    const gEl = document.createElementNS(svgNs, 'g');
    gEl.setAttribute('id', groupId);

    contentRoot.insertBefore(gEl, anchor);
    for (const { node } of elements) {
      gEl.appendChild(node);
    }

    this.pruneEmptyGroupsAfterReparent(formerParents);
    this.doc.bumpDocumentRevision();
    return groupId;
  }

  ungroupElement(groupId: string): string[] {
    const childIds = this.ungroupOneGroupNoBump(groupId);
    if (childIds !== null) {
      this.doc.bumpDocumentRevision();
      return childIds;
    }
    return [];
  }

  ungroupElements(
    groupIds: string[]
  ): { allChildElementIds: string[]; undoSnapshots: string[][] } {
    if (!this.doc.getSVGInstance() || groupIds.length === 0) {
      return { allChildElementIds: [], undoSnapshots: [] };
    }

    const leafIds = this.filterLeafGroupsForUngroup(groupIds);
    const sorted = this.sortGroupIdsByDocumentOrder(leafIds);
    const undoSnapshots: string[][] = [];
    let changed = false;

    for (const gid of sorted) {
      const snap = this.snapshotDirectChildIds(gid);
      if (snap === null) continue;
      const result = this.ungroupOneGroupNoBump(gid);
      if (result === null) continue;
      undoSnapshots.push(snap);
      changed = true;
    }

    if (changed) this.doc.bumpDocumentRevision();

    const flat = undoSnapshots.flat();
    const allChildElementIds = this.sortElementIdsByDocumentOrder(flat);
    return { allChildElementIds, undoSnapshots };
  }

  renameElement(elementId: string, newName: string): void {
    if (!this.doc.getSVGInstance()) return;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (el) {
      el.attr('data-name', newName);
      this.doc.bumpDocumentRevision();
    }
  }

  getElementName(elementId: string): string {
    if (!this.doc.getSVGInstance()) return elementId;
    const el = this.doc.getSVGInstance()!.findOne(`#${elementId}`) as SvgJsElement | undefined;
    if (!el) return elementId;
    const name = el.attr('data-name') as string | null;
    return name || el.id() || elementId;
  }

  /**
   * Return all editable content shapes in DOM/painter order.
   * First item is visually back-most, last item is front-most.
   */
  getLayerStackItems(): LayerStackItem[] {
    if (!this.doc.getSVGInstance()) return [];
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
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
        const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | null;
        const renderedPaint = this.shapes.getRenderedPaint(child as Element);
        const rawFill = shape ? (shape.attr('fill') as string | null) : null;
        const rawStroke = shape ? (shape.attr('stroke') as string | null) : null;
        const rawStrokeWidth = shape
          ? Number.parseFloat(String(shape.attr('stroke-width') ?? ''))
          : Number.NaN;
        const rawOpacity = shape ? Number.parseFloat(String(shape.attr('opacity') ?? '')) : Number.NaN;
        const fill = renderedPaint.fill ?? (rawFill || undefined);
        const strokeVisible = this.shapes.isStrokeVisiblyPainted(child as Element);
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
   * Build a hierarchical tree of the content group. Groups appear as branch nodes with `children`;
   * leaves are shapes. DOM order (first child = back-most in paint order).
   */
  getLayerTree(): LayerTreeNode[] {
    if (!this.doc.getSVGInstance()) return [];
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return [];
    const contentShapeTags = new Set(CONTENT_SHAPE_SELECTOR.split(', '));

    const buildNode = (child: Element): LayerTreeNode | null => {
      const tagName = child.tagName?.toLowerCase?.() || '';
      if (LAYER_TREE_SKIP_TAGS.has(tagName)) return null;

      const id = child.id || '';
      const name = child.getAttribute('data-name') || id || tagName;
      const visible = !isSvgEditorNodeHidden(child);
      const elementMarkup = child.outerHTML;

      if (tagName === 'g') {
        const children: LayerTreeNode[] = [];
        for (const grandchild of Array.from(child.children)) {
          const node = buildNode(grandchild);
          if (node) children.push(node);
        }
        const paint = this.shapes.getRenderedPaint(child);
        return { id, type: 'g', name, children, visible, elementMarkup, ...paint };
      }

      if (!contentShapeTags.has(tagName)) return null;
      if (!id) return null;

      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | null;
      const renderedPaint = this.shapes.getRenderedPaint(child);
      const rawFill = shape ? (shape.attr('fill') as string | null) : null;
      const rawStroke = shape ? (shape.attr('stroke') as string | null) : null;
      const rawStrokeWidth = shape
        ? Number.parseFloat(String(shape.attr('stroke-width') ?? ''))
        : Number.NaN;
      const rawOpacity = shape ? Number.parseFloat(String(shape.attr('opacity') ?? '')) : Number.NaN;
      const fill = renderedPaint.fill ?? (rawFill || undefined);
      const strokePainted = this.shapes.isStrokeVisiblyPainted(child);
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

  private snapshotDirectChildIds(groupId: string): string[] | null {
    if (!this.doc.getSVGInstance()) return null;
    const el = this.doc.getSVGInstance()!.findOne(`#${groupId}`) as SvgJsElement | undefined;
    if (!el?.node) return null;
    const node = el.node as Element;
    if (node.tagName?.toLowerCase() !== 'g') return null;
    return Array.from(node.children)
      .filter((c): c is Element => c instanceof Element && Boolean(c.id))
      .map((c) => c.id);
  }

  private isStrictAncestorElement(ancestorId: string, descendantId: string): boolean {
    if (!this.doc.getSVGInstance()) return false;
    const anc = this.doc.getSVGInstance()!.findOne(`#${ancestorId}`)?.node as Element | undefined;
    const desc = this.doc.getSVGInstance()!.findOne(`#${descendantId}`)?.node as Element | undefined;
    if (!anc || !desc) return false;
    return anc !== desc && anc.contains(desc);
  }

  private filterLeafGroupsForUngroup(groupIds: string[]): string[] {
    const unique = [...new Set(groupIds)];
    return unique.filter(
      (id) => !unique.some((other) => other !== id && this.isStrictAncestorElement(id, other))
    );
  }

  private sortGroupIdsByDocumentOrder(ids: string[]): string[] {
    const svg = this.doc.getSVGInstance();
    if (!svg) return ids;
    return [...ids].sort((a, b) => {
      const na = svg.findOne(`#${a}`)?.node;
      const nb = svg.findOne(`#${b}`)?.node;
      if (!na || !nb) return 0;
      const pos = na.compareDocumentPosition(nb);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  private sortElementIdsByDocumentOrder(ids: string[]): string[] {
    const svg = this.doc.getSVGInstance();
    if (!svg) return ids;
    const unique = [...new Set(ids)];
    return unique.sort((a, b) => {
      const na = svg.findOne(`#${a}`)?.node;
      const nb = svg.findOne(`#${b}`)?.node;
      if (!na || !nb) return 0;
      const pos = na.compareDocumentPosition(nb);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  private isRemovableEmptyGroup(el: Element): boolean {
    if (el.tagName?.toLowerCase() !== 'g') return false;
    if (el.getAttribute(EDITOR_CONTENT_GROUP_ID) === 'true') return false;
    return el.children.length === 0;
  }

  private pruneEmptyGroupsAfterReparent(formerParents: ReadonlySet<Element>): void {
    for (const start of formerParents) {
      let el: Element | null = start;
      while (el) {
        if (!this.isRemovableEmptyGroup(el)) break;
        const nextUp: Element | null = el.parentElement;
        el.parentNode?.removeChild(el);
        el = nextUp;
      }
    }
  }

  private ungroupOneGroupNoBump(groupId: string): string[] | null {
    if (!this.doc.getSVGInstance()) return null;
    const el = this.doc.getSVGInstance()!.findOne(`#${groupId}`) as SvgJsElement | undefined;
    if (!el?.node) return null;
    const node = el.node as Element;
    if (node.tagName?.toLowerCase() !== 'g') return null;
    const parent = node.parentNode;
    if (!parent) return null;

    const childIds: string[] = [];
    const children = Array.from(node.children);
    for (const child of children) {
      if (child.id) childIds.push(child.id);
      parent.insertBefore(child, node);
    }
    parent.removeChild(node);
    return childIds;
  }
}
