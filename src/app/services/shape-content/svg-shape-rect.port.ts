export interface SvgShapeRectPort {
  updateRectCornerRadius(shapeId: string, radius: number): void;
  restoreRectCornerRadii(shapeId: string, rx: number, ry: number): void;
}
