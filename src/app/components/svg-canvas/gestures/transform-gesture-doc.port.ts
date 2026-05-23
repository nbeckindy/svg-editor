import type { Svg } from '@svgdotjs/svg.js';
import type { Matrix } from '@svgdotjs/svg.js';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import type { EditorCommand } from '../../../models/editor-commands';

type BBox = { x: number; y: number; width: number; height: number };

/**
 * Narrow **seam** for drag / resize / rotate / skew: common reads + **History** commits.
 * {@link DefaultTransformGestureDoc.svgManipulation} remains for **EditorCommand** constructors
 * until those accept a smaller type. Union ghost preview uses only `getSVGInstance` and
 * `getShapeIdsInDomOrder` (see `GhostUnionSvgPort` in `ghost-session.ts`).
 */
export interface TransformGestureDocPort {
  readonly svgManipulation: SvgManipulationService;

  selectedShapeIds(): string[];
  getUnionBBox(ids: string[], options?: { preferScreenBounds?: boolean }): BBox | null;
  getSVGInstance(): Svg | null;
  snapshotSelectionTransforms(ids: string[]): Map<string, Matrix>;
  snapshotVectorEffectsForShapes(ids: string[]): Map<string, (string | null)[]>;
  getShapeIdsInDomOrder(ids: string[]): string[];
  setShapeVisibility(id: string, visible: boolean): void;
  getSelectionRotationPivot(ids: string[]): { x: number; y: number } | null;
  getShapeBBox(shapeId: string, options?: { preferScreenBounds?: boolean }): BBox | null;
  pushAndExecute(cmd: EditorCommand): void;
}

export class DefaultTransformGestureDoc implements TransformGestureDocPort {
  constructor(
    readonly svgManipulation: SvgManipulationService,
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
  svgManipulation: SvgManipulationService,
  shapeSelection: ShapeSelectionService,
  editorHistory: EditorHistoryService
): DefaultTransformGestureDoc {
  return new DefaultTransformGestureDoc(svgManipulation, shapeSelection, editorHistory);
}
