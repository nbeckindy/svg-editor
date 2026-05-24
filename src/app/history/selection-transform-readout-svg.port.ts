import type { Signal } from '@angular/core';
import type { Svg } from '@svgdotjs/svg.js';
import type { TransformGestureUnionRect } from './transform-gesture-svg.port';

/**
 * Read-only svg seam for `SelectionTransformReadoutService` (properties panel bbox / skew /
 * rotation readouts).
 */
export interface SelectionTransformReadoutSvgPort {
  readonly documentRevision: Signal<number>;
  getUnionBBox(shapeIds: string[], options?: { preferScreenBounds?: boolean }): TransformGestureUnionRect | null;
  getSVGInstance(): Svg | null;
}
