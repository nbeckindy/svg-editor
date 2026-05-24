import type { Signal } from '@angular/core';
import type { Svg } from '@svgdotjs/svg.js';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';

/** Svg slice for `GradientFillSnapshotCommand` (gradient defs + paint attr). */
export interface GradientFillSnapshotSvgPort {
  applyPaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke', snapshot: PaintGradientSnapshot): void;
  countPaintUrlReferencesToDefId(defId: string): number;
  removeGradientDefById(gradientId: string): void;
}

/**
 * Svg seam for `GradientFillEditorComponent`: revision + instance, gradient read/write helpers,
 * and {@link GradientFillSnapshotSvgPort} for history commits.
 */
export interface GradientFillEditorSvgPort extends GradientFillSnapshotSvgPort {
  readonly documentRevision: Signal<number>;
  getSVGInstance(): Svg | null;
  ensureDedicatedPaintGradient(shapeId: string, paintProperty: 'fill' | 'stroke'): string | null;
  readEditableGradientModelById(gradientId: string): EditableGradientModel | null;
  capturePaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke'): PaintGradientSnapshot;
  setGradientKindForShape(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    preserveStopsFrom: EditableGradientModel
  ): EditableGradientModel;
}
