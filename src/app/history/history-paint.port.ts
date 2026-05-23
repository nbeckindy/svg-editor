/** Narrow seam for paint History commands (fill / stroke color / opacity). */
export interface HistoryPaintPort {
  updateFillColor(shapeId: string, color: string): void;
  updateStrokeColor(shapeId: string, color: string): void;
  updateOpacity(shapeId: string, opacity: number): void;
}
