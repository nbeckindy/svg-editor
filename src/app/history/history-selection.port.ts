import type { ShapeProperties } from '../models/shape-properties.interface';

/** Selection side effects for History commands without depending on the full selection service. */
export interface SelectionSyncPort {
  clearSelection(): void;
  selectShapes(shapes: ShapeProperties[]): void;
}
