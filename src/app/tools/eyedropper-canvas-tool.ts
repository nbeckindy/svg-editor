import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface EyedropperCanvasToolDeps {
  isCanvasReady: () => boolean;
  sampleAt: (event: MouseEvent) => void;
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
    }
  };
}

export function registerEyedropperCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => EyedropperCanvasToolDeps
): void {
  registry.register(createEyedropperCanvasTool(getDeps));
}
