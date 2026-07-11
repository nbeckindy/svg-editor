import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface EyedropperCanvasToolDeps {
  isCanvasReady: () => boolean;
  sampleAt: (event: MouseEvent) => void;
  setTool: (tool: 'selector') => void;
  markForCheck: () => void;
}

export function createEyedropperCanvasTool(getDeps: () => EyedropperCanvasToolDeps): CanvasTool {
  return {
    toolId: 'eyedropper',
    onActivate: () => {},
    onDeactivate: () => {},
    onClick(event) {
      if (!getDeps().isCanvasReady()) return false;
      getDeps().sampleAt(event);
      return true;
    },
    onKeyDown(event) {
      if (event.key === 'Escape') {
        const deps = getDeps();
        deps.setTool('selector');
        deps.markForCheck();
        return true;
      }
      return false;
    },
    getCursorHint() {
      return 'Expected cursor: crosshair (.canvas-container.eyedropper-mode .svg-canvas)';
    }
  };
}

export function registerEyedropperCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => EyedropperCanvasToolDeps
): void {
  registry.register(createEyedropperCanvasTool(getDeps));
}
