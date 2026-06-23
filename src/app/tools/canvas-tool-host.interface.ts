import type { EditorHistoryService } from '../services/editor-history.service';
import type { EditorTool } from '../services/editor-tool.service';
import type { ShapeSelectionService } from '../services/shape-selection.service';
import type { SvgManipulationService } from '../services/svg-manipulation.service';

/** Document-space point on the editor SVG canvas. */
export type CanvasSvgPoint = { readonly x: number; readonly y: number };

/**
 * Narrow surface the canvas exposes to registered canvas tools.
 * Keeps tool implementations independent of the full {@link SvgCanvasComponent} graph.
 */
export interface CanvasToolHost {
  markForCheck(): void;
  getCurrentTool(): EditorTool;
  setTool(tool: EditorTool): void;
  clientToEditorSvgPoint(clientX: number, clientY: number): CanvasSvgPoint | null;
  getMainSvgElement(): SVGSVGElement | null;
  isEditorContentShapeTarget(target: Element | null): boolean;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
}
