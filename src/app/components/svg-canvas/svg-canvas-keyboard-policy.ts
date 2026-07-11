/**
 * Canvas-wide keyboard policy after registry `onKeyDown` — Escape gesture cancel
 * stack, undo/redo, and view shortcuts. Extracted from the keyboard controller so
 * agents can find session policy without reading the full dispatch pipeline.
 */
import type { EditorHistoryService } from '../../services/editor-history.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { GestureRuntimeContext } from './gestures/gesture-context';
import type { DragGesture } from './gestures/drag-gesture';
import type { ResizeGesture } from './gestures/resize-gesture';
import type { SkewGesture } from './gestures/skew-gesture';
import type { RotateGesture } from './gestures/rotate-gesture';
import { tryHandleViewKeyDown, type ViewKeyboardActionsPort } from './view-canvas-tool-keyboard';

export interface CanvasWideKeyboardPolicyContext {
  readonly gestureRuntime: GestureRuntimeContext;
  readonly shapeSelection: ShapeSelectionService;
  readonly editorHistory: EditorHistoryService;
  readonly drag: DragGesture;
  readonly resize: ResizeGesture;
  readonly skew: SkewGesture;
  readonly rotate: RotateGesture;
  isDraggingShape: () => boolean;
  isResizingSelection: () => boolean;
  isSkewingSelection: () => boolean;
  isRotatingSelection: () => boolean;
  isSelectionMarquee: () => boolean;
  isZoomMarquee: () => boolean;
  cancelActiveMarquees: () => void;
  exitPathNodeEditMode: () => boolean;
  clearSelectionAndHighlight: () => void;
  setDrilledIntoGroupId: (id: string | null) => void;
  getViewKeyboardActions: () => ViewKeyboardActionsPort;
}

/** Escape stack when the active tool did not consume Escape. */
export function tryHandleCanvasWideEscape(
  ctx: CanvasWideKeyboardPolicyContext,
  event: KeyboardEvent
): boolean {
  if (event.key !== 'Escape') return false;

  if (ctx.isDraggingShape()) {
    ctx.drag.cancel(ctx.gestureRuntime);
    return true;
  }
  if (ctx.isResizingSelection()) {
    ctx.resize.cancel(ctx.gestureRuntime);
    return true;
  }
  if (ctx.isSkewingSelection()) {
    ctx.skew.cancel(ctx.gestureRuntime);
    return true;
  }
  if (ctx.isRotatingSelection()) {
    ctx.rotate.cancel(ctx.gestureRuntime);
    return true;
  }
  if (ctx.isSelectionMarquee() || ctx.isZoomMarquee()) {
    ctx.cancelActiveMarquees();
    return true;
  }
  if (ctx.exitPathNodeEditMode()) {
    return true;
  }
  if (ctx.shapeSelection.getSelectedShapes().length > 0) {
    ctx.clearSelectionAndHighlight();
    ctx.setDrilledIntoGroupId(null);
    return true;
  }
  return false;
}

export interface HistoryUndoRedoContext {
  readonly editorHistory: EditorHistoryService;
  getSvgContent: () => string | null | undefined;
}

/** Ctrl/Cmd+Z undo and redo shortcuts when document content exists. */
export function tryHandleHistoryUndoRedo(ctx: HistoryUndoRedoContext, event: KeyboardEvent): boolean {
  if (!ctx.getSvgContent()) return false;
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return false;

  if ((event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
    ctx.editorHistory.undo();
    return true;
  }
  if (((event.key === 'z' || event.key === 'Z') && event.shiftKey) || event.key === 'y' || event.key === 'Y') {
    ctx.editorHistory.redo();
    return true;
  }
  return false;
}

export function tryHandleViewKeyboardShortcuts(
  ctx: { getViewKeyboardActions: () => ViewKeyboardActionsPort },
  event: KeyboardEvent
): boolean {
  return tryHandleViewKeyDown(ctx.getViewKeyboardActions(), event);
}
