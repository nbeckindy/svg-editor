import { CdkDragDrop, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, computed, ElementRef, inject, Injector, signal, viewChild, afterNextRender, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatMenu, MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { openEditorContextMenuAtPointer } from '../editor-context-menu/open-editor-context-menu';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerTreeNode, isLayerBranchKind } from '../../services/svg-layer-structure.port';
import { LAYERS_PANEL_SVG_PORT } from '../../services/manipulation-port-tokens';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import {
  LayersPanelDndService,
  type DropZone,
  type LayerDropIntent
} from './layers-panel-dnd.service';

export type { DropZone, LayerDropAction, LayerDropIntent } from './layers-panel-dnd.service';

/** Tiny PNG for layer-row previews — avoids re-embedding huge `data:` raster hrefs in preview SVG. */
const LAYER_ROW_RASTER_PREVIEW_HREF =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface LayerTreeViewModel {
  id: string;
  type: string;
  kind: LayerTreeNode['kind'];
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
  previewMarkup?: string;
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
  private readonly svg = inject(LAYERS_PANEL_SVG_PORT);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly dnd = inject(LayersPanelDndService);
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

  readonly editingLayerId = signal<string | null>(null);
  readonly editingDraftName = signal('');

  readonly layerNameInput = viewChild<ElementRef<HTMLInputElement>>('layerNameInput');

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
    return !toMove.some((s) => this.dnd.isStrictAncestor(s.id, targetId));
  });

  readonly canRemoveFromGroup = computed(() => {
    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length === 0) return false;
    if (shapes.some((s) => this.svg.isElementOrAncestorLocked(s.id))) return false;
    return shapes.some((s) => this.getUserGroupParentId(s.id) != null);
  });

  readonly canReleaseClipPathFromContextMenu = computed(() => {
    const layerId = this.contextMenuLayerId();
    if (!layerId) return false;
    if (this.svg.isElementOrAncestorLocked(layerId)) return false;
    return this.svg.canReleaseClipPath([layerId]);
  });

  readonly flattenedLayers = computed<LayerTreeViewModel[]>(() => {
    this.svg.documentRevision();
    const tree = this.svg.getLayerTree();
    const selectedIds = new Set(this.shapeSelection.selectedShapes().map((s) => s.id));
    const collapsed = this.collapsedGroups();
    return this.flattenTree(tree, 0, collapsed, selectedIds, false);
  });

  private readonly cancelRenameIfRowMissing = effect(() => {
    this.svg.documentRevision();
    const editingId = this.editingLayerId();
    if (!editingId) return;
    const exists = this.flattenedLayers().some((layer) => layer.id === editingId);
    if (!exists) {
      this.editingLayerId.set(null);
      this.editingDraftName.set('');
    }
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

  startLayerRename(layer: LayerTreeViewModel, event?: Event): void {
    event?.stopPropagation();
    this.editingLayerId.set(layer.id);
    this.editingDraftName.set(layer.name);
    afterNextRender(
      () => {
        const input = this.layerNameInput()?.nativeElement;
        if (!input) return;
        input.focus();
        input.select();
      },
      { injector: this.injector }
    );
  }

  commitLayerRename(layer: LayerTreeViewModel): void {
    if (this.editingLayerId() !== layer.id) return;
    this.chromeApply.renameLayer(layer.id, layer.kind, this.editingDraftName());
    this.editingLayerId.set(null);
    this.editingDraftName.set('');
  }

  cancelLayerRename(): void {
    this.editingLayerId.set(null);
    this.editingDraftName.set('');
  }

  onLayerNameInput(event: Event): void {
    this.editingDraftName.set((event.target as HTMLInputElement).value);
  }

  onLayerNameKeydown(event: KeyboardEvent, layer: LayerTreeViewModel): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitLayerRename(layer);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelLayerRename();
    }
  }

  onContextMenuRename(): void {
    const id = this.contextMenuLayerId();
    if (!id) return;
    const layer = this.flattenedLayers().find((row) => row.id === id);
    if (!layer) return;
    this.startLayerRename(layer);
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
      this.dnd.executeDropAction(draggedId, intent.action);
    }
  }

  /** Resolves drop intent from pointer position over a layer row. */
  resolveDropIntentFromPointer(
    draggedId: string,
    pointer: { x: number; y: number }
  ): LayerDropIntent {
    return this.dnd.resolveDropIntentFromPointer(draggedId, pointer, (targetId) =>
      this.flattenedLayers().find((l) => l.id === targetId)?.isGroup ?? false
    );
  }

  resolveLayerDropIntent(draggedId: string, targetId: string, relY: number): LayerDropIntent {
    const targetIsGroup = this.flattenedLayers().find((l) => l.id === targetId)?.isGroup ?? false;
    const intent = this.dnd.resolveLayerDropIntent(draggedId, targetId, relY, targetIsGroup);
    if (!intent.valid) return intent;
    return { ...intent, targetId };
  }

  onLayerContextMenu(layerId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuLayerId.set(layerId);
    openEditorContextMenuAtPointer({
      trigger: this.contextMenuTrigger(),
      triggerEl: this.contextMenuTriggerEl().nativeElement,
      menu: this.layerContextMenu(),
      event,
      injector: this.injector,
      panelClass: 'layer-context-menu-panel'
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

  onContextMenuReleaseClipPath(): void {
    const id = this.contextMenuLayerId();
    if (!id || !this.canReleaseClipPathFromContextMenu()) return;
    this.chromeApply.releaseClipPathFromLayersPanel(id);
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
    const kind = node?.kind ?? (node ? this.inferLayerRowKind(node) : 'shape');
    const isUserGroup = kind === 'group' && Array.isArray(node?.children);
    const isClipMask = kind === 'clipMask' && Array.isArray(node?.children);

    if (isUserGroup) {
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
    } else if (isClipMask) {
      const firstChildId = node!.children!.find((c) => c.kind === 'shape')?.id;
      const firstChild = firstChildId
        ? (svgInstance.findOne(`#${firstChildId}`) as SvgJsElement | null)
        : null;
      if (!firstChild) return;
      const expanded = this.svg.getShapePropertiesInSameClipGroup(firstChild);
      if (expanded.length === 0) return;
      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(expanded);
      } else {
        this.shapeSelection.selectShapes(expanded);
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
    const preview = this.dnd.computeDropPreview(draggedId, pointer, (targetId) =>
      this.flattenedLayers().find((l) => l.id === targetId)?.isGroup ?? false
    );
    if (!preview.dropPreview) {
      this.dropPreview.set(null);
      return;
    }
    this.pendingDropIntent.set(preview.pendingIntent);
    this.dropPreview.set(preview.dropPreview);
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
      const kind = node.kind ?? this.inferLayerRowKind(node);
      const isGroup = isLayerBranchKind(kind) && Array.isArray(node.children);
      const isExpanded = isGroup && !collapsed.has(node.id);
      const directlySelected = selectedIds.has(node.id);
      const selected = directlySelected || ancestorSelected;

      result.push({
        id: node.id,
        type: node.type,
        kind,
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
      const kind = node.kind ?? this.inferLayerRowKind(node);
      if (isLayerBranchKind(kind) && node.children) {
        ids.push(...this.collectLeafIds(node.children));
      } else {
        ids.push(node.id);
      }
    }
    return ids;
  }

  private getUserGroupParentId(elementId: string): string | null {
    const svg = this.svg.getSVGInstance();
    if (!svg) return null;
    const node = svg.findOne(`#${elementId}`)?.node as Element | undefined;
    if (!node) return null;
    const contentRoot =
      (svg.findOne('[data-editor-content-group]')?.node as Element | null) ?? null;
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

  private createPreviewDataUrl(layer: PreviewPaintData): string {
    const sourceMarkup = layer.previewMarkup ?? layer.elementMarkup;
    const normalizedMarkup = layer.previewMarkup
      ? sourceMarkup
      : this.applyPreviewStyleOverrides({ ...layer, elementMarkup: sourceMarkup });
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
      const shape = this.findPreviewBBoxElement(doc);
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

  private findPreviewBBoxElement(doc: Document): Element | null {
    const skip = new Set(['svg', 'defs', 'clippath', 'mask', 'title', 'desc', 'metadata', 'style']);
    const candidates = Array.from(doc.querySelectorAll('*')).filter((el) => {
      const tag = el.tagName?.toLowerCase() ?? '';
      return !skip.has(tag);
    });
    return candidates[0] ?? null;
  }

  private inferLayerRowKind(node: LayerTreeNode): LayerTreeNode['kind'] {
    if (node.type === 'clip') return 'clipMask';
    if (node.type === 'mask' && node.children) return 'mask';
    if (node.type === 'g' && node.children) return 'group';
    return 'shape';
  }
}
