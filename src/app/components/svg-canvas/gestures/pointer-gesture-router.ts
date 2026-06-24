import type {
  CanvasAdapterCoordinates,
  CanvasAdapterToolState,
  CanvasSvgPoint
} from '../../../tools/canvas-adapter-context';
import type { ToolRegistryService } from '../../../tools/tool-registry.service';

/**
 * Narrow surface the canvas exposes for pointer-orchestration (document + canvas
 * routing). Keeps {@link PointerGestureRouter} independent of the full component graph.
 */
export interface SvgCanvasPointerGestureHost
  extends Pick<CanvasAdapterToolState, 'getCurrentTool'>, CanvasAdapterCoordinates {
  getPathNodeDragSession(): unknown | null;
  updatePathNodeDrag(clientX: number, clientY: number): void;
  finishPathNodeDrag(): void;
}

export class PointerGestureRouter {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  private svgPointFromEvent(
    host: SvgCanvasPointerGestureHost,
    event: MouseEvent
  ): CanvasSvgPoint | null {
    return host.clientToEditorSvgPoint(event.clientX, event.clientY);
  }

  private dispatchRegisteredPointerDown(host: SvgCanvasPointerGestureHost, event: MouseEvent): boolean {
    const tool = this.toolRegistry.get(host.getCurrentTool());
    if (!tool?.onPointerDown) return false;
    const svgPoint = this.svgPointFromEvent(host, event) ?? { x: 0, y: 0 };
    return tool.onPointerDown(event, svgPoint);
  }

  private dispatchRegisteredPointerMove(host: SvgCanvasPointerGestureHost, event: MouseEvent): boolean {
    const tool = this.toolRegistry.get(host.getCurrentTool());
    if (!tool?.onPointerMove) return false;
    const svgPoint = this.svgPointFromEvent(host, event) ?? { x: 0, y: 0 };
    const consumed = tool.onPointerMove(event, svgPoint);
    return consumed !== false;
  }

  private dispatchRegisteredPointerUp(host: SvgCanvasPointerGestureHost, event: MouseEvent): boolean {
    const tool = this.toolRegistry.get(host.getCurrentTool());
    if (!tool?.onPointerUp) return false;
    const svgPoint = this.svgPointFromEvent(host, event) ?? { x: 0, y: 0 };
    const consumed = tool.onPointerUp(event, svgPoint);
    return consumed !== false;
  }

  onDocumentMouseMove(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (host.getPathNodeDragSession()) {
      host.updatePathNodeDrag(event.clientX, event.clientY);
      return;
    }
    this.dispatchRegisteredPointerMove(host, event);
  }

  onDocumentMouseUp(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (event.button !== 0) return;
    if (host.getPathNodeDragSession()) {
      host.finishPathNodeDrag();
      return;
    }
    this.dispatchRegisteredPointerUp(host, event);
  }

  /**
   * Primary-button canvas mousedown after right-button pen handling; `event.button === 0`.
   */
  onCanvasMouseDownPrimary(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (this.dispatchRegisteredPointerDown(host, event)) {
      event.preventDefault();
    }
  }
}
