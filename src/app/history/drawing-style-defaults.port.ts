import type { DrawingStyleDefaults } from '../models/drawing-style-defaults';

/** Narrow seam for undoable writes to tool / creation drawing defaults (see `UpdateDrawingDefaultsCommand`). */
export interface DrawingStyleDefaultsWritePort {
  setDefaults(next: DrawingStyleDefaults): void;
}
