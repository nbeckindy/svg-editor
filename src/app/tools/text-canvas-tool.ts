import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface TextCanvasToolDeps {
  isCanvasReady: () => boolean;
  /** True while the floating inline text editor is open (skip place-on-editor clicks). */
  isInlineTextEditActive: () => boolean;
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
      // Click controller commits outside-editor clicks before dispatch. If edit is still
      // active, the click landed on the editor — do not place another `<text>`.
      if (getDeps().isInlineTextEditActive()) return true;
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
