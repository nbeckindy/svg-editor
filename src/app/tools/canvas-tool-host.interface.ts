import type { EditorHistoryService } from '../services/editor-history.service';
import type { ShapeSelectionService } from '../services/shape-selection.service';
import type { SvgManipulationService } from '../services/svg-manipulation.service';
import type { CanvasAdapterContext } from './canvas-adapter-context';

export type { CanvasAdapterContext, CanvasSvgPoint } from './canvas-adapter-context';

/**
 * Narrow surface the canvas exposes to registered canvas tools.
 * Keeps tool implementations independent of the full {@link SvgCanvasComponent} graph.
 */
export interface CanvasToolHost extends CanvasAdapterContext {
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
}
