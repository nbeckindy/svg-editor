import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';

/** Read model for computed paint on a DOM node (layers panel + stack preview). */
export interface SvgShapePaintReadout {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fillOpacity?: number;
  strokeOpacity?: number;
}

export interface SvgShapePaintPort {
  getRenderedPaint(node: Element): SvgShapePaintReadout;
  isStrokeVisiblyPainted(node: Element): boolean;
  getShapeProperties(element: SvgJsElement): ShapeProperties;

  updateFillColor(shapeId: string, color: string): void;
  addStroke(shapeId: string, color: string, width: number): void;
  removeStroke(shapeId: string): void;
  updateStrokeColor(shapeId: string, color: string): void;
  updateStrokeDasharray(shapeId: string, dasharray: string): void;
  updateStrokeDashoffset(shapeId: string, dashoffset: number): void;
  updateOpacity(shapeId: string, opacity: number): void;
  updateFillOpacity(shapeId: string, opacity: number): void;
  updateStrokeOpacity(shapeId: string, opacity: number): void;

  bakeEffectiveFillToLocal(shapeId: string): void;
  bakeEffectiveStrokeToLocal(shapeId: string): void;
  restoreBakedFillPresentation(
    shapeId: string,
    before: { fillAttr: string | null; fillStyleValue: string }
  ): void;
  restoreBakedStrokePresentation(
    shapeId: string,
    before: {
      strokeAttr: string | null;
      strokeStyleValue: string;
      strokeWidthAttr: string | null;
      strokeWidthStyleValue: string;
    }
  ): void;
}
