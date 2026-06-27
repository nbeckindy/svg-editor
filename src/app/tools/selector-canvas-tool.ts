import type { DragGesture } from '../components/svg-canvas/gestures/drag-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import type { ResizeGesture } from '../components/svg-canvas/gestures/resize-gesture';
import type { RotateGesture } from '../components/svg-canvas/gestures/rotate-gesture';
import type { SelectionMarqueeGesture } from '../components/svg-canvas/gestures/selection-marquee-gesture';
import type { SkewGesture } from '../components/svg-canvas/gestures/skew-gesture';
import type { ResizeHandle } from '../utils/selection-resize';
import type { SkewEdge } from '../utils/selection-skew';
import type { CanvasTool } from './canvas-tool.interface';
import type { ToolRegistryService } from './tool-registry.service';
import {
  SELECTOR_INTERACTION_TOOL_IDS,
  type SelectorInteractionToolId
} from './tool-bundles';
import {
  handleSelectorCanvasClick,
  type SelectorCanvasClickDeps
} from '../components/svg-canvas/selector-canvas-click';
import {
  tryHandleSelectorKeyDown,
  type SelectorKeyboardActionsPort
} from '../components/svg-canvas/selector-canvas-tool-keyboard';

export type { SelectorInteractionToolId };

export interface SelectorCanvasToolGestures {
  selectionMarquee: SelectionMarqueeGesture;
  resize: ResizeGesture;
  skew: SkewGesture;
  rotate: RotateGesture;
  drag: DragGesture;
}

export interface SelectorCanvasToolDeps extends SelectorCanvasClickDeps {
  getGestures: () => SelectorCanvasToolGestures;
  getRuntime: () => GestureRuntimeContext;
  isCanvasReady: () => boolean;
  hasPathNodeEditState: () => boolean;
  tryStartPathNodeDrag: (target: Element, event: MouseEvent) => boolean;
  isEditorContentShapeTarget: (target: Element) => boolean;
  clientToEditorSvgPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  isShapeSelected: (id: string) => boolean;
  getSelectedShapeIds: () => string[];
  isSelectionMarquee: () => boolean;
  isResizingSelection: () => boolean;
  isSkewingSelection: () => boolean;
  isRotatingSelection: () => boolean;
  isDraggingShape: () => boolean;
  getKeyboardActions: () => SelectorKeyboardActionsPort;
}

function isResizeHandle(value: string | null): value is ResizeHandle {
  return (
    value === 'nw' ||
    value === 'ne' ||
    value === 'sw' ||
    value === 'se' ||
    value === 'n' ||
    value === 's' ||
    value === 'e' ||
    value === 'w'
  );
}

function isSkewEdge(value: string | null): value is SkewEdge {
  return value === 'n' || value === 's' || value === 'e' || value === 'w';
}

export function createSelectorCanvasTool(
  toolId: SelectorInteractionToolId,
  getDeps: () => SelectorCanvasToolDeps
): CanvasTool {
  return {
    toolId,
    onActivate: () => {},
    onDeactivate: () => {},
    onPointerDown(event) {
      const deps = getDeps();
      if (!deps.isCanvasReady()) return false;
      const target = event.target as Element;
      const gestures = deps.getGestures();
      const runtime = deps.getRuntime();

      if (deps.hasPathNodeEditState() && deps.tryStartPathNodeDrag(target, event)) {
        event.stopPropagation();
        return true;
      }

      const resizeEl = target.closest?.('[data-resize-handle]');
      if (resizeEl) {
        const handle = resizeEl.getAttribute('data-resize-handle');
        if (isResizeHandle(handle)) {
          if (gestures.resize.start(runtime, handle, event)) {
            event.stopPropagation();
            return true;
          }
          return false;
        }
      }

      const skewEl = target.closest?.('[data-skew-handle]');
      if (skewEl) {
        const edge = skewEl.getAttribute('data-skew-handle');
        if (isSkewEdge(edge)) {
          if (gestures.skew.start(runtime, edge, event)) {
            event.stopPropagation();
            return true;
          }
          return false;
        }
      }

      const rotateEl = target.closest?.('[data-rotate-handle]');
      if (rotateEl) {
        if (gestures.rotate.start(runtime, event)) {
          event.stopPropagation();
          return true;
        }
        return false;
      }

      if (!deps.isEditorContentShapeTarget(target)) {
        gestures.selectionMarquee.startAt(event.clientX, event.clientY);
        return true;
      }

      if (target.tagName === 'svg' || !target.id) return false;
      let effectiveDragId = target.id;
      if (!deps.isShapeSelected(target.id)) {
        const nearestGroupId = deps.getNearestGroupAncestorId(target.id);
        if (nearestGroupId && deps.isShapeSelected(nearestGroupId)) {
          effectiveDragId = nearestGroupId;
        } else {
          return false;
        }
      }
      if (event.shiftKey || event.ctrlKey || event.metaKey) return false;
      const point = deps.clientToEditorSvgPoint(event.clientX, event.clientY);
      if (!point) return false;
      const selectedIds = deps.getSelectedShapeIds();
      return gestures.drag.start(runtime, selectedIds, effectiveDragId, point, event);
    },
    onPointerMove(event) {
      const deps = getDeps();
      const gestures = deps.getGestures();
      const runtime = deps.getRuntime();
      if (deps.isSelectionMarquee()) {
        gestures.selectionMarquee.move(event.clientX, event.clientY, runtime);
        return true;
      }
      if (deps.isResizingSelection()) {
        gestures.resize.move(runtime, event.clientX, event.clientY, event.altKey, event.shiftKey);
        return true;
      }
      if (deps.isSkewingSelection()) {
        gestures.skew.move(runtime, event.clientX, event.clientY);
        return true;
      }
      if (deps.isRotatingSelection()) {
        gestures.rotate.move(runtime, event.clientX, event.clientY, event.shiftKey);
        return true;
      }
      if (deps.isDraggingShape()) {
        gestures.drag.move(runtime, event.clientX, event.clientY, event.shiftKey);
        return true;
      }
      return false;
    },
    onPointerUp(event) {
      const deps = getDeps();
      const gestures = deps.getGestures();
      const runtime = deps.getRuntime();
      if (deps.isSelectionMarquee()) {
        gestures.selectionMarquee.endAt(event.clientX, event.clientY, event.shiftKey, runtime);
        return true;
      }
      if (deps.isResizingSelection()) {
        gestures.resize.end(runtime, event.altKey);
        return true;
      }
      if (deps.isSkewingSelection()) {
        gestures.skew.end(runtime);
        return true;
      }
      if (deps.isRotatingSelection()) {
        gestures.rotate.end(runtime);
        return true;
      }
      if (deps.isDraggingShape()) {
        gestures.drag.end(runtime, event.clientX, event.clientY, event.shiftKey);
        return true;
      }
      return false;
    },
    onClick(event) {
      const deps = getDeps();
      if (!deps.isCanvasReady()) return false;
      return handleSelectorCanvasClick(event, deps);
    },
    onKeyDown(event) {
      return tryHandleSelectorKeyDown(getDeps().getKeyboardActions(), event);
    }
  };
}

export function registerSelectorCanvasTools(
  registry: ToolRegistryService,
  getDeps: () => SelectorCanvasToolDeps
): void {
  for (const toolId of SELECTOR_INTERACTION_TOOL_IDS) {
    registry.register(createSelectorCanvasTool(toolId, getDeps));
  }
}
