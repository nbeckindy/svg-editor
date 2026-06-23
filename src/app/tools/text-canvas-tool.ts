import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface TextCanvasToolDeps {
  isCanvasReady: () => boolean;
  updateTextToolPreviewFromClient: (clientX: number, clientY: number) => void;
  createTextAtPoint: (clientX: number, clientY: number) => void;
  destroyTextToolPreview: () => void;
}

export function createTextCanvasTool(getDeps: () => TextCanvasToolDeps): CanvasTool {
  return {
    toolId: 'text',
    onActivate: () => {},
    onDeactivate: () => {
      getDeps().destroyTextToolPreview();
    },
    onPointerMove(event) {
      getDeps().updateTextToolPreviewFromClient(event.clientX, event.clientY);
      return true;
    },
    onClick(event) {
      if (!getDeps().isCanvasReady()) return false;
      getDeps().createTextAtPoint(event.clientX, event.clientY);
      return true;
    }
  };
}

export function registerTextCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => TextCanvasToolDeps
): void {
  registry.register(createTextCanvasTool(getDeps));
}
