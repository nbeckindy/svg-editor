/**
 * Builds {@link SvgCanvasKeyboardContext} and selector keyboard actions for the
 * canvas adapter — mirrors pointer-intent context wiring: the component supplies
 * a narrow host; assembly lives here so agents find the seam in one module.
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
import type { ViewKeyboardActionsPort } from './view-canvas-tool-keyboard';
import type { SelectorKeyboardActionsPort } from './selector-canvas-tool-keyboard';
import type { SvgCanvasKeyboardContext } from './svg-canvas-keyboard.controller';
import type {
  CanvasDocumentActionsHost,
  CanvasDocumentActionsService
} from './canvas-document-actions.service';

/** Narrow surface the canvas adapter exposes for keyboard context assembly. */
export interface SvgCanvasKeyboardHost {
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

  getSvgContent(): string | null | undefined;
  getCurrentTool(): EditorTool;
  setTool(tool: EditorTool): void;
  markForCheck(): void;

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

export function buildSvgCanvasKeyboardContext(host: SvgCanvasKeyboardHost): SvgCanvasKeyboardContext {
  return {
    gestureRuntime: host.gestureRuntime,
    svgManipulation: host.svgManipulation,
    shapeSelection: host.shapeSelection,
    editorHistory: host.editorHistory,
    cdr: host.cdr,
    drag: host.drag,
    resize: host.resize,
    skew: host.skew,
    rotate: host.rotate,
    selectionMarquee: host.selectionMarquee,
    zoomMarquee: host.zoomMarquee,
    penTool: host.penTool,
    toolRegistry: host.toolRegistry,
    getSvgContent: () => host.getSvgContent(),
    getCurrentTool: () => host.getCurrentTool(),
    commitInlineTextEditIfActive: () => host.commitInlineTextEditIfActive(),
    shouldIgnoreKeyboardShortcuts: (e) => host.shouldIgnoreKeyboardShortcuts(e),
    isDraggingShape: () => host.isDraggingShape(),
    isResizingSelection: () => host.isResizingSelection(),
    isSkewingSelection: () => host.isSkewingSelection(),
    isRotatingSelection: () => host.isRotatingSelection(),
    isSelectionMarquee: () => host.isSelectionMarquee(),
    isZoomMarquee: () => host.isZoomMarquee(),
    isPenSessionActive: () => host.isPenSessionActive(),
    cancelActiveMarquees: () => host.cancelActiveMarquees(),
    exitPathNodeEditMode: () => host.exitPathNodeEditMode(),
    clearSelectionAndHighlight: () => host.clearSelectionAndHighlight(),
    setDrilledIntoGroupId: (id) => host.setDrilledIntoGroupId(id),
    setTool: (tool) => host.setTool(tool),
    markForCheck: () => host.markForCheck(),
    getViewKeyboardActions: () => host.getViewKeyboardActions(),
    getPathNodeEditState: () => host.getPathNodeEditState(),
    tryDeleteSelectedPathNode: () => host.tryDeleteSelectedPathNode()
  };
}

export function buildSelectorKeyboardActions(
  host: Pick<
    SvgCanvasKeyboardHost,
    'getSvgContent' | 'svgManipulation' | 'shapeSelection' | 'editorHistory'
  >,
  documentActions: CanvasDocumentActionsService,
  documentActionsHost: CanvasDocumentActionsHost
): SelectorKeyboardActionsPort {
  return {
    getSvgContent: () => host.getSvgContent(),
    svgManipulation: host.svgManipulation,
    shapeSelection: host.shapeSelection,
    editorHistory: host.editorHistory,
    selectAllShapesFromDocument: () => documentActions.selectAllShapesFromDocument(),
    copySelectionToClipboard: () => documentActions.copySelectionToClipboard(),
    cutSelectionToClipboard: () => documentActions.cutSelectionToClipboard(),
    pasteFromClipboard: () => documentActions.pasteFromClipboard(),
    duplicateSelection: () => documentActions.duplicateSelection(),
    groupSelectedShapes: () => documentActions.groupSelectedShapes(documentActionsHost),
    ungroupSelectedShape: () => documentActions.ungroupSelectedShape(documentActionsHost),
    handleAlignmentShortcut: (key: string) => documentActions.handleAlignmentShortcut(key)
  };
}
