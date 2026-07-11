import type { PenToolSession } from '../components/svg-canvas/pen-tool-session/pen-tool-session';
import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';

export interface PenCanvasToolDeps {
  getPenTool: () => PenToolSession;
  getSnappedPenPoint: (
    clientX: number,
    clientY: number,
    shiftKey: boolean
  ) => { x: number; y: number } | null;
  hasPathNodeEditState: () => boolean;
  tryStartPathNodeDrag: (target: Element, event: MouseEvent) => boolean;
  isCanvasReady: () => boolean;
  scheduleInsertHoverCursorHitTest: (clientX: number, clientY: number) => void;
  markForCheck: () => void;
}

export function createPenCanvasTool(getDeps: () => PenCanvasToolDeps): CanvasTool {
  return {
    toolId: 'pen',
    onActivate: () => {},
    onDeactivate: () => {
      getDeps().getPenTool().clearDrawingState();
    },
    onPointerDown(event) {
      const deps = getDeps();
      if (event.button === 2) {
        deps.getPenTool().onPenRightMouseDown();
        return true;
      }
      if (!deps.isCanvasReady()) return false;
      const penTool = deps.getPenTool();
      const target = event.target as Element;
      const penIdle = !penTool.isPenSessionActive && !penTool.isPenInsertOnPathDragActive;
      const openPathPickup = penIdle && penTool.wouldPickUpPenOpenPathContinuationAt(event);
      if (!openPathPickup && deps.hasPathNodeEditState() && deps.tryStartPathNodeDrag(target, event)) {
        return true;
      }
      return penTool.onCanvasPenPrimaryMouseDown(event, deps.getSnappedPenPoint);
    },
    onPointerMove(event) {
      const penTool = getDeps().getPenTool();
      if (penTool.isPenSessionActive || penTool.isPenInsertOnPathDragActive) {
        penTool.onDocumentMouseMovePen(event, getDeps().getSnappedPenPoint);
        return true;
      }
      getDeps().scheduleInsertHoverCursorHitTest(event.clientX, event.clientY);
      return false;
    },
    onPointerUp(event) {
      const penTool = getDeps().getPenTool();
      if (!penTool.isPenSessionActive && !penTool.isPenInsertOnPathDragActive) {
        return false;
      }
      penTool.onDocumentMouseUpPen(event);
      return true;
    },
    onClick() {
      return true;
    },
    onDoubleClick() {
      return true;
    },
    onKeyDown(event) {
      const deps = getDeps();
      const penTool = deps.getPenTool();
      if (event.key === 'Escape') {
        if (penTool.isPenInsertOnPathDragActive) {
          penTool.cancelPenInsertOnPathDrag();
          deps.markForCheck();
          return true;
        }
        if (penTool.isPenSessionActive) {
          penTool.clearDrawingState();
          return true;
        }
      }
      if (event.key === 'Backspace' && penTool.tryPenBackspaceShortcut()) {
        return true;
      }
      if (event.key === 'Enter' && penTool.isPenSessionActive) {
        penTool.tryFinishPenPath(false);
        return true;
      }
      return false;
    },
    getCursorHint(ctx) {
      if (ctx.overCanvas && ctx.hitTarget?.closest?.('[data-pen-outgoing-handle]')) {
        return 'Expected cursor: grab (pen outgoing handle; .pen-outgoing-handle)';
      }
      if (ctx.penInsertCopyCursorWouldApply) {
        return 'Expected cursor: copy (pen idle valid insert hit; #canvasViewport inline — may apply next rAF)';
      }
      return 'Expected cursor: crosshair (.canvas-container.pen-mode; user SVG uses cursor:inherit)';
    }
  };
}

export function registerPenCanvasTool(
  registry: ToolRegistryService,
  getDeps: () => PenCanvasToolDeps
): void {
  registry.register(createPenCanvasTool(getDeps));
}
