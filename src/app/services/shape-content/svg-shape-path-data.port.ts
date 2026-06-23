export interface SvgShapePathDataPort {
  updatePathData(pathId: string, d: string): void;
  getPathNodeHandleLinkRaw(pathId: string): string | null;
  setPathNodeHandleLinkRaw(pathId: string, value: string | null): void;
  insertPathIntoContentGroup(
    d: string,
    attrs?: { fill?: string; stroke?: string; strokeWidth?: number },
    options?: { closedPath?: boolean }
  ): string | null;
}
