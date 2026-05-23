import type { Matrix, Svg } from '@svgdotjs/svg.js';
import type { TransformGestureDocSvgPort, TransformGestureUnionRect, GhostUnionSvgPort } from '../../../history/transform-gesture-svg.port';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import type { EditorCommand } from '../../../models/editor-commands';

type BBox = TransformGestureUnionRect;

/**
 * Narrow **seam** for drag / resize / rotate / skew: common reads + **History** commits.
 * {@link DefaultTransformGestureDoc.svgManipulation} is {@link TransformGestureDocSvgPort}
 * (not the full manipulation type at the type level). This port extends {@link GhostUnionSvgPort}
 * so it is assignable where union ghost preview reads the tree (`GhostSession.buildFragmentsForUnion`).
 * Transform `EditorCommand`s still take `TransformGestureSvgPort` only.
 */
export interface TransformGestureDocPort extends GhostUnionSvgPort {
  readonly svgManipulation: TransformGestureDocSvgPort;

  selectedShapeIds(): string[];
  getUnionBBox(ids: string[], options?: { preferScreenBounds?: boolean }): BBox | null;
  snapshotSelectionTransforms(ids: string[]): Map<string, Matrix>;
  snapshotVectorEffectsForShapes(ids: string[]): Map<string, (string | null)[]>;
  setShapeVisibility(id: string, visible: boolean): void;
  getSelectionRotationPivot(ids: string[]): { x: number; y: number } | null;
  getShapeBBox(shapeId: string, options?: { preferScreenBounds?: boolean }): BBox | null;
  pushAndExecute(cmd: EditorCommand): void;
}

export class DefaultTransformGestureDoc implements TransformGestureDocPort {
  constructor(
    readonly svgManipulation: TransformGestureDocSvgPort,
    private readonly shapeSelection: ShapeSelectionService,
    private readonly editorHistory: EditorHistoryService
  ) {}

  selectedShapeIds(): string[] {
    return this.shapeSelection.getSelectedShapes().map((s) => s.id);
  }

  getUnionBBox(ids: string[], options?: { preferScreenBounds?: boolean }): BBox | null {
    return this.svgManipulation.getUnionBBox(ids, options);
  }

  getSVGInstance(): Svg | null {
    return this.svgManipulation.getSVGInstance();
  }

  snapshotSelectionTransforms(ids: string[]): Map<string, Matrix> {
    return this.svgManipulation.snapshotSelectionTransforms(ids);
  }

  snapshotVectorEffectsForShapes(ids: string[]): Map<string, (string | null)[]> {
    return this.svgManipulation.snapshotVectorEffectsForShapes(ids);
  }

  getShapeIdsInDomOrder(ids: string[]): string[] {
    return this.svgManipulation.getShapeIdsInDomOrder(ids);
  }

  setShapeVisibility(id: string, visible: boolean): void {
    this.svgManipulation.setShapeVisibility(id, visible);
  }

  getSelectionRotationPivot(ids: string[]): { x: number; y: number } | null {
    return this.svgManipulation.getSelectionRotationPivot(ids);
  }

  getShapeBBox(shapeId: string, options?: { preferScreenBounds?: boolean }): BBox | null {
    return this.svgManipulation.getShapeBBox(shapeId, options);
  }

  pushAndExecute(cmd: EditorCommand): void {
    this.editorHistory.pushAndExecute(cmd);
  }
}

export function createDefaultTransformGestureDoc(
  svgManipulation: TransformGestureDocSvgPort,
  shapeSelection: ShapeSelectionService,
  editorHistory: EditorHistoryService
): DefaultTransformGestureDoc {
  return new DefaultTransformGestureDoc(svgManipulation, shapeSelection, editorHistory);
}
