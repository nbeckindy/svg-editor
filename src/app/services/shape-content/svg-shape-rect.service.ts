import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import type { SvgShapeRectPort } from './svg-shape-rect.port';
import { SvgEditorDocumentService } from '../svg-editor-document.service';

@Injectable({ providedIn: 'root' })
export class SvgShapeRectService implements SvgShapeRectPort {
  private readonly doc = inject(SvgEditorDocumentService);

  readShapeRectFields(
    element: SvgJsElement,
    node: Element
  ): Pick<ShapeProperties, 'rx' | 'ry' | 'rectMaxCornerRadius'> {
    if (node.tagName.toLowerCase() !== 'rect') {
      return {};
    }

    const w = Number.parseFloat(node.getAttribute('width') ?? '');
    const h = Number.parseFloat(node.getAttribute('height') ?? '');
    const rectMaxCornerRadius = SvgShapeRectService.computeMaxCornerRadius(w, h);

    const rxAttr = node.getAttribute('rx');
    const ryAttr = node.getAttribute('ry');
    const rawRx = rxAttr != null ? Number.parseFloat(rxAttr) : Number.NaN;
    const rawRy = ryAttr != null ? Number.parseFloat(ryAttr) : Number.NaN;
    const hasRx = Number.isFinite(rawRx);
    const hasRy = Number.isFinite(rawRy);

    const radiusFields: Pick<ShapeProperties, 'rx' | 'ry'> = {};
    if (hasRx || hasRy) {
      const rx = hasRx ? rawRx : 0;
      const ry = hasRy ? rawRy : hasRx ? rawRx : 0;
      if (rx !== 0 || ry !== 0) {
        radiusFields.rx = rx;
        radiusFields.ry = ry;
      }
    }

    return { ...radiusFields, rectMaxCornerRadius };
  }

  /** SVG max corner radius: half the shorter rect edge. */
  static computeMaxCornerRadius(width: number, height: number): number {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return 0;
    }
    return Math.min(width / 2, height / 2);
  }

  updateRectCornerRadius(shapeId: string, radius: number): void {
    const shape = this.resolveRect(shapeId);
    if (!shape) return;

    const clamped = this.clampRadius(shape, radius);
    this.applyRadii(shape, clamped, clamped);
    this.doc.bumpDocumentRevision();
  }

  restoreRectCornerRadii(shapeId: string, rx: number, ry: number): void {
    const shape = this.resolveRect(shapeId);
    if (!shape) return;

    this.applyRadii(shape, rx, ry);
    this.doc.bumpDocumentRevision();
  }

  private resolveRect(shapeId: string): SvgJsElement | null {
    const svg = this.doc.getSVGInstance();
    if (!svg) return null;
    const shape = svg.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'rect') return null;
    return shape;
  }

  private clampRadius(shape: SvgJsElement, radius: number): number {
    const w = Number.parseFloat(String(shape.attr('width') ?? ''));
    const h = Number.parseFloat(String(shape.attr('height') ?? ''));
    const maxRadius = SvgShapeRectService.computeMaxCornerRadius(w, h);
    if (maxRadius <= 0) return 0;
    return Math.max(0, Math.min(radius, maxRadius));
  }

  private applyRadii(shape: SvgJsElement, rx: number, ry: number): void {
    if (rx === 0 && ry === 0) {
      shape.attr('rx', null);
      shape.attr('ry', null);
      return;
    }

    shape.attr('rx', rx);
    shape.attr('ry', ry);
  }
}
