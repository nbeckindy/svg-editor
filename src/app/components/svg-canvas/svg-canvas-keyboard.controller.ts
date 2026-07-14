/**
 * Keyboard orchestration for the **Canvas adapter** — Escape / gesture cancel stack,
 * tool shortcuts, and view/history policy. Lives outside the Angular component so agents
 * can find session policy in one **Module**; the component remains DOM wiring and builds a
 * {@link SvgCanvasKeyboardContext} each keydown via {@link buildSvgCanvasKeyboardContext}.
 *
 * Clipboard / align / group / clip-path mutations go through {@link CanvasDocumentActionsService}.
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
import type { ViewKeyboardActionsPort } from './view-canvas-tool-keyboard';
import {
  tryHandleCanvasWideEscape,
  tryHandleHistoryUndoRedo,
  tryHandleViewKeyboardShortcuts
} from './svg-canvas-keyboard-policy';

// ---------------------------------------------------------------------------
// Keyboard context — passed per-keydown from the canvas adapter
// ---------------------------------------------------------------------------

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
    if (tryHandleCanvasWideEscape(ctx, event)) {
      event.preventDefault();
    }
    return;
  }

  if (tryEditorToolShortcut(event, editorTool, ctx.cdr)) {
    return;
  }

  if (tryHandleHistoryUndoRedo(ctx, event)) {
    event.preventDefault();
    return;
  }

  if (tryHandleViewKeyboardShortcuts(ctx, event)) {
    event.preventDefault();
    return;
  }
}
