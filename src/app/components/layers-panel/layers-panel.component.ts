import { CdkDragDrop, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, Injector, signal, viewChild, afterNextRender } from '@angular/core';
import { take } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerTreeNode } from '../../services/svg-layer-structure.port';
import type { LayersPanelSvgPort } from '../../history/layers-panel-svg.port';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';

/** Tiny PNG for layer-row previews — avoids re-embedding huge `data:` raster hrefs in preview SVG. */
const LAYER_ROW_RASTER_PREVIEW_HREF =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export type DropZone = 'before' | 'after' | 'intoGroup' | 'none';

export type LayerDropAction =
  | { kind: 'reorderBeforeSibling'; referenceNextSiblingId: string | null }
  | { kind: 'addToGroup'; targetGroupId: string }
  | {
      kind: 'reparentToParent';
      targetParentId: string | null;
      referenceNextSiblingId: string | null;
    };

export interface LayerDropIntent {
  valid: boolean;
  zone: DropZone;
  targetId?: string;
  action?: LayerDropAction;
}

interface LayerTreeViewModel {
  id: string;
  type: string;
  name: string;
  depth: number;
  isGroup: boolean;
  isExpanded: boolean;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  previewUrl: string;
}

interface PreviewPaintData {
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

@Component({
  selector: 'app-layers-panel',
  standalone: true,
  imports: [CommonModule, DragDropModule, MatIconModule, MatMenuModule],
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.css'
})
export class LayersPanelComponent {
  private readonly svg: LayersPanelSvgPort = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly injector = inject(Injector);

  private lastPointerPosition: { x: number; y: number } | null = null;

  readonly contextMenuTrigger = viewChild.required('contextMenuTrigger', {
    read: MatMenuTrigger
  });

  readonly contextMenuTriggerEl = viewChild.required('contextMenuTrigger', {
    read: ElementRef<HTMLElement>
  });

  readonly layerContextMenu = viewChild.required('layerContextMenu', { read: MatMenu });

  readonly collapsedGroups = signal(new Set<string>());
  readonly contextMenuLayerId = signal<string | null>(null);
  readonly dropPreview = signal<{
    targetId: string;
    zone: DropZone;
    valid: boolean;
  } | null>(null);
  readonly pendingDropIntent = signal<LayerDropIntent | null>(null);

  readonly selectionCount = computed(() => this.shapeSelection.selectedShapes().length);

  readonly canUngroup = computed(() => {
    const shapes = this.shapeSelection.selectedShapes();
    return shapes.length > 0 && shapes.every((s) => s.type === 'g');
  });

  readonly canAddToGroup = computed(() => {
    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length < 2) return false;
    const userGroups = shapes.filter(
      (s) =>
        s.type === 'g' &&
        this.svg.isUserGroupId(s.id) &&
        !this.svg.isGroupClipMaskCarrier(s.id)
    );
    if (userGroups.length !== 1) return false;
    const targetId = userGroups[0].id;
    const toMove = shapes.filter((s) => s.id !== targetId);
    if (toMove.length === 0) return false;
    if (shapes.some((s) => this.svg.isElementOrAncestorLocked(s.id))) return false;
    return !toMove.some((s) => this.isStrictAncestor(s.id, targetId));
  });

  readonly canRemoveFromGroup = computed(() => {
    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length === 0) return false;
    if (shapes.some((s) => this.svg.isElementOrAncestorLocked(s.id))) return false;
    return shapes.some((s) => this.getUserGroupParentId(s.id) != null);
  });

  readonly flattenedLayers = computed<LayerTreeViewModel[]>(() => {
    this.svg.documentRevision();
    const tree = this.svg.getLayerTree();
    const selectedIds = new Set(this.shapeSelection.selectedShapes().map((s) => s.id));
    const collapsed = this.collapsedGroups();
    return this.flattenTree(tree, 0, collapsed, selectedIds, false);
  });

  toggleGroupExpanded(groupId: string): void {
    this.collapsedGroups.update((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  onVisibilityToggle(layerId: string): void {
    this.chromeApply.toggleLayerVisibility(layerId);
  }

  onLockToggle(layerId: string): void {
    this.chromeApply.toggleLayerLock(layerId);
  }

  isLayerDragDisabled(layer: LayerTreeViewModel): boolean {
    return layer.locked || this.svg.isElementOrAncestorLocked(layer.id);
  }

  isLayerReorderDisabled(layerId: string | null): boolean {
    if (!layerId) return true;
    return this.svg.isElementOrAncestorLocked(layerId);
  }

  onLayerDragMoved(event: CdkDragMove<LayerTreeViewModel>): void {
    this.lastPointerPosition = { ...event.pointerPosition };
    this.updateDropPreview(event.source.data.id, event.pointerPosition);
  }

  onLayerDragEnded(): void {
    this.dropPreview.set(null);
  }

  onLayerListDropped(event: CdkDragDrop<LayerTreeViewModel[]>): void {
    const draggedId = event.item.data.id;
    let intent = this.pendingDropIntent();
    if (!intent?.valid) {
      const pointer = this.lastPointerPosition ?? event.dropPoint;
      intent = this.resolveDropIntentFromPointer(draggedId, pointer);
    }
    this.dropPreview.set(null);
    this.lastPointerPosition = null;
    this.pendingDropIntent.set(null);
    if (intent.valid && intent.action) {
      this.executeDropAction(draggedId, intent.action);
    }
  }

  /** Resolves drop intent from pointer position over a layer row. */
  resolveDropIntentFromPointer(
    draggedId: string,
    pointer: { x: number; y: number }
  ): LayerDropIntent {
    const row = this.findLayerRowFromPointer(pointer, draggedId);
    if (!row) return { valid: false, zone: 'none' };
    const targetId = row.getAttribute('data-testid')?.replace('layer-row-', '');
    if (!targetId) return { valid: false, zone: 'none' };
    const rect = row.getBoundingClientRect();
    const relY = rect.height > 0 ? (pointer.y - rect.top) / rect.height : 0.5;
    const intent = this.resolveLayerDropIntent(draggedId, targetId, relY);
    if (!intent.valid) return intent;
    return { ...intent, targetId };
  }

  resolveLayerDropIntent(draggedId: string, targetId: string, relY: number): LayerDropIntent {
    if (!draggedId || !targetId || draggedId === targetId) {
      return { valid: false, zone: 'none' };
    }
    if (
      this.svg.isElementOrAncestorLocked(draggedId) ||
      this.svg.isElementOrAncestorLocked(targetId)
    ) {
      return { valid: false, zone: 'none' };
    }

    const topEdge = relY < 0.25;
    const bottomEdge = relY > 0.75;
    const middleZone = !topEdge && !bottomEdge;
    const frontHalf = relY < 0.5;

    const targetLayer = this.flattenedLayers().find((l) => l.id === targetId);
    const svg = this.svg.getSVGInstance();
    if (!svg) return { valid: false, zone: 'none' };
    const draggedNode = svg.findOne(`#${draggedId}`)?.node as Element | undefined;
    const targetNode = svg.findOne(`#${targetId}`)?.node as Element | undefined;
    if (!draggedNode || !targetNode) return { valid: false, zone: 'none' };

    if (targetLayer?.isGroup && middleZone) {
      if (this.isStrictAncestor(draggedId, targetId)) {
        return { valid: false, zone: 'none' };
      }
      if (this.svg.isGroupClipMaskCarrier(targetId)) {
        return { valid: false, zone: 'none' };
      }
      return {
        valid: true,
        zone: 'intoGroup',
        action: { kind: 'addToGroup', targetGroupId: targetId }
      };
    }

    const zone: DropZone = topEdge ? 'before' : bottomEdge ? 'after' : frontHalf ? 'before' : 'after';

    const sameParent = draggedNode.parentElement === targetNode.parentElement;
    if (sameParent) {
      const res = this.resolveSameParentDropReferenceSibling(draggedId, targetId, frontHalf);
      if (!res.ok) return { valid: false, zone: 'none' };
      return {
        valid: true,
        zone,
        action: { kind: 'reorderBeforeSibling', referenceNextSiblingId: res.ref }
      };
    }

    const cross = this.resolveCrossParentDrop(
      draggedId,
      targetId,
      targetLayer?.isGroup ?? false,
      topEdge,
      bottomEdge,
      frontHalf
    );
    if (!cross.ok) return { valid: false, zone: 'none' };
    return {
      valid: true,
      zone,
      action: cross.action
    };
  }

  onLayerContextMenu(layerId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuLayerId.set(layerId);
    const trigger = this.contextMenuTrigger();
    const btn = this.contextMenuTriggerEl().nativeElement;
    btn.style.position = 'fixed';
    btn.style.left = `${event.clientX}px`;
    btn.style.top = `${event.clientY}px`;
    trigger.openMenu();
    trigger.menuOpened.pipe(take(1)).subscribe(() => {
      // MatMenu.focusFirstItem runs in afterNextRender; reset after it so nothing stays highlighted.
      afterNextRender(
        () => {
          this.layerContextMenu().resetActiveItem();
          const panel = document.querySelector(
            '.layer-context-menu-panel.mat-mdc-menu-panel'
          ) as HTMLElement | null;
          const active = document.activeElement;
          if (active instanceof HTMLElement && active.classList.contains('mat-mdc-menu-item')) {
            active.blur();
          }
          panel?.focus({ preventScroll: true });
        },
        { injector: this.injector }
      );
    });
  }

  onContextMenuMoveToFront(): void {
    const id = this.contextMenuLayerId();
    if (id && !this.isLayerReorderDisabled(id)) this.onMoveToFront(id);
  }

  onContextMenuMoveForward(): void {
    const id = this.contextMenuLayerId();
    if (id && !this.isLayerReorderDisabled(id)) this.onMoveForward(id);
  }

  onContextMenuMoveBackward(): void {
    const id = this.contextMenuLayerId();
    if (id && !this.isLayerReorderDisabled(id)) this.onMoveBackward(id);
  }

  onContextMenuMoveToBack(): void {
    const id = this.contextMenuLayerId();
    if (id && !this.isLayerReorderDisabled(id)) this.onMoveToBack(id);
  }

  onMoveForward(layerId: string): void {
    this.chromeApply.moveLayerForward(layerId);
  }

  onMoveBackward(layerId: string): void {
    this.chromeApply.moveLayerBackward(layerId);
  }

  onMoveToFront(layerId: string): void {
    this.chromeApply.moveLayerToFront(layerId);
  }

  onMoveToBack(layerId: string): void {
    this.chromeApply.moveLayerToBack(layerId);
  }

  onGroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    if (selected.length < 2) return;
    this.chromeApply.groupSelectedFromLayersPanel(selected.map((s) => s.id));
  }

  onUngroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    const groupIds = selected.filter((s) => s.type === 'g').map((s) => s.id);
    this.chromeApply.ungroupSelectedFromLayersPanel(groupIds);
  }

  onAddToGroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    const userGroups = selected.filter(
      (s) =>
        s.type === 'g' &&
        this.svg.isUserGroupId(s.id) &&
        !this.svg.isGroupClipMaskCarrier(s.id)
    );
    if (userGroups.length !== 1) return;
    const targetId = userGroups[0].id;
    const elementIds = selected.filter((s) => s.id !== targetId).map((s) => s.id);
    this.chromeApply.addSelectionToGroupFromLayersPanel(elementIds, targetId);
  }

  onRemoveFromGroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    this.chromeApply.removeSelectionFromGroupFromLayersPanel(selected.map((s) => s.id));
  }

  onLayerClick(layerId: string, event?: MouseEvent): void {
    const svgInstance = this.svg.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${layerId}`) as SvgJsElement | null;
    if (!shape) return;

    const additive = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    const tree = this.svg.getLayerTree();
    const node = this.findNodeInTree(tree, layerId);
    const isGroup = node?.type === 'g' && Array.isArray(node.children);

    if (isGroup) {
      const leafIds = this.collectLeafIds(node!.children!);
      const leafShapes = leafIds
        .map((id) => svgInstance.findOne(`#${id}`) as SvgJsElement | null)
        .filter((el): el is SvgJsElement => el != null)
        .map((el) => this.svg.getShapeProperties(el));

      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(leafShapes);
      } else {
        this.shapeSelection.selectShapes(leafShapes);
      }
    } else {
      const expanded = this.svg.getShapePropertiesInSameClipGroup(shape);
      if (expanded.length === 0) return;
      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(expanded);
      } else {
        this.shapeSelection.selectShapes(expanded);
      }
    }
  }

  private updateDropPreview(
    draggedId: string,
    pointer: { x: number; y: number }
  ): void {
    const intent = this.resolveDropIntentFromPointer(draggedId, pointer);
    if (!intent.valid || !intent.targetId) {
      this.dropPreview.set(null);
      return;
    }
    this.pendingDropIntent.set(intent);
    this.dropPreview.set({ targetId: intent.targetId, zone: intent.zone, valid: true });
  }

  /** Hit-test layer rows by pointer position (avoids CDK drag preview blocking elementsFromPoint). */
  private findLayerRowFromPointer(
    pointer: { x: number; y: number },
    draggedId?: string
  ): HTMLElement | null {
    if (typeof document === 'undefined') return null;

    const list = document.querySelector('[data-testid="layers-list"]');
    if (!list) return null;

    for (const row of list.querySelectorAll('[data-testid^="layer-row-"]')) {
      const el = row as HTMLElement;
      if (el.classList.contains('cdk-drag-preview')) continue;
      if (el.classList.contains('cdk-drag-placeholder')) continue;
      const targetId = el.getAttribute('data-testid')?.replace('layer-row-', '');
      if (draggedId && targetId === draggedId) continue;
      const rect = el.getBoundingClientRect();
      if (
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right
      ) {
        return el;
      }
    }
    return null;
  }

  private executeDropAction(draggedId: string, action: LayerDropAction): void {
    switch (action.kind) {
      case 'reorderBeforeSibling':
        this.chromeApply.moveLayerBeforeSibling(draggedId, action.referenceNextSiblingId);
        break;
      case 'addToGroup':
        this.chromeApply.reparentLayerDrag([draggedId], {
          kind: 'addToGroup',
          targetGroupId: action.targetGroupId
        });
        break;
      case 'reparentToParent':
        this.chromeApply.reparentLayerDrag([draggedId], action);
        break;
    }
  }

  private resolveSameParentDropReferenceSibling(
    draggedId: string,
    targetId: string,
    frontHalf: boolean
  ): { ok: true; ref: string | null } | { ok: false } {
    const svg = this.svg.getSVGInstance();
    if (!svg) return { ok: false };
    const d = svg.findOne(`#${draggedId}`) as SvgJsElement | undefined;
    const t = svg.findOne(`#${targetId}`) as SvgJsElement | undefined;
    if (!d?.node || !t?.node) return { ok: false };
    const dn = d.node as Element;
    const tn = t.node as Element;
    if (dn.parentElement !== tn.parentElement) return { ok: false };

    if (frontHalf) {
      let s: Element | null = tn.nextElementSibling;
      while (s && (!s.id || s.id === draggedId)) {
        s = s.nextElementSibling;
      }
      const ref: string | null = s?.id ?? null;
      return { ok: true, ref };
    }
    return { ok: true, ref: targetId };
  }

  private resolveCrossParentDrop(
    draggedId: string,
    targetId: string,
    targetIsGroup: boolean,
    topEdge: boolean,
    bottomEdge: boolean,
    frontHalf: boolean
  ):
    | {
        ok: true;
        action: {
          kind: 'reparentToParent';
          targetParentId: string | null;
          referenceNextSiblingId: string | null;
        };
      }
    | { ok: false } {
    const svg = this.svg.getSVGInstance();
    if (!svg) return { ok: false };
    const draggedNode = svg.findOne(`#${draggedId}`)?.node as Element | undefined;
    const targetNode = svg.findOne(`#${targetId}`)?.node as Element | undefined;
    if (!draggedNode || !targetNode) return { ok: false };

    if (draggedId === targetId || this.isStrictAncestor(draggedId, targetId)) return { ok: false };
    if (targetIsGroup && this.svg.isGroupClipMaskCarrier(targetId)) return { ok: false };

    const targetParentId = this.getElementParentId(targetNode);

    if (targetIsGroup && (topEdge || bottomEdge)) {
      if (topEdge) {
        return {
          ok: true,
          action: {
            kind: 'reparentToParent',
            targetParentId,
            referenceNextSiblingId: targetId
          }
        };
      }
      let next: Element | null = targetNode.nextElementSibling;
      while (next && (!next.id || next.id === draggedId)) {
        next = next.nextElementSibling;
      }
      return {
        ok: true,
        action: {
          kind: 'reparentToParent',
          targetParentId,
          referenceNextSiblingId: next?.id ?? null
        }
      };
    }

    if (frontHalf) {
      return {
        ok: true,
        action: {
          kind: 'reparentToParent',
          targetParentId,
          referenceNextSiblingId: targetId
        }
      };
    }

    let next: Element | null = targetNode.nextElementSibling;
    while (next && (!next.id || next.id === draggedId)) {
      next = next.nextElementSibling;
    }
    return {
      ok: true,
      action: {
        kind: 'reparentToParent',
        targetParentId,
        referenceNextSiblingId: next?.id ?? null
      }
    };
  }

  private flattenTree(
    nodes: LayerTreeNode[],
    depth: number,
    collapsed: Set<string>,
    selectedIds: Set<string>,
    ancestorSelected: boolean
  ): LayerTreeViewModel[] {
    const result: LayerTreeViewModel[] = [];
    const reversed = [...nodes].reverse();

    for (const node of reversed) {
      const isGroup = node.type === 'g' && Array.isArray(node.children);
      const isExpanded = isGroup && !collapsed.has(node.id);
      const directlySelected = selectedIds.has(node.id);
      const selected = directlySelected || ancestorSelected;

      result.push({
        id: node.id,
        type: node.type,
        name: node.name,
        depth,
        isGroup,
        isExpanded,
        visible: node.visible,
        locked: node.locked,
        selected,
        previewUrl: this.createPreviewDataUrl(node)
      });

      if (isGroup && isExpanded && node.children) {
        result.push(
          ...this.flattenTree(node.children, depth + 1, collapsed, selectedIds, selected)
        );
      }
    }

    return result;
  }

  private findNodeInTree(nodes: LayerTreeNode[], id: string): LayerTreeNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNodeInTree(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private collectLeafIds(nodes: LayerTreeNode[]): string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (node.type === 'g' && node.children) {
        ids.push(...this.collectLeafIds(node.children));
      } else {
        ids.push(node.id);
      }
    }
    return ids;
  }

  private getContentRoot(): Element | null {
    return (
      (this.svg.getSVGInstance()?.findOne('[data-editor-content-group]')?.node as Element | null) ??
      null
    );
  }

  private getElementParentId(node: Element): string | null {
    const contentRoot = this.getContentRoot();
    const parent = node.parentElement;
    if (!parent || parent === contentRoot) return null;
    return parent.id || null;
  }

  private getUserGroupParentId(elementId: string): string | null {
    const svg = this.svg.getSVGInstance();
    if (!svg) return null;
    const node = svg.findOne(`#${elementId}`)?.node as Element | undefined;
    if (!node) return null;
    const contentRoot = this.getContentRoot();
    let current: Element | null = node.parentElement;
    while (current && current !== contentRoot) {
      if (
        current.tagName?.toLowerCase() === 'g' &&
        current.id &&
        this.svg.isUserGroupId(current.id) &&
        !this.svg.isGroupClipMaskCarrier(current.id)
      ) {
        return current.id;
      }
      current = current.parentElement;
    }
    return null;
  }

  private isStrictAncestor(ancestorId: string, descendantId: string): boolean {
    const svg = this.svg.getSVGInstance();
    if (!svg) return false;
    const anc = svg.findOne(`#${ancestorId}`)?.node as Element | undefined;
    const desc = svg.findOne(`#${descendantId}`)?.node as Element | undefined;
    if (!anc || !desc) return false;
    return anc !== desc && anc.contains(desc);
  }

  private createPreviewDataUrl(layer: PreviewPaintData): string {
    const normalizedMarkup = this.applyPreviewStyleOverrides(layer);
    const viewBox = this.computePreviewViewBox(normalizedMarkup);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="32" height="24" preserveAspectRatio="xMidYMid meet">${normalizedMarkup}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  private applyPreviewStyleOverrides(layer: PreviewPaintData): string {
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
      return layer.elementMarkup;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(layer.elementMarkup, 'image/svg+xml');
      const el = doc.documentElement;
      if (!el || el.tagName.toLowerCase() === 'parsererror') return layer.elementMarkup;
      if (el.tagName.toLowerCase() === 'image') {
        el.removeAttribute('href');
        el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        el.setAttribute('href', LAYER_ROW_RASTER_PREVIEW_HREF);
      }
      if (layer.fill) el.setAttribute('fill', layer.fill);
      if (layer.stroke) el.setAttribute('stroke', layer.stroke);
      if (typeof layer.strokeWidth === 'number') el.setAttribute('stroke-width', String(layer.strokeWidth));
      if (typeof layer.opacity === 'number') el.setAttribute('opacity', String(layer.opacity));
      return new XMLSerializer().serializeToString(el);
    } catch {
      return layer.elementMarkup;
    }
  }

  private computePreviewViewBox(markup: string): string {
    const defaultViewBox = '0 0 100 100';
    if (typeof document === 'undefined') return defaultViewBox;
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.left = '-100000px';
    host.style.top = '-100000px';
    host.style.width = '0';
    host.style.height = '0';
    host.style.overflow = 'visible';

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
        'image/svg+xml'
      );
      const svgEl = doc.querySelector('svg');
      const shape = doc.querySelector('*:not(svg)');
      if (!svgEl || !shape) return defaultViewBox;

      host.appendChild(document.importNode(svgEl, true));
      document.body.appendChild(host);
      const liveShape = host.querySelector('*:not(svg)') as SVGGraphicsElement | null;
      if (!liveShape || typeof liveShape.getBBox !== 'function') return defaultViewBox;

      const bbox = liveShape.getBBox();
      let bx = bbox.x;
      let by = bbox.y;
      let bw = bbox.width;
      let bh = bbox.height;
      if ((bw <= 0 || bh <= 0) && liveShape.tagName?.toLowerCase() === 'image') {
        const w = parseFloat(liveShape.getAttribute('width') || '');
        const h = parseFloat(liveShape.getAttribute('height') || '');
        const x = parseFloat(liveShape.getAttribute('x') || '0');
        const y = parseFloat(liveShape.getAttribute('y') || '0');
        if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
          bx = x;
          by = y;
          bw = w;
          bh = h;
        }
      }
      if (bw <= 0 || bh <= 0) return defaultViewBox;

      const padX = Math.max(1, bw * 0.1);
      const padY = Math.max(1, bh * 0.1);
      return `${bx - padX} ${by - padY} ${bw + padX * 2} ${bh + padY * 2}`;
    } catch {
      return defaultViewBox;
    } finally {
      host.remove();
    }
  }
}
