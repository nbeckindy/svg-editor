import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditorCommand } from '../../../models/editor-command';
import type { ShapeProperties } from '../../../models/shape-properties.interface';

/** SVG read/write seam for {@link InlineTextEditSession}. */
export interface InlineTextEditSessionSvgPort {
  getSVGInstance(): Svg | null;
  getShapeBBox(
    shapeId: string,
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null;
  getTextContent(textId: string): string | null;
  updateTextContent(textId: string, text: string): void;
  getShapeProperties(shape: SvgJsElement): ShapeProperties;
}

/** Selection seam for {@link InlineTextEditSession}. */
export interface InlineTextEditSessionShapeSelectionPort {
  getSelectedShapes(): ShapeProperties[];
}

/** History seam for {@link InlineTextEditSession}. */
export interface InlineTextEditSessionHistoryPort {
  pushAndExecute(command: EditorCommand): void;
}

/**
 * Narrow seam for {@link InlineTextEditSession}: DOM/view mapping, text read/write, history,
 * selection guards, and overlay focus — implemented by the **Canvas adapter**.
 */
export interface InlineTextEditSessionPorts {
  markForCheck(): void;
  svgManipulation: InlineTextEditSessionSvgPort;
  editorHistory: InlineTextEditSessionHistoryPort;
  shapeSelection: InlineTextEditSessionShapeSelectionPort;
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Focus and select the floating inline text `<textarea>` after it mounts. */
  focusInlineTextEditor(): void;
  getInlineTextEditorElement(): HTMLTextAreaElement | null;
}
