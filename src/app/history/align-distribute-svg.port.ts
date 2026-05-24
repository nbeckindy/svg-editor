import type { Matrix, Svg } from '@svgdotjs/svg.js';
import type { TransformGestureSvgPort, TransformGestureUnionRect } from './transform-gesture-svg.port';

/**
 * Svg slice for `AlignCommand` / `DistributeCommand` (bbox reads + translate command surface).
 */
export interface AlignDistributeSvgPort extends TransformGestureSvgPort {
  getShapeBBox(shapeId: string, options?: { preferScreenBounds?: boolean }): TransformGestureUnionRect | null;
  getUnionBBox(shapeIds: string[], options?: { preferScreenBounds?: boolean }): TransformGestureUnionRect | null;
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix>;
}
