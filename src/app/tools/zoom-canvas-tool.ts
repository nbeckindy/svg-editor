import type { ZoomMarqueeGesture } from '../components/svg-canvas/gestures/zoom-marquee-gesture';
import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface ZoomCanvasToolDeps {
  getZoomMarquee: () => ZoomMarqueeGesture;
  isZoomMarquee: () => boolean;
  commitZoomMarquee: () => void;
  isCanvasReady: () => boolean;
  consumeZoomMarqueeJustEnded: () => boolean;
  screenToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
  zoomInAt: (x: number, y: number) => void;
  zoomOutAt: (x: number, y: number) => void;
  refreshViewAfterZoomClick: () => void;
}

export function createZoomCanvasTool(getDeps: () => ZoomCanvasToolDeps): CanvasTool {
  return {
    toolId: 'zoom',
    onActivate: () => {},
    onDeactivate: () => {},
    onPointerDown(event) {
      getDeps().getZoomMarquee().startAt(event.clientX, event.clientY);
      return true;
    },
    onPointerMove(event) {
      const deps = getDeps();
      if (!deps.isZoomMarquee()) return false;
      deps.getZoomMarquee().move(event.clientX, event.clientY);
      return true;
    },
    onPointerUp() {
      const deps = getDeps();
      if (!deps.isZoomMarquee()) return false;
      deps.commitZoomMarquee();
      return true;
    },
    onClick(event) {
      const deps = getDeps();
      if (deps.consumeZoomMarqueeJustEnded()) return true;
      if (!deps.isCanvasReady()) return false;
      const point = deps.screenToSvg(event.clientX, event.clientY);
      if (!point) return false;
      if (event.altKey) {
        deps.zoomOutAt(point.x, point.y);
      } else {
        deps.zoomInAt(point.x, point.y);
      }
      deps.refreshViewAfterZoomClick();
      return true;
    },
    getCursorHint(ctx) {
      return ctx.altKeyPressed
        ? 'Expected cursor: zoom-out (.canvas-container.zoom-mode-out)'
        : 'Expected cursor: zoom-in (.canvas-container.zoom-mode)';
    }
  };
}

export function registerZoomCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => ZoomCanvasToolDeps
): void {
  registry.register(createZoomCanvasTool(getDeps));
}
