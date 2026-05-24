import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { HistoryPaintPort } from './history-paint.port';

/** Stroke add/remove and dash fields used by selection paint commands (non-color). */
export interface SelectionPaintStrokeDashSvgPort {
  addStroke(shapeId: string, color: string, width: number): void;
  removeStroke(shapeId: string): void;
  updateStrokeDasharray(shapeId: string, dasharray: string): void;
  updateStrokeDashoffset(shapeId: string, offset: number): void;
}

/**
 * Svg seam for `SelectionPaintApplyService`: {@link HistoryPaintPort} plus stroke / dash
 * helpers and shape reads used when syncing the selection model from the live tree.
 */
export interface SelectionPaintApplySvgPort extends HistoryPaintPort, SelectionPaintStrokeDashSvgPort {
  getSVGInstance(): Svg | null;
  getShapeProperties(element: SvgJsElement): ShapeProperties;
}
