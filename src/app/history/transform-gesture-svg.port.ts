import type { Matrix, Svg } from '@svgdotjs/svg.js';
import type { ResizeHandle } from '../utils/selection-resize';
import type { SkewAxis } from '../utils/selection-skew';

/** Union bbox in editor (user) space — matches geometry helpers used by union transforms. */
export type TransformGestureUnionRect = { x: number; y: number; width: number; height: number };

/**
 * Slice of `SvgManipulationService` consumed by pointer **transform** commands
 * (translate / union scale / union rotate / skew). Lets those commands depend on a
 * small seam instead of the full manipulation façade.
 */
export interface TransformGestureSvgPort {
  getSVGInstance(): Svg | null;
  translateShape(shapeId: string, dx: number, dy: number): void;
  applyUnionScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: TransformGestureUnionRect,
    unionAfter: TransformGestureUnionRect,
    snapshot: Map<string, Matrix>,
    handle: ResizeHandle
  ): void;
  restoreVectorEffectsForShapeSubtrees(shapeIds: string[], snapshots: Map<string, (string | null)[]>): void;
  applyUnionScaleFromCenter(
    shapeIds: string[],
    unionBefore: TransformGestureUnionRect,
    unionAfter: TransformGestureUnionRect,
    snapshot: Map<string, Matrix>
  ): void;
  applyUnionRotationFromSnapshot(
    shapeIds: string[],
    pivot: { x: number; y: number },
    angleDeg: number,
    snapshot: Map<string, Matrix>
  ): void;
  applyUnionSkewFromSnapshot(
    shapeIds: string[],
    axis: SkewAxis,
    angleDeg: number,
    pivot: { x: number; y: number },
    snapshot: Map<string, Matrix>
  ): void;
  /** Restore each shape's `transform` matrix from a prior {@link snapshotSelectionTransforms} map (undo for pointer transforms). */
  restoreSelectionTransformsFromSnapshot(shapeIds: string[], snapshot: Map<string, Matrix>): void;
}

/**
 * Svg seam on the transform gesture runtime: {@link TransformGestureSvgPort} for undoable
 * pointer transforms plus bbox / visibility / transform snapshots used by drag / resize /
 * rotate / skew. Structurally implemented by `SvgManipulationService` at the canvas adapter
 * (`implements TransformGestureDocSvgPort` on the service class).
 */
export interface TransformGestureDocSvgPort extends TransformGestureSvgPort {
  getUnionBBox(shapeIds: string[], options?: { preferScreenBounds?: boolean }): TransformGestureUnionRect | null;
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix>;
  snapshotVectorEffectsForShapes(shapeIds: string[]): Map<string, (string | null)[]>;
  getShapeIdsInDomOrder(ids: string[]): string[];
  setShapeVisibility(shapeId: string, visible: boolean): void;
  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null;
  getShapeBBox(shapeId: string, options?: { preferScreenBounds?: boolean }): TransformGestureUnionRect | null;
  /** True if this node or any ancestor `<g>` / row has `data-editor-locked="true"`. */
  isElementOrAncestorLocked(shapeId: string): boolean;
}

/**
 * Svg seam for committing union bbox edits from the properties panel
 * (`ChromeEditorApplyService`): {@link TransformGestureSvgPort} plus snapshot / pivot
 * reads used with translate / union-scale / union-rotate commands.
 */
export interface SelectionTransformApplySvgPort extends TransformGestureSvgPort {
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix>;
  snapshotVectorEffectsForShapes(shapeIds: string[]): Map<string, (string | null)[]>;
  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null;
}

/**
 * Two-method read seam for union ghost subtree cloning (`GhostSession.buildFragmentsForUnion`).
 * Matches a slice of {@link TransformGestureDocSvgPort}.
 */
export type GhostUnionSvgPort = Pick<TransformGestureDocSvgPort, 'getSVGInstance' | 'getShapeIdsInDomOrder'>;
