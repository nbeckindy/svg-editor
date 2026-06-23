/**
 * Keyboard orchestration for the **Canvas adapter** — Escape / gesture cancel stack,
 * pen shortcuts, clipboard, zoom, and selector edits. Lives outside the Angular
 * component so agents can find session policy in one **Module**; the component
 * remains DOM wiring and builds a {@link SvgCanvasKeyboardContext} each keydown.
 */
import type { ChangeDetectorRef } from '@angular/core';
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
import { RemoveShapesCommand, buildReorderToExtremeCommand } from '../../models/editor-commands';

export interface SvgCanvasKeyboardContext {
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

  getCurrentTool(): EditorTool;
  isSelectorActive(): boolean;

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

  setTool(tool: EditorTool): void;
  markForCheck(): void;

  selectAllShapesFromDocument(): void;
  copySelectionToClipboard(): boolean;
  cutSelectionToClipboard(): boolean;
  pasteFromClipboard(): boolean;
  duplicateSelection(): boolean;
  groupSelectedShapes(): void;
  ungroupSelectedShape(): void;

  zoomInAtViewportCenter(): void;
  zoomOutAtViewportCenter(): void;
  resetZoomAndRefreshOverlay(): void;
  fitArtboardToViewport(): void;
  fitContentToViewport(): void;
  updateViewBoxOverlayRect(): void;

  getPathNodeEditState(): unknown;
  tryDeleteSelectedPathNode(): boolean;

  handleAlignmentShortcut(key: string): boolean;
}

function tryEditorToolShortcut(
  event: KeyboardEvent,
  editorTool: { getCurrentTool(): EditorTool; setTool(tool: EditorTool): void },
  cdr: ChangeDetectorRef
): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  if (event.key.length !== 1) return false;
  const key = event.key.toLowerCase();
  const toolByKey: Record<string, EditorTool | 'reserved'> = {
    v: 'selector',
    a: 'node-edit-selector',
    p: 'pen',
    b: 'reserved',
    r: 'rect',
    o: 'ellipse',
    l: 'line',
    t: 'text',
    h: 'pan',
    z: 'zoom',
    i: 'eyedropper'
  };
  const dest = toolByKey[key];
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

  const selectorActive = ctx.isSelectorActive();

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
    if (ctx.getCurrentTool() === 'eyedropper') {
      editorTool.setTool('selector');
      event.preventDefault();
      ctx.markForCheck();
      return;
    }
    if (ctx.getCurrentTool() === 'pen' && ctx.penTool.isPenInsertOnPathDragActive) {
      ctx.penTool.cancelPenInsertOnPathDrag();
      event.preventDefault();
      ctx.markForCheck();
      return;
    }
    if (ctx.getCurrentTool() === 'pen' && ctx.isPenSessionActive()) {
      ctx.penTool.clearDrawingState();
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

  if (event.key === 'Enter') {
    if (ctx.getCurrentTool() === 'pen' && ctx.isPenSessionActive()) {
      ctx.penTool.tryFinishPenPath(false);
      event.preventDefault();
      return;
    }
  }

  if (event.key === 'Backspace' && ctx.penTool.tryPenBackspaceShortcut()) {
    event.preventDefault();
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

  if (selectorActive && mod && (event.key === 'a' || event.key === 'A')) {
    ctx.selectAllShapesFromDocument();
    event.preventDefault();
    return;
  }

  if (selectorActive && mod && (event.key === 'c' || event.key === 'C')) {
    ctx.copySelectionToClipboard();
    event.preventDefault();
    return;
  }

  if (selectorActive && mod && (event.key === 'x' || event.key === 'X')) {
    if (ctx.cutSelectionToClipboard()) {
      event.preventDefault();
    }
    return;
  }

  if (selectorActive && mod && (event.key === 'v' || event.key === 'V')) {
    if (ctx.pasteFromClipboard()) {
      event.preventDefault();
    }
    return;
  }

  if (selectorActive && mod && (event.key === 'd' || event.key === 'D')) {
    if (ctx.duplicateSelection()) {
      event.preventDefault();
    }
    return;
  }

  if (selectorActive && mod && event.shiftKey && ctx.handleAlignmentShortcut(event.key)) {
    event.preventDefault();
    return;
  }

  if (selectorActive && mod && (event.key === 'g' || event.key === 'G') && !event.shiftKey) {
    ctx.groupSelectedShapes();
    event.preventDefault();
    return;
  }

  if (selectorActive && mod && (event.key === 'g' || event.key === 'G') && event.shiftKey) {
    ctx.ungroupSelectedShape();
    event.preventDefault();
    return;
  }

  if (selectorActive && !mod && (event.key === ']' || event.key === '[')) {
    const direction = event.key === ']' ? 'front' : 'back';
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    const cmd = buildReorderToExtremeCommand(ctx.svgManipulation, ids, direction);
    if (cmd) {
      ctx.editorHistory.pushAndExecute(cmd);
      event.preventDefault();
    }
    return;
  }

  if (mod && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) {
    ctx.zoomInAtViewportCenter();
    event.preventDefault();
    return;
  }

  if (mod && (event.key === '-' || event.code === 'NumpadSubtract')) {
    ctx.zoomOutAtViewportCenter();
    event.preventDefault();
    return;
  }

  if (mod && event.key === '0') {
    ctx.resetZoomAndRefreshOverlay();
    event.preventDefault();
    return;
  }

  if (mod && event.key === '1') {
    ctx.fitArtboardToViewport();
    event.preventDefault();
    return;
  }

  if (mod && event.key === '2') {
    ctx.fitContentToViewport();
    event.preventDefault();
    return;
  }

  if (ctx.getPathNodeEditState() && (event.key === 'Delete' || event.key === 'Backspace')) {
    if (ctx.tryDeleteSelectedPathNode()) {
      event.preventDefault();
    }
    return;
  }

  if (
    selectorActive &&
    (event.key === 'Delete' || event.key === 'Backspace') &&
    ctx.shapeSelection.getSelectedShapes().length > 0
  ) {
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (ids.some((id) => ctx.svgManipulation.isElementOrAncestorLocked(id))) {
      return;
    }
    const cmd = new RemoveShapesCommand(ctx.svgManipulation, ids, ctx.shapeSelection);
    ctx.editorHistory.pushAndExecute(cmd);
    ctx.svgManipulation.clearHighlight();
    event.preventDefault();
  }
}
