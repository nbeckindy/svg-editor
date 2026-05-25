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
 * Svg seam for {@link ChromeEditorApplyService}: {@link HistoryPaintPort} plus stroke / dash
 * helpers and shape reads used when syncing **Selection** from the **Live tree**.
 */
export interface ChromeEditorApplySvgPort extends HistoryPaintPort, SelectionPaintStrokeDashSvgPort {
  getSVGInstance(): Svg | null;
  getShapeProperties(element: SvgJsElement): ShapeProperties;
}
