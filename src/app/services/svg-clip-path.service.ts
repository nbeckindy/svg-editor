import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import {
  CONTENT_SHAPE_SELECTOR,
  EDITOR_CLIP_SOURCE_ID_ATTR,
  EDITOR_CONTENT_GROUP_ID,
  EDITOR_LAYER_LOCKED_ATTR,
  SVG_NS
} from './svg-editor-stage.constants';
import type {
  MakeClipPathResult,
  MakeClipPathUndoSnapshot,
  ReleaseClipPathResult,
  ReleaseClipPathUndoSnapshot,
  SvgClipPathPort
} from './svg-clip-path.port';

const CONTENT_SHAPE_TAGS = new Set(CONTENT_SHAPE_SELECTOR.split(', '));

@Injectable({ providedIn: 'root' })
export class SvgClipPathService implements SvgClipPathPort {
  private readonly doc = inject(SvgEditorDocumentService);

  makeClipPathFromSelection(contentIds: string[], clipShapeId: string): MakeClipPathResult | null {
    if (!this.canMakeClipPath([...contentIds, clipShapeId])) return null;
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    const defs = this.doc.getDocumentDefsNode();
    if (!svg || !contentRoot || !defs) return null;

    const sorted = this.sortElementIdsByDocumentOrder([...new Set([...contentIds, clipShapeId])]);
    const topmostId = sorted[sorted.length - 1];
    if (topmostId !== clipShapeId) return null;

    const clipNode = svg.findOne(`#${clipShapeId}`)?.node as Element | undefined;
    if (!clipNode?.parentElement) return null;

    const clipParent = clipNode.parentElement;
    const clipFormerIndex = Array.from(clipParent.children).indexOf(clipNode);
    if (clipFormerIndex < 0) return null;

    const contentPlacement = contentIds.map((id) => {
      const node = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (!node?.parentElement) return null;
      return {
        elementId: id,
        parentId: node.parentElement.id || null,
        formerIndex: Array.from(node.parentElement.children).indexOf(node)
      };
    });
    if (contentPlacement.some((p) => p == null)) return null;

    const clipShapeMarkup = clipNode.outerHTML;
    const undo: MakeClipPathUndoSnapshot = {
      clipShapeMarkup,
      clipShapeParentId: clipParent.id || null,
      clipShapeFormerIndex: clipFormerIndex,
      contentPlacement: contentPlacement as MakeClipPathUndoSnapshot['contentPlacement']
    };

    const clipPathDefId = this.allocateUniqueDefId('clip');
    const clipPathEl = document.createElementNS(SVG_NS, 'clipPath');
    clipPathEl.setAttribute('id', clipPathDefId);
    const clipGeometryId = this.allocateUniqueDefId('clip-geom');
    const geomClone = this.cloneNodeForClipPath(clipNode);
    geomClone.setAttribute('id', clipGeometryId);
    geomClone.setAttribute(EDITOR_CLIP_SOURCE_ID_ATTR, clipShapeId);
    clipPathEl.appendChild(geomClone);
    defs.appendChild(clipPathEl);

    const carrierGroupId = this.allocateUniqueDefId('clip-carrier');
    const carrierEl = document.createElementNS(SVG_NS, 'g');
    carrierEl.setAttribute('id', carrierGroupId);
    carrierEl.setAttribute('clip-path', `url(#${clipPathDefId})`);
    const clipShapeDisplayName = clipNode.getAttribute('data-name') || clipShapeId;
    carrierEl.setAttribute('data-name', clipShapeDisplayName);
    clipParent.insertBefore(carrierEl, clipNode);
    clipParent.removeChild(clipNode);

    const contentSorted = this.sortElementIdsByDocumentOrder(contentIds);
    for (const id of contentSorted) {
      const node = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (node) carrierEl.appendChild(node);
    }

    this.doc.bumpDocumentRevision();
    return {
      carrierGroupId,
      clipPathDefId,
      clipGeometryId,
      contentIds: contentSorted,
      undo
    };
  }

  undoMakeClipPath(
    snapshot: MakeClipPathUndoSnapshot,
    carrierGroupId: string,
    clipPathDefId: string
  ): void {
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    const defs = this.doc.getDocumentDefsNode();
    if (!svg || !contentRoot || !defs) return;

    const carrier = svg.findOne(`#${carrierGroupId}`)?.node as Element | undefined;
    if (!carrier?.parentElement) return;

    const contentSorted = this.sortElementIdsByDocumentOrder(
      snapshot.contentPlacement.map((p) => p.elementId)
    );
    for (const id of contentSorted) {
      const placement = snapshot.contentPlacement.find((p) => p.elementId === id);
      const node = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (!node || !placement) continue;
      this.restoreElementPlacement(node, placement.parentId, placement.formerIndex, contentRoot);
    }

    const clipShape = this.parseMarkupToElement(snapshot.clipShapeMarkup);
    if (clipShape) {
      this.restoreElementPlacement(
        clipShape,
        snapshot.clipShapeParentId,
        snapshot.clipShapeFormerIndex,
        contentRoot
      );
    }

    carrier.parentElement.removeChild(carrier);
    this.removeClipPathDefById(clipPathDefId);
    this.doc.bumpDocumentRevision();
  }

  releaseClipPathForSelection(shapeIds: string[]): ReleaseClipPathResult | null {
    if (!this.canReleaseClipPath(shapeIds)) return null;
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    if (!svg || !contentRoot) return null;

    const carrier = this.resolveClipCarrierForShapeId(shapeIds[0]);
    if (!carrier?.parentElement) return null;

    const carrierGroupId = carrier.id;
    if (!carrierGroupId) return null;

    const clipPathValue = carrier.getAttribute('clip-path');
    const clipPathDefId = clipPathValue ? this.parseUrlDefId(clipPathValue) : null;
    if (!clipPathDefId) return null;

    const clipPathEl = defsQueryClipPath(this.doc.getDocumentDefsNode(), clipPathDefId);
    const clipGeom = clipPathEl?.firstElementChild ?? null;
    const clipPathChildMarkup = clipGeom?.outerHTML ?? '';

    const carrierParent = carrier.parentElement;
    const carrierFormerIndex = Array.from(carrierParent.children).indexOf(carrier);
    const childIds: string[] = [];
    for (const child of Array.from(carrier.children)) {
      if (child.id) childIds.push(child.id);
    }

    const insertBefore = carrierParent.children[carrierFormerIndex + 1] ?? null;
    for (const child of Array.from(carrier.children)) {
      carrierParent.insertBefore(child, insertBefore);
    }
    carrierParent.removeChild(carrier);

    let restoredClipShapeId: string | null = null;
    if (clipGeom) {
      const preferredId = clipGeom.getAttribute(EDITOR_CLIP_SOURCE_ID_ATTR);
      restoredClipShapeId = this.restoreClipGeometryToCanvas(
        clipGeom,
        carrierParent,
        carrierFormerIndex + childIds.length,
        preferredId
      );
    }

    const undo: ReleaseClipPathUndoSnapshot = {
      carrierGroupId,
      carrierParentId: carrierParent.id || null,
      carrierFormerIndex,
      clipPathDefId,
      clipPathChildMarkup,
      childIds: [...childIds],
      restoredClipShapeId
    };

    this.purgeClipPathDefIfUnreferenced(clipPathDefId);

    this.doc.bumpDocumentRevision();
    return { freedChildIds: childIds, restoredClipShapeId, undo };
  }

  undoReleaseClipPath(snapshot: ReleaseClipPathUndoSnapshot): string | null {
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    const defs = this.doc.getDocumentDefsNode();
    if (!svg || !contentRoot || !defs) return null;

    if (snapshot.restoredClipShapeId) {
      const restored = svg.findOne(`#${snapshot.restoredClipShapeId}`)?.node as Element | undefined;
      restored?.parentElement?.removeChild(restored);
    }

    const clipPathEl = document.createElementNS(SVG_NS, 'clipPath');
    clipPathEl.setAttribute('id', snapshot.clipPathDefId);
    if (snapshot.clipPathChildMarkup) {
      const child = this.parseMarkupToElement(snapshot.clipPathChildMarkup);
      if (child) clipPathEl.appendChild(child);
    }
    defs.appendChild(clipPathEl);

    const carrierEl = document.createElementNS(SVG_NS, 'g');
    carrierEl.setAttribute('id', snapshot.carrierGroupId);
    carrierEl.setAttribute('clip-path', `url(#${snapshot.clipPathDefId})`);

    const parent = snapshot.carrierParentId
      ? (svg.findOne(`#${snapshot.carrierParentId}`)?.node as Element | undefined)
      : contentRoot;
    if (!parent) return null;

    const children = parent.children;
    if (snapshot.carrierFormerIndex >= children.length) {
      parent.appendChild(carrierEl);
    } else {
      parent.insertBefore(carrierEl, children[snapshot.carrierFormerIndex]);
    }

    const contentSorted = this.sortElementIdsByDocumentOrder(snapshot.childIds);
    for (const id of contentSorted) {
      const node = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (node) carrierEl.appendChild(node);
    }

    this.doc.bumpDocumentRevision();
    return snapshot.carrierGroupId;
  }

  findClipCarrierForShape(shapeId: string): string | null {
    const carrier = this.resolveClipCarrierForShapeId(shapeId);
    return carrier?.id || null;
  }

  resolveClipGeometryIdForContentShape(shape: SvgJsElement): string | null {
    const node = shape.node as Element | null;
    const contentRoot = this.getContentRootElement();
    if (!node || !contentRoot || typeof node.closest !== 'function') return null;
    const clipHost = node.closest('[clip-path]');
    if (!clipHost || !contentRoot.contains(clipHost) || !clipHost.hasAttribute('clip-path')) {
      return null;
    }
    const clipPathDefId = this.parseUrlDefId(clipHost.getAttribute('clip-path') ?? '');
    if (!clipPathDefId) return null;
    const geom = this.findClipPathGeometryElement(clipPathDefId);
    if (!geom) return null;
    return this.ensureClipGeometryEditorId(geom);
  }

  resolveClipCarrierForShapeId(shapeId: string): Element | null {
    const fromContent = this.resolveClipCarrierElement(shapeId);
    if (fromContent) return fromContent;
    return this.resolveClipCarrierFromClipGeometryId(shapeId);
  }

  canMakeClipPath(shapeIds: string[]): boolean {
    const unique = [...new Set(shapeIds)];
    if (unique.length < 2) return false;
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    if (!svg || !contentRoot) return false;

    for (const id of unique) {
      const node = svg.findOne(`#${id}`)?.node as Element | undefined;
      if (!node || !contentRoot.contains(node)) return false;
      if (this.isInsideClipPathHost(node)) return false;
      if (!this.isValidClipShapeSource(node)) return false;
    }
    return true;
  }

  canReleaseClipPath(shapeIds: string[]): boolean {
    if (shapeIds.length === 0) return false;
    const svg = this.doc.getSVGInstance();
    if (!svg) return false;

    let carrier: Element | null = null;
    for (const id of shapeIds) {
      const host = this.resolveClipCarrierForShapeId(id);
      if (!host?.hasAttribute('clip-path')) return false;
      if (carrier == null) {
        carrier = host;
      } else if (carrier !== host) {
        return false;
      }
    }
    return carrier != null && !!carrier.id;
  }

  getClipPathTransformMemberIds(seedShapeId: string): string[] | null {
    const carrier = this.resolveClipCarrierForShapeId(seedShapeId);
    if (!carrier) return null;

    const clipPathValue = carrier.getAttribute('clip-path');
    const clipPathDefId = clipPathValue ? this.parseUrlDefId(clipPathValue) : null;
    const ids: string[] = [];
    if (clipPathDefId) {
      const geom = this.findClipPathGeometryElement(clipPathDefId);
      if (geom?.id) {
        ids.push(geom.id);
      }
    }
    for (const child of Array.from(carrier.children)) {
      if (child.id) ids.push(child.id);
    }
    return ids.length > 0 ? ids : null;
  }

  private getContentRootElement(): Element | null {
    return (
      (this.doc.getSVGInstance()?.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`)?.node as Element | undefined) ??
      null
    );
  }

  private resolveClipCarrierFromClipGeometryId(geomId: string): Element | null {
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    if (!svg || !contentRoot) return null;
    const node = svg.findOne(`#${geomId}`)?.node as Element | undefined;
    if (!node?.parentElement) return null;
    if (node.parentElement.tagName?.toLowerCase() !== 'clippath') return null;
    const clipPathId = node.parentElement.id;
    if (!clipPathId) return null;
    const esc = clipPathId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`url\\(\\s*#${esc}\\s*\\)`, 'i');
    const walk = (el: Element): Element | null => {
      const cp = el.getAttribute('clip-path');
      if (cp && pattern.test(cp) && el.tagName?.toLowerCase() === 'g') return el;
      for (let i = 0; i < el.children.length; i++) {
        const found = walk(el.children[i] as Element);
        if (found) return found;
      }
      return null;
    };
    return walk(contentRoot);
  }

  private findClipPathGeometryElement(clipPathDefId: string): Element | null {
    const clipPathEl = defsQueryClipPath(this.doc.getDocumentDefsNode(), clipPathDefId);
    return clipPathEl?.firstElementChild ?? null;
  }

  private ensureClipGeometryEditorId(geom: Element): string {
    const existing = geom.id;
    const svg = this.doc.getSVGInstance();
    if (existing.startsWith('clip-geom-') && svg?.findOne(`#${existing}`)) {
      return existing;
    }
    const id = this.allocateUniqueDefId('clip-geom');
    geom.setAttribute('id', id);
    this.doc.bumpDocumentRevision();
    return id;
  }

  private resolveClipCarrierElement(shapeId: string): Element | null {
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    if (!svg || !contentRoot) return null;
    const node = svg.findOne(`#${shapeId}`)?.node as Element | undefined;
    if (!node || typeof node.closest !== 'function') return null;
    const host = node.closest('[clip-path]');
    if (!host || !contentRoot.contains(host)) return null;
    if (!host.hasAttribute('clip-path')) return null;
    return host;
  }

  private isInsideClipPathHost(node: Element): boolean {
    const contentRoot = this.getContentRootElement();
    if (!contentRoot || typeof node.closest !== 'function') return false;
    const host = node.closest('[clip-path]');
    return host != null && contentRoot.contains(host);
  }

  private isValidClipShapeSource(node: Element): boolean {
    const tag = node.tagName?.toLowerCase() ?? '';
    if (tag === 'g') return false;
    return CONTENT_SHAPE_TAGS.has(tag);
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

  private allocateUniqueDefId(prefix: string): string {
    const svg = this.doc.getSVGInstance();
    if (!svg) return `${prefix}-fallback`;
    let id: string;
    do {
      id = `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
    } while (svg.findOne(`#${id}`));
    return id;
  }

  private cloneNodeForClipPath(source: Element): Element {
    const clone = source.cloneNode(true) as Element;
    clone.removeAttribute('id');
    clone.removeAttribute('data-name');
    clone.removeAttribute(EDITOR_LAYER_LOCKED_ATTR);
    for (const attr of Array.from(clone.attributes)) {
      if (attr.name.startsWith('data-editor-')) {
        clone.removeAttribute(attr.name);
      }
    }
    return clone;
  }

  private parseMarkupToElement(markup: string): Element | null {
    const wrapper = document.createElementNS(SVG_NS, 'g');
    wrapper.innerHTML = markup;
    return wrapper.firstElementChild;
  }

  private restoreClipGeometryToCanvas(
    geom: Element,
    parent: Element,
    insertIndex: number,
    preferredId: string | null
  ): string {
    geom.parentElement?.removeChild(geom);
    const id = this.allocateRestoredClipShapeId(preferredId);
    geom.setAttribute('id', id);
    geom.removeAttribute(EDITOR_CLIP_SOURCE_ID_ATTR);

    const children = parent.children;
    if (insertIndex >= children.length) {
      parent.appendChild(geom);
    } else {
      parent.insertBefore(geom, children[insertIndex]);
    }
    return id;
  }

  private allocateRestoredClipShapeId(preferredId: string | null): string {
    const svg = this.doc.getSVGInstance();
    if (!svg) return 'shape-fallback';
    if (preferredId && !svg.findOne(`#${preferredId}`)) {
      return preferredId;
    }
    let id: string;
    do {
      id = `shape-${Math.random().toString(36).slice(2, 11)}`;
    } while (svg.findOne(`#${id}`));
    return id;
  }

  private restoreElementPlacement(
    node: Element,
    parentId: string | null,
    formerIndex: number,
    contentRoot: Element
  ): void {
    const svg = this.doc.getSVGInstance();
    if (!svg) return;
    let parent: Element | null = null;
    if (parentId) {
      parent = (svg.findOne(`#${parentId}`)?.node as Element | undefined) ?? null;
    } else {
      parent = contentRoot;
    }
    if (!parent) return;
    const children = parent.children;
    if (formerIndex >= children.length) {
      parent.appendChild(node);
    } else {
      parent.insertBefore(node, children[formerIndex]);
    }
  }

  private parseUrlDefId(value: string): string | null {
    const match = /url\(\s*#([^)\s]+)\s*\)/i.exec(value);
    return match?.[1] ?? null;
  }

  private countClipPathReferencesToDefId(defId: string): number {
    const svg = this.doc.getSVGInstance();
    const contentRoot = this.getContentRootElement();
    if (!svg || !contentRoot) return 0;
    const esc = defId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`url\\(\\s*#${esc}\\s*\\)`, 'i');
    let count = 0;
    const walk = (el: Element): void => {
      const clipPath = el.getAttribute('clip-path');
      if (clipPath && pattern.test(clipPath)) count++;
      for (let i = 0; i < el.children.length; i++) {
        walk(el.children[i] as Element);
      }
    };
    walk(contentRoot);
    return count;
  }

  private removeClipPathDefById(clipPathDefId: string): void {
    const contentRoot = this.getContentRootElement();
    const defs = this.doc.getDocumentDefsNode();
    if (!contentRoot || !defs) return;
    const el = defs.querySelector(`#${cssEscape(clipPathDefId)}`);
    if (el) defs.removeChild(el);
  }

  private purgeClipPathDefIfUnreferenced(clipPathDefId: string): void {
    if (this.countClipPathReferencesToDefId(clipPathDefId) === 0) {
      this.removeClipPathDefById(clipPathDefId);
    }
  }
}

function defsFromContentRoot(contentRoot: Element): SVGDefsElement | null {
  for (const child of Array.from(contentRoot.children)) {
    if (child.tagName?.toLowerCase() === 'defs') {
      return child as SVGDefsElement;
    }
  }
  return null;
}

function defsQueryClipPath(defs: SVGDefsElement | null, id: string): SVGClipPathElement | null {
  if (!defs) return null;
  const el = defs.querySelector(`#${cssEscape(id)}`);
  return el?.tagName?.toLowerCase() === 'clippath' ? (el as SVGClipPathElement) : null;
}

function cssEscape(id: string): string {
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === 'function') return g.CSS.escape(id);
  return id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
