import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import type { AxisAlignedRect } from '../../utils/marquee-selection';

/** Marquee hit-test seam for selection gestures. */
export interface SvgSelectionHitTestPort {
  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[];
  getShapeProperties(element: SvgJsElement): ShapeProperties;
}
