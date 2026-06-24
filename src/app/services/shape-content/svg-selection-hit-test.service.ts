import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { ShapeProperties } from '../../models/shape-properties.interface';
import {
  axisAlignedRectContains,
  axisAlignedRectsIntersect,
  marqueeEdgeSamplePoints,
  marqueeSamplePoints,
  type AxisAlignedRect
} from '../../utils/marquee-selection';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { SvgSelectionGeometryService } from '../svg-selection-geometry.service';
import { CONTENT_SHAPE_SELECTOR, EDITOR_CONTENT_GROUP_ID } from '../svg-editor-stage.constants';
import { SvgShapePaintService } from './svg-shape-paint.service';
import type { SvgSelectionHitTestPort } from './svg-selection-hit-test.port';

@Injectable({ providedIn: 'root' })
export class SvgSelectionHitTestService implements SvgSelectionHitTestPort {
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly geometry = inject(SvgSelectionGeometryService);
  private readonly paint = inject(SvgShapePaintService);

  getShapeProperties(element: SvgJsElement): ShapeProperties {
    return this.paint.getShapeProperties(element);
  }

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[] {
    if (!this.doc.getSVGInstance()) return [];
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const scope = contentGroup ?? this.doc.getSVGInstance()!;
    const shapes = scope.find(CONTENT_SHAPE_SELECTOR) as SvgJsElement[];
    const out: ShapeProperties[] = [];
    for (const shape of shapes) {
      const id = shape.id();
      if (!id) continue;
      const bbox = this.geometry.getShapeBBox(id);
      if (!bbox || !axisAlignedRectsIntersect(rect, bbox)) continue;
      if (axisAlignedRectContains(rect, bbox)) {
        out.push(this.getShapeProperties(shape));
        continue;
      }
      const node = shape.node as SVGGraphicsElement | undefined;
      if (!node) continue;
      if (node.tagName?.toLowerCase() === 'image') {
        out.push(this.getShapeProperties(shape));
        continue;
      }
      if (!this.shapeMarqueeIntersectsPaint(shape, rect)) continue;
      out.push(this.getShapeProperties(shape));
    }
    return out;
  }

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
}
