import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Element as SVGElement } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerStackItem, SvgManipulationService } from '../../services/svg-manipulation.service';

interface LayerRowViewModel {
  id: string;
  type: string;
  previewUrl: string;
  selected: boolean;
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

  readonly layers = computed<LayerRowViewModel[]>(() => {
    this.svgManipulation.documentRevision();
    const selectedIds = new Set(this.shapeSelection.selectedShapes().map((shape) => shape.id));
    return this.svgManipulation
      .getLayerStackItems()
      .slice()
      .reverse()
      .map((layer) => ({
        id: layer.id,
        type: layer.type,
        previewUrl: this.createPreviewDataUrl(layer),
        selected: selectedIds.has(layer.id)
      }));
  });

  onLayerClick(layerId: string, event?: MouseEvent): void {
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${layerId}`) as SVGElement | null;
    if (!shape) return;
    const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(shape);
    if (expanded.length === 0) return;
    const additive = Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
    if (additive) {
      this.shapeSelection.toggleShapeGroupInSelection(expanded);
    } else {
      this.shapeSelection.selectShapes(expanded);
    }
    this.svgManipulation.highlightShape(expanded[0]?.id ?? layerId);
  }

  private createPreviewDataUrl(layer: LayerStackItem): string {
    const normalizedMarkup = this.applyPreviewStyleOverrides(layer);
    const viewBox = this.computePreviewViewBox(normalizedMarkup);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="32" height="24" preserveAspectRatio="xMidYMid meet">${normalizedMarkup}</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  private applyPreviewStyleOverrides(layer: LayerStackItem): string {
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
      return layer.elementMarkup;
    }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(layer.elementMarkup, 'image/svg+xml');
      const el = doc.documentElement;
      if (!el || el.tagName.toLowerCase() === 'parsererror') return layer.elementMarkup;
      // Force explicit paint attrs so thumbnail keeps visible fill/stroke exactly like canvas.
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
