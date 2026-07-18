import type { Matrix } from '@svgdotjs/svg.js';
import type { ResizeHandle } from '../utils/selection-resize';
import type { TextScaleAttrSnapshot, TextUniformScaleMode } from '../utils/text-uniform-scale';

export interface SvgSelectionGeometryPort {
  getShapeBBox(
    shapeId: string,
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null;
  getUnionBBox(
    shapeIds: string[],
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null;
  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null;
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix>;
  mapPathLocalToRootUser(shapeId: string, lx: number, ly: number): { x: number; y: number };
  mapRootUserToPathLocal(shapeId: string, rx: number, ry: number): { x: number; y: number } | null;
  snapshotVectorEffectsForShapes(shapeIds: string[]): Map<string, (string | null)[]>;
  restoreVectorEffectsForShapeSubtrees(
    shapeIds: string[],
    snapshots: Map<string, (string | null)[]>
  ): void;
  applyUnionScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>,
    handle: ResizeHandle
  ): void;
  applyUnionScaleFromCenter(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
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
    axis: 'x' | 'y',
    angleDeg: number,
    pivot: { x: number; y: number },
    snapshot: Map<string, Matrix>
  ): void;
  restoreSelectionTransformsFromSnapshot(shapeIds: string[], snapshot: Map<string, Matrix>): void;
  snapshotTextScaleAttrs(shapeIds: string[]): Map<string, TextScaleAttrSnapshot>;
  applyTextUniformScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    attrSnapshot: Map<string, TextScaleAttrSnapshot>,
    mode: TextUniformScaleMode
  ): void;
  restoreTextScaleAttrsFromSnapshot(
    shapeIds: string[],
    snapshot: Map<string, TextScaleAttrSnapshot>
  ): void;
}
