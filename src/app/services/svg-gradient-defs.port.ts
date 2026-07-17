import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';

/**
 * Narrow surface for defs-backed paint gradients (editor gradient UI + undo snapshots).
 */
export interface SvgGradientDefsPort {
  allocateUniqueDefId(prefix: string): string;
  countPaintUrlReferencesToDefId(defId: string): number;
  removeGradientDefById(gradientId: string): void;
  /** Remove a gradient def when no element references it via `url(#id)` paint. */
  purgeGradientDefIfUnreferenced(defId: string | null | undefined): void;
  /** After releasing a fill/stroke value, drop its gradient def if nothing else references it. */
  purgeGradientDefForReleasedPaintAttr(paintAttr: string | null | undefined): void;
  /** Scan document defs and remove every unreferenced linear/radial gradient. */
  purgeUnreferencedGradientDefs(): void;
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
  /**
   * Clone a creation-defaults gradient template into document defs with a fresh id.
   * Returns `url(#id)` for use as fill/stroke, or `''` if defs are unavailable.
   */
  materializeCreationGradientTemplate(template: EditableGradientModel): string;
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
