import { InjectionToken } from '@angular/core';
import type {
  RasterImageInsertHistoryPort,
  RasterImageInsertSelectionPort,
  RasterImageInsertSvgPort,
  RasterImageInsertToolPort
} from '../history/raster-image-insert.port';

/** Svg seam for raster insert layout and {@link AddImageCommand}. */
export const RASTER_IMAGE_INSERT_SVG_PORT = new InjectionToken<RasterImageInsertSvgPort>(
  'RASTER_IMAGE_INSERT_SVG_PORT'
);

/** History seam for raster insert undo steps. */
export const RASTER_IMAGE_INSERT_HISTORY_PORT = new InjectionToken<RasterImageInsertHistoryPort>(
  'RASTER_IMAGE_INSERT_HISTORY_PORT'
);

/** Selection seam for post-insert select. */
export const RASTER_IMAGE_INSERT_SELECTION_PORT = new InjectionToken<RasterImageInsertSelectionPort>(
  'RASTER_IMAGE_INSERT_SELECTION_PORT'
);

/** Tool seam: activate selector after insert. */
export const RASTER_IMAGE_INSERT_TOOL_PORT = new InjectionToken<RasterImageInsertToolPort>(
  'RASTER_IMAGE_INSERT_TOOL_PORT'
);
