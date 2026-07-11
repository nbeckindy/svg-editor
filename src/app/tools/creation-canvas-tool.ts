import type { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';
import {
  CREATION_TOOL_IDS,
  type CreationCanvasToolId
} from './tool-bundles';

export type { CreationCanvasToolId };

export function createCreationCanvasTool(
  toolId: CreationCanvasToolId,
  creation: CreationGesture,
  getRuntime: () => GestureRuntimeContext,
  isCanvasReady: () => boolean
): CanvasTool {
  return {
    toolId,
    onActivate: () => {},
    onDeactivate: () => creation.abort(),
    onPointerDown(event) {
      if (!isCanvasReady()) return false;
      return creation.start(getRuntime(), toolId, event);
    },
    onPointerMove(event) {
      creation.move(getRuntime(), event.clientX, event.clientY, event.shiftKey);
    },
    onPointerUp(event) {
      creation.end(getRuntime(), event.clientX, event.clientY, event.shiftKey);
    },
    onClick() {
      return true;
    },
    getCursorHint() {
      return 'Expected cursor: crosshair (.canvas-container.creation-mode)';
    }
  };
}

export function registerCreationCanvasTools(
  registry: ToolRegistryService,
  creation: CreationGesture,
  getRuntime: () => GestureRuntimeContext,
  isCanvasReady: () => boolean
): void {
  for (const toolId of CREATION_TOOL_IDS) {
    registry.register(createCreationCanvasTool(toolId, creation, getRuntime, isCanvasReady));
  }
}
