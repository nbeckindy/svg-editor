import { Injectable, inject } from '@angular/core';
import type { ClipboardPayload, ClipboardShapeSnapshot } from '../../models/clipboard-payload';
import { getShapeIdsInDomOrderFromSvg } from '../../utils/svg-shape-ids-dom-order';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { EDITOR_CONTENT_GROUP_ID, SVG_NS } from '../svg-editor-stage.constants';
import type { SvgClipboardPort } from './svg-clipboard.port';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { LiveTreeMarkup } from '../../utils/svg-sanitize';
import { SvgIngestService } from '../svg-ingest.service';

const URL_REF_RE = /url\(\s*(['"]?)#([^)'"\\s]+)\1\s*\)/g;

@Injectable({ providedIn: 'root' })
export class SvgClipboardService implements SvgClipboardPort {
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly ingestService = inject(SvgIngestService);

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
  ): { insertedIds: string[]; insertedMarkup: LiveTreeMarkup[] } {
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
    const insertedMarkup: LiveTreeMarkup[] = [];

    for (const shape of payload.shapes) {
      const sanitizedShape = this.ingestService.ingestFragment(shape.markup);
      const wrapper = document.createElementNS(SVG_NS, 'g');
      wrapper.innerHTML = sanitizedShape;
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

      insertedMarkup.push(inserted.outerHTML as LiveTreeMarkup);
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
