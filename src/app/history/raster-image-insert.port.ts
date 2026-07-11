import type { EditorCommand } from '../models/editor-command';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { EditorTool } from '../services/editor-tool.service';
import type { InsertRasterImageAttrs } from '../services/svg-shape-content.port';
import type { SelectionSyncPort } from './history-selection.port';
import type { EditorShapeLifecycleSvgPort } from './editor-shape-lifecycle-svg.port';

/** History seam for toolbar / canvas raster insert. */
export interface RasterImageInsertHistoryPort {
  pushAndExecute(command: EditorCommand): void;
}

/** Selection seam for post-insert select on {@link AddImageCommand}. */
export type RasterImageInsertSelectionPort = SelectionSyncPort & {
  selectShape(shape: ShapeProperties): void;
};

/** Chrome seam: switch to selector after a successful raster insert. */
export interface RasterImageInsertToolPort {
  setTool(tool: EditorTool): void;
}

/**
 * Svg seam for raster file insert layout and {@link AddImageCommand} — reuses
 * {@link EditorShapeLifecycleSvgPort} lifecycle reads plus raster-specific writes.
 */
export type RasterImageInsertSvgPort = Pick<
  EditorShapeLifecycleSvgPort,
  'getSVGInstance' | 'getShapeProperties'
> & {
  getDocumentViewBox(): string;
  insertRasterImageIntoContentGroup(attrs: InsertRasterImageAttrs): string | null;
};
