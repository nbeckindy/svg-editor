/**
 * Keyboard orchestration for the **Canvas adapter** — Escape / gesture cancel stack,
 * pen shortcuts, clipboard, zoom, and selector edits. Lives outside the Angular
 * component so agents can find session policy in one **Module**; the component
 * remains DOM wiring and builds a {@link SvgCanvasKeyboardContext} each keydown.
 */
import type { ChangeDetectorRef } from '@angular/core';
import type { CanvasAdapterToolState } from '../../tools/canvas-adapter-context';
import type { EditorTool } from '../../services/editor-tool.service';
import type { SvgManipulationService } from '../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { EditorHistoryService } from '../../services/editor-history.service';
import type { PenToolSession } from './pen-tool-session/pen-tool-session';
import type { GestureRuntimeContext } from './gestures/gesture-context';
import type { DragGesture } from './gestures/drag-gesture';
import type { ResizeGesture } from './gestures/resize-gesture';
import type { SkewGesture } from './gestures/skew-gesture';
import type { RotateGesture } from './gestures/rotate-gesture';
import type { SelectionMarqueeGesture } from './gestures/selection-marquee-gesture';
import type { ZoomMarqueeGesture } from './gestures/zoom-marquee-gesture';
import type { ToolRegistryService } from '../../tools/tool-registry.service';
import { buildEditorToolShortcutMap } from '../../tools/tool-bundles';
import { tryHandleViewKeyDown, type ViewKeyboardActionsPort } from './view-canvas-tool-keyboard';

export interface SvgCanvasKeyboardContext extends Pick<CanvasAdapterToolState, 'markForCheck' | 'getCurrentTool' | 'setTool'> {
  readonly gestureRuntime: GestureRuntimeContext;
  readonly svgManipulation: SvgManipulationService;
  readonly shapeSelection: ShapeSelectionService;
  readonly editorHistory: EditorHistoryService;
  readonly cdr: ChangeDetectorRef;
  readonly drag: DragGesture;
  readonly resize: ResizeGesture;
  readonly skew: SkewGesture;
  readonly rotate: RotateGesture;
  readonly selectionMarquee: SelectionMarqueeGesture;
  readonly zoomMarquee: ZoomMarqueeGesture;
  readonly penTool: PenToolSession;
  readonly toolRegistry: ToolRegistryService;

  /** Current `svgContent` input string (empty means many shortcuts no-op). */
  getSvgContent(): string | null | undefined;

  commitInlineTextEditIfActive(): boolean;
  shouldIgnoreKeyboardShortcuts(event: KeyboardEvent): boolean;

  isDraggingShape(): boolean;
  isResizingSelection(): boolean;
  isSkewingSelection(): boolean;
  isRotatingSelection(): boolean;
  isSelectionMarquee(): boolean;
  isZoomMarquee(): boolean;
  isPenSessionActive(): boolean;

  cancelActiveMarquees(): void;
  exitPathNodeEditMode(): boolean;
  clearSelectionAndHighlight(): void;
  setDrilledIntoGroupId(id: string | null): void;

  getPathNodeEditState(): unknown;
  tryDeleteSelectedPathNode(): boolean;

  getViewKeyboardActions(): ViewKeyboardActionsPort;
}

function tryEditorToolShortcut(
  event: KeyboardEvent,
  editorTool: { getCurrentTool(): EditorTool; setTool(tool: EditorTool): void },
  cdr: ChangeDetectorRef
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.length !== 1) return false;
  const key = event.key.toLowerCase();
  const dest = buildEditorToolShortcutMap()[key];
  if (!dest) return false;
  event.preventDefault();
  if (dest === 'reserved') {
    return true;
  }
  editorTool.setTool(dest);
  cdr.detectChanges();
  return true;
}

function dispatchRegisteredKeyDown(
  ctx: SvgCanvasKeyboardContext,
  event: KeyboardEvent
): boolean {
  const tool = ctx.toolRegistry.get(ctx.getCurrentTool());
  return tool?.onKeyDown?.(event) ?? false;
}

/**
 * Handles `document:keydown` policy for the **Editor runtime** on the **Canvas**.
 * Mutates `event` (preventDefault) when a binding consumes the key.
 */
export function handleSvgCanvasKeyDown(ctx: SvgCanvasKeyboardContext, event: KeyboardEvent, editorTool: { getCurrentTool(): EditorTool; setTool(tool: EditorTool): void }): void {
  if (event.key === 'Escape' && ctx.commitInlineTextEditIfActive()) {
    event.preventDefault();
    return;
  }
  if (ctx.shouldIgnoreKeyboardShortcuts(event)) return;

  if (dispatchRegisteredKeyDown(ctx, event)) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    if (ctx.isDraggingShape()) {
      ctx.drag.cancel(ctx.gestureRuntime);
      event.preventDefault();
      return;
    }
    if (ctx.isResizingSelection()) {
      ctx.resize.cancel(ctx.gestureRuntime);
      event.preventDefault();
      return;
    }
    if (ctx.isSkewingSelection()) {
      ctx.skew.cancel(ctx.gestureRuntime);
      event.preventDefault();
      return;
    }
    if (ctx.isRotatingSelection()) {
      ctx.rotate.cancel(ctx.gestureRuntime);
      event.preventDefault();
      return;
    }
    if (ctx.isSelectionMarquee() || ctx.isZoomMarquee()) {
      ctx.cancelActiveMarquees();
      event.preventDefault();
      return;
    }
    if (ctx.exitPathNodeEditMode()) {
      event.preventDefault();
      return;
    }
    if (ctx.shapeSelection.getSelectedShapes().length > 0) {
      ctx.clearSelectionAndHighlight();
      ctx.setDrilledIntoGroupId(null);
      event.preventDefault();
    }
    return;
  }

  if (tryEditorToolShortcut(event, editorTool, ctx.cdr)) {
    return;
  }

  if (!ctx.getSvgContent()) return;

  const mod = event.ctrlKey || event.metaKey;

  if (mod && (event.key === 'z' || event.key === 'Z') && !event.shiftKey) {
    ctx.editorHistory.undo();
    event.preventDefault();
    return;
  }
  if (mod && (((event.key === 'z' || event.key === 'Z') && event.shiftKey) || event.key === 'y' || event.key === 'Y')) {
    ctx.editorHistory.redo();
    event.preventDefault();
    return;
  }

  if (tryHandleViewKeyDown(ctx.getViewKeyboardActions(), event)) {
    event.preventDefault();
    return;
  }
}
