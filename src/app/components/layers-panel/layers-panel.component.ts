import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerTreeNode, SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import {
  ReorderCommand,
  ToggleVisibilityCommand,
  GroupCommand,
  UngroupCommand
} from '../../models/editor-commands';

interface LayerTreeViewModel {
  id: string;
  type: string;
  name: string;
  depth: number;
  isGroup: boolean;
  isExpanded: boolean;
  visible: boolean;
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
  imports: [CommonModule],
  templateUrl: './layers-panel.component.html',
  styleUrl: './layers-panel.component.css'
})
export class LayersPanelComponent {
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);

  readonly collapsedGroups = signal(new Set<string>());

  readonly selectionCount = computed(() => this.shapeSelection.selectedShapes().length);

  readonly canUngroup = computed(() => {
    const shapes = this.shapeSelection.selectedShapes();
    return shapes.length === 1 && shapes[0].type === 'g';
  });

  readonly flattenedLayers = computed<LayerTreeViewModel[]>(() => {
    this.svgManipulation.documentRevision();
    const tree = this.svgManipulation.getLayerTree();
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
    this.editorHistory.pushAndExecute(
      new ToggleVisibilityCommand(this.svgManipulation, layerId)
    );
  }

  onMoveForward(layerId: string): void {
    this.editorHistory.pushAndExecute(
      new ReorderCommand(this.svgManipulation, layerId, 'forward')
    );
  }

  onMoveBackward(layerId: string): void {
    this.editorHistory.pushAndExecute(
      new ReorderCommand(this.svgManipulation, layerId, 'backward')
    );
  }

  onGroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    this.editorHistory.pushAndExecute(
      new GroupCommand(this.svgManipulation, ids)
    );
  }

  onUngroupSelected(): void {
    const selected = this.shapeSelection.selectedShapes();
    if (selected.length !== 1 || selected[0].type !== 'g') return;
    this.editorHistory.pushAndExecute(
      new UngroupCommand(this.svgManipulation, selected[0].id)
    );
    this.shapeSelection.clearSelection();
  }

  onLayerClick(layerId: string, event?: MouseEvent): void {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${layerId}`) as SvgJsElement | null;
    if (!shape) return;

    const additive = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    const tree = this.svgManipulation.getLayerTree();
    const node = this.findNodeInTree(tree, layerId);
    const isGroup = node?.type === 'g' && Array.isArray(node.children);

    if (isGroup) {
      const leafIds = this.collectLeafIds(node!.children!);
      const leafShapes = leafIds
        .map((id) => svgInstance.findOne(`#${id}`) as SvgJsElement | null)
        .filter((el): el is SvgJsElement => el != null)
        .map((el) => this.svgManipulation.getShapeProperties(el));

      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(leafShapes);
      } else {
        this.shapeSelection.selectShapes(leafShapes);
      }
    } else {
      const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(shape);
      if (expanded.length === 0) return;
      if (additive) {
        this.shapeSelection.toggleShapeGroupInSelection(expanded);
      } else {
        this.shapeSelection.selectShapes(expanded);
      }
    }
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
      if (bbox.width <= 0 || bbox.height <= 0) return defaultViewBox;

      const padX = Math.max(1, bbox.width * 0.1);
      const padY = Math.max(1, bbox.height * 0.1);
      return `${bbox.x - padX} ${bbox.y - padY} ${bbox.width + padX * 2} ${bbox.height + padY * 2}`;
    } catch {
      return defaultViewBox;
    } finally {
      host.remove();
    }
  }
}
