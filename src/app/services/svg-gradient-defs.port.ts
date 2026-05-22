import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';

/**
 * Narrow surface for defs-backed paint gradients (editor gradient UI + undo snapshots).
 */
export interface SvgGradientDefsPort {
  allocateUniqueDefId(prefix: string): string;
  countPaintUrlReferencesToDefId(defId: string): number;
  removeGradientDefById(gradientId: string): void;
  countContentShapesReferencingPaintDef(defId: string): number;
  findGradientDomElement(gradientId: string): SVGLinearGradientElement | SVGRadialGradientElement | null;
  readEditableGradientModelById(gradientId: string): EditableGradientModel | null;
  ensureDedicatedPaintGradient(shapeId: string, paintProperty: 'fill' | 'stroke'): string | null;
  capturePaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke'): PaintGradientSnapshot;
  applyPaintGradientSnapshot(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    snapshot: PaintGradientSnapshot
  ): void;
  writeEditableGradientModel(model: EditableGradientModel): void;
  createLinearGradientFillForShape(shapeId: string, fromColor: string, toColor?: string): string;
  applyGradientModelToShapePaint(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    model: EditableGradientModel
  ): void;
  setGradientKindForShape(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    preserveStopsFrom: EditableGradientModel
  ): EditableGradientModel;
}
