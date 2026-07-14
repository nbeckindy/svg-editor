import type {
  CanvasCursorHintContext,
  ComputeExpectedCursorHintDeps,
  GestureCursorHintState
} from '../../tools/canvas-cursor-hint';

/** Narrow canvas surface needed to build {@link ComputeExpectedCursorHintDeps}. */
export interface CanvasCursorHintDepsHost {
  getCurrentTool(): string;
  getCanvasViewportElement(): HTMLElement | undefined;
  getPathNodeDragSession(): unknown;
  readonly creationIsActive: boolean;
  readonly isDraggingShape: boolean;
  readonly isResizingSelection: boolean;
  readonly isSkewingSelection: boolean;
  readonly isRotatingSelection: boolean;
  readonly isPanning: boolean;
  isPenInsertOnPathDragActive(): boolean;
  hasPathNodeEditState(): boolean;
  getToolCursorHint(ctx: CanvasCursorHintContext): string | null | undefined;
  penInsertCopyCursorWouldApply(clientX: number, clientY: number): boolean;
  readonly altKeyPressed: boolean;
  isCreationToolActive(): boolean;
}

export function buildComputeExpectedCursorHintDepsFromCanvas(
  host: CanvasCursorHintDepsHost
): ComputeExpectedCursorHintDeps {
  return {
    getCurrentTool: () => host.getCurrentTool(),
    getViewportInlineCursor: () => host.getCanvasViewportElement()?.style?.cursor?.trim(),
    getGestureState: (): GestureCursorHintState => ({
      pathNodeDragActive: !!host.getPathNodeDragSession(),
      creationActive: host.creationIsActive,
      isDraggingShape: host.isDraggingShape,
      isResizingSelection: host.isResizingSelection,
      isSkewingSelection: host.isSkewingSelection,
      isRotatingSelection: host.isRotatingSelection,
      isPanning: host.isPanning,
      currentTool: host.getCurrentTool(),
      isPenInsertOnPathDragActive: host.isPenInsertOnPathDragActive()
    }),
    hasPathNodeEditState: () => host.hasPathNodeEditState(),
    getToolCursorHint: (ctx) => host.getToolCursorHint(ctx),
    penInsertCopyCursorWouldApply: (x, y) => host.penInsertCopyCursorWouldApply(x, y),
    altKeyPressed: host.altKeyPressed,
    isPanning: host.isPanning,
    isCreationToolActive: () => host.isCreationToolActive()
  };
}
