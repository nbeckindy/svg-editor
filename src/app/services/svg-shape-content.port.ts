import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { AxisAlignedRect } from '../utils/marquee-selection';
import type { ClipboardPayload } from '../models/clipboard-payload';

export type CreatableShapeType = 'rect' | 'ellipse' | 'line' | 'text';

/** Insert a raster as `<image>` in the editor content group (see ADR 0001). */
export interface InsertRasterImageAttrs {
  /** Raster reference, typically a `data:` URL per ADR 0001. */
  href: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** When set, written as `preserveAspectRatio`; omit for SVG default (`xMidYMid meet`). */
  preserveAspectRatio?: string;
}

export interface ShapeCreationAttrs {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic';
  textAnchor?: 'start' | 'middle' | 'end';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/** Read model for computed paint on a DOM node (layers panel + stack preview). */
export interface SvgShapePaintReadout {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * Shape DOM read/write: properties, paint, text, paths, motion, clipboard, marquee hit-test.
 */
export interface SvgShapeContentPort {
  getRenderedPaint(node: Element): SvgShapePaintReadout;
  isStrokeVisiblyPainted(node: Element): boolean;

  getShapeProperties(element: SvgJsElement): ShapeProperties;
  getShapePropertiesInSameClipGroup(shape: SvgJsElement): ShapeProperties[];
  expandSelectionByClipGroups(shapes: ShapeProperties[]): ShapeProperties[];

  updateFillColor(shapeId: string, color: string): void;
  addStroke(shapeId: string, color: string, width: number): void;
  removeStroke(shapeId: string): void;
  updateStrokeColor(shapeId: string, color: string): void;
  updateStrokeDasharray(shapeId: string, dasharray: string): void;
  updateStrokeDashoffset(shapeId: string, dashoffset: number): void;
  updateOpacity(shapeId: string, opacity: number): void;
  updatePathData(pathId: string, d: string): void;

  getPathNodeHandleLinkRaw(pathId: string): string | null;
  setPathNodeHandleLinkRaw(pathId: string, value: string | null): void;

  getTextContent(textId: string): string | null;
  updateTextContent(textId: string, text: string): void;
  updateTextFontFamily(textId: string, fontFamily: string): void;
  updateTextFontSize(textId: string, fontSize: number): void;
  updateTextFontWeight(textId: string, fontWeight: string): void;
  updateTextFontStyle(textId: string, fontStyle: string): void;
  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end'): void;
  updateTextPaintOrder(textId: string, paintOrder: string | undefined): void;
  updateTextVectorEffect(textId: string, effect: string | undefined): void;

  getNearestGroupAncestorId(shapeId: string): string | null;
  bakeEffectiveFillToLocal(shapeId: string): void;
  bakeEffectiveStrokeToLocal(shapeId: string): void;
  /** Undo of {@link bakeEffectiveFillToLocal}: restore captured presentation + inline style cascade. */
  restoreBakedFillPresentation(
    shapeId: string,
    before: { fillAttr: string | null; fillStyleValue: string }
  ): void;
  /** Undo of {@link bakeEffectiveStrokeToLocal}: restore captured presentation + inline style cascade. */
  restoreBakedStrokePresentation(
    shapeId: string,
    before: {
      strokeAttr: string | null;
      strokeStyleValue: string;
      strokeWidthAttr: string | null;
      strokeWidthStyleValue: string;
    }
  ): void;
  /** Re-insert shapes removed by {@link removeShapes} using captured outerHTML and content-group indices. */
  restoreRemovedShapesInContentGroup(
    shapeIds: string[],
    serializedMarkup: ReadonlyMap<string, string>,
    insertionIndices: ReadonlyMap<string, number>
  ): void;
  translateShape(shapeId: string, dx: number, dy: number): void;
  setShapeVisibility(shapeId: string, visible: boolean): void;

  getShapePropertiesIntersectingRect(rect: AxisAlignedRect): ShapeProperties[];

  clearHighlight(): void;
  removeShapes(shapeIds: string[]): void;
  removeShape(shapeId: string): void;
  addShape(type: CreatableShapeType, attrs: ShapeCreationAttrs): string | null;
  insertPathIntoContentGroup(
    d: string,
    attrs?: { fill?: string; stroke?: string; strokeWidth?: number },
    options?: { closedPath?: boolean }
  ): string | null;
  insertRasterImageIntoContentGroup(attrs: InsertRasterImageAttrs): string | null;
  insertShapeMarkup(markup: string, insertionIndex?: number): void;

  createClipboardPayload(shapeIds: string[]): ClipboardPayload;
  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] };
}
