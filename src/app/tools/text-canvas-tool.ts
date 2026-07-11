import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface TextCanvasToolDeps {
  isCanvasReady: () => boolean;
  updateTextToolPreviewFromClient: (clientX: number, clientY: number) => void;
  createTextAtPoint: (clientX: number, clientY: number) => string | undefined;
  destroyTextToolPreview: () => void;
  tryEnterTextEditAfterCreate: (newId: string) => void;
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
      const newId = getDeps().createTextAtPoint(event.clientX, event.clientY);
      if (newId) getDeps().tryEnterTextEditAfterCreate(newId);
      return true;
    },
    getCursorHint() {
      return 'Expected cursor: text (.canvas-container.text-mode)';
    }
  };
}

export function registerTextCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => TextCanvasToolDeps
): void {
  registry.register(createTextCanvasTool(getDeps));
}
