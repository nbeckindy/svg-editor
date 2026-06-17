import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { ClipboardPayload } from '../models/clipboard-payload';

/**
 * Svg seam for **History** commands that add/remove/repaste shapes in the **Live tree**
 * (`RemoveShapesCommand`, `PasteCommand`, `DuplicateCommand`, `AddShapeCommand`, `AddPathCommand`, `AddImageCommand`).
 */
export interface EditorShapeLifecycleSvgPort {
  getSVGInstance(): Svg | null;
  getShapeProperties(element: SvgJsElement): ShapeProperties;
  removeShapes(shapeIds: string[]): void;
  removeShape(shapeId: string): void;
  restoreRemovedShapesInContentGroup(
    shapeIds: string[],
    serializedMarkup: ReadonlyMap<string, string>,
    insertionIndices: ReadonlyMap<string, number>
  ): void;
  insertShapeMarkup(markup: string, insertionIndex?: number): void;
  createClipboardPayload(shapeIds: string[]): ClipboardPayload;
  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] };
  updateTextContent(textId: string, text: string): void;
}

/** Svg seam for {@link EditPathNodesCommand} — path `d` only. */
export interface PathDataEditorSvgPort {
  updatePathData(pathId: string, d: string): void;
}

/** Svg seam for {@link SetPathNodeHandleLinkCommand} — `data-editor-path-node-handle-link` on `<path>`. */
export interface PathNodeHandleLinkSvgPort {
  getPathNodeHandleLinkRaw(pathId: string): string | null;
  setPathNodeHandleLinkRaw(pathId: string, value: string | null): void;
}
