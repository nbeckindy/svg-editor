import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { EditableGradientModel, PaintGradientSnapshot } from '../models/svg-gradient';
import type { AlignDistributeSvgPort } from './align-distribute-svg.port';
import type { GradientFillSnapshotSvgPort } from './gradient-fill-editor-svg.port';

/** Svg slice for rect corner radius commands from the properties panel. */
export interface PropertiesPanelRectSvgPort {
  updateRectCornerRadius(shapeId: string, radius: number): void;
  restoreRectCornerRadii(shapeId: string, rx: number, ry: number): void;
}

/** Typography + text presentation commands used from the properties panel. */
export interface PropertiesPanelTextSvgPort {
  updateTextFontFamily(textId: string, fontFamily: string): void;
  updateTextFontSize(textId: string, fontSize: number): void;
  updateTextFontWeight(textId: string, fontWeight: string): void;
  updateTextFontStyle(textId: string, fontStyle: string): void;
  updateTextAnchor(textId: string, anchor: 'start' | 'middle' | 'end'): void;
  updateTextPaintOrder(textId: string, order: string | undefined): void;
  updateTextVectorEffect(textId: string, effect: string | undefined): void;
}

export type BakedFillBefore = { fillAttr: string | null; fillStyleValue: string };
export type BakedStrokeBefore = {
  strokeAttr: string | null;
  strokeStyleValue: string;
  strokeWidthAttr: string | null;
  strokeWidthStyleValue: string;
};

/** Svg slice for `BakeFillCommand` / `BakeStrokeCommand`. */
export interface BakePresentationSvgPort {
  getSVGInstance(): Svg | null;
  bakeEffectiveFillToLocal(shapeId: string): void;
  restoreBakedFillPresentation(shapeId: string, before: BakedFillBefore): void;
  bakeEffectiveStrokeToLocal(shapeId: string): void;
  restoreBakedStrokePresentation(shapeId: string, before: BakedStrokeBefore): void;
}

/**
 * Svg seam for `PropertiesPanelComponent`: align/distribute, gradient snapshot, text
 * typography, bake-to-local, and chrome helpers used by panel actions.
 */
export interface PropertiesPanelSvgPort
  extends AlignDistributeSvgPort,
    GradientFillSnapshotSvgPort,
    PropertiesPanelTextSvgPort,
    PropertiesPanelRectSvgPort,
    BakePresentationSvgPort {
  clearHighlight(): void;
  getNearestGroupAncestorId(shapeId: string): string | null;
  getShapeProperties(element: SvgJsElement): ShapeProperties;
  allocateUniqueDefId(prefix: string): string;
  capturePaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke'): PaintGradientSnapshot;
  readEditableGradientModelById(gradientId: string): EditableGradientModel | null;
}
