import type { Provider } from '@angular/core';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  EDITOR_SHAPE_LIFECYCLE_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from '../services/chrome-apply/chrome-apply.tokens';
import {
  RASTER_IMAGE_INSERT_HISTORY_PORT,
  RASTER_IMAGE_INSERT_SELECTION_PORT,
  RASTER_IMAGE_INSERT_SVG_PORT,
  RASTER_IMAGE_INSERT_TOOL_PORT
} from '../services/raster-image-insert.tokens';
import { EditorHistoryService } from '../services/editor-history.service';
import { EditorToolService } from '../services/editor-tool.service';
import { ShapeSelectionService } from '../services/shape-selection.service';
import { SvgManipulationService } from '../services/svg-manipulation.service';

/** Port tokens backed by root singletons — include in any TestBed that resets global setup. */
export const editorPortTestProviders: Provider[] = [
  { provide: CHROME_EDITOR_APPLY_SVG_PORT, useExisting: SvgManipulationService },
  { provide: PROPERTIES_PANEL_SVG_PORT, useExisting: SvgManipulationService },
  { provide: LAYER_REORDER_GROUP_SVG_PORT, useExisting: SvgManipulationService },
  { provide: SELECTION_TRANSFORM_APPLY_SVG_PORT, useExisting: SvgManipulationService },
  { provide: EDITOR_SHAPE_LIFECYCLE_SVG_PORT, useExisting: SvgManipulationService },
  { provide: RASTER_IMAGE_INSERT_SVG_PORT, useExisting: SvgManipulationService },
  { provide: RASTER_IMAGE_INSERT_HISTORY_PORT, useExisting: EditorHistoryService },
  { provide: RASTER_IMAGE_INSERT_SELECTION_PORT, useExisting: ShapeSelectionService },
  { provide: RASTER_IMAGE_INSERT_TOOL_PORT, useExisting: EditorToolService }
];
