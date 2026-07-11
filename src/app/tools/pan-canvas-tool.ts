import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface PanCanvasToolDeps {
  beginPanSession: (event: MouseEvent) => void;
  isPanning: () => boolean;
  applyPanDragFromEvent: (event: MouseEvent) => void;
  clearPanningFlag: () => void;
}

export function createPanCanvasTool(getDeps: () => PanCanvasToolDeps): CanvasTool {
  return {
    toolId: 'pan',
    onActivate: () => {},
    onDeactivate: () => {
      getDeps().clearPanningFlag();
    },
    onPointerDown(event) {
      if (event.button !== 0) return false;
      getDeps().beginPanSession(event);
      return true;
    },
    onPointerMove(event) {
      if (!getDeps().isPanning()) return false;
      getDeps().applyPanDragFromEvent(event);
      return true;
    },
    onPointerUp() {
      if (!getDeps().isPanning()) return false;
      getDeps().clearPanningFlag();
      return true;
    },
    onClick() {
      return true;
    },
    getCursorHint(ctx) {
      return ctx.isPanning
        ? 'Expected cursor: grabbing (.canvas-container.pan-dragging)'
        : 'Expected cursor: grab (.canvas-container.pan-mode)';
    }
  };
}

export function registerPanCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => PanCanvasToolDeps
): void {
  registry.register(createPanCanvasTool(getDeps));
}
