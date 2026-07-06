/**
 * Keyboard orchestration for the **Canvas adapter** — Escape / gesture cancel stack,
 * pen shortcuts, clipboard, zoom, and selector edits. Lives outside the Angular
 * component so agents can find session policy in one **Module**; the component
 * remains DOM wiring and builds a {@link SvgCanvasKeyboardContext} each keydown.
 *
 * {@link CanvasEditorCommandController} owns the command implementations for
 * clipboard, align/distribute, group/ungroup, clip-path, and delete so that
 * the canvas adapter contains no command logic.
 */
import type { ChangeDetectorRef } from '@angular/core';
import type { CanvasAdapterToolState } from '../../tools/canvas-adapter-context';
import type { EditorTool } from '../../services/editor-tool.service';
import type { SvgManipulationService } from '../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { EditorHistoryService } from '../../services/editor-history.service';
import type { ClipboardService } from '../../services/clipboard.service';
import type { PenToolSession } from './pen-tool-session/pen-tool-session';
import type { GestureRuntimeContext } from './gestures/gesture-context';
import type { DragGesture } from './gestures/drag-gesture';
import type { ResizeGesture } from './gestures/resize-gesture';
import type { SkewGesture } from './gestures/skew-gesture';
import type { RotateGesture } from './gestures/rotate-gesture';
import type { SelectionMarqueeGesture } from './gestures/selection-marquee-gesture';
import type { ZoomMarqueeGesture } from './gestures/zoom-marquee-gesture';
import type { ToolRegistryService } from '../../tools/tool-registry.service';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import type { Element as SVGElement } from '@svgdotjs/svg.js';
import {
  AlignCommand,
  DistributeCommand,
  RemoveShapesCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand,
  MakeClipPathCommand,
  ReleaseClipPathCommand,
  PasteCommand,
  DuplicateCommand,
} from '../../models/editor-commands';
import { buildEditorToolShortcutMap } from '../../tools/tool-bundles';
import { tryHandleViewKeyDown, type ViewKeyboardActionsPort } from './view-canvas-tool-keyboard';

// ---------------------------------------------------------------------------
// Command controller — clipboard, align/distribute, group/ungroup, clip-path
// ---------------------------------------------------------------------------

/** Narrow deps required by {@link CanvasEditorCommandController}. */
export interface CanvasEditorCommandDeps {
  readonly svgManipulation: SvgManipulationService;
  readonly shapeSelection: ShapeSelectionService;
  readonly editorHistory: EditorHistoryService;
  readonly clipboard: ClipboardService;
  setDrilledIntoGroupId(id: string | null): void;
}

const ALIGN_LEFT_KEY = 'ArrowLeft';
const ALIGN_RIGHT_KEY = 'ArrowRight';
const ALIGN_TOP_KEY = 'ArrowUp';
const ALIGN_CENTER_KEY = 'ArrowDown';
const ALIGN_MIDDLE_KEY = 'm';
const ALIGN_BOTTOM_KEY = 'b';
const DISTRIBUTE_HORIZONTAL_KEY = 'h';
const DISTRIBUTE_VERTICAL_KEY = 'v';

/**
 * Implements editor command dispatch (clipboard, align/distribute,
 * group/ungroup, clip-path make/release, delete, select-all) using only
 * narrow service deps. Instantiated once by the canvas adapter; the adapter
 * delegates keyboard shortcuts and context-menu actions here.
 */
export class CanvasEditorCommandController {
  private duplicateInvocationCount = 0;
  private duplicateSelectionKey = '';

  constructor(private readonly deps: CanvasEditorCommandDeps) {}

  /**
   * Call from the selection-changed effect; resets the stacking duplicate
   * offset when the selection changes.
   */
  resetDuplicateCounterIfSelectionChanged(shapes: { id: string }[]): void {
    const key = shapes.map((s) => s.id).sort().join('|');
    if (key !== this.duplicateSelectionKey) {
      this.duplicateSelectionKey = key;
      this.duplicateInvocationCount = 0;
    }
  }

  private getExpandedSelectedShapeIds(): string[] {
    const { svgManipulation, shapeSelection } = this.deps;
    const selected = shapeSelection.getSelectedShapes();
    if (selected.length === 0) return [];
    const expanded = svgManipulation.expandSelectionByClipGroups(selected);
    const ids = expanded.map((shape) => shape.id);
    return svgManipulation.getShapeIdsInDomOrder(ids);
  }

  private selectionTouchesLocked(ids: string[]): boolean {
    return ids.some((id) => this.deps.svgManipulation.isElementOrAncestorLocked(id));
  }

  private resolveTopmostShapeId(ids: string[]): string | null {
    const idSet = new Set(ids);
    let topmost: string | null = null;
    for (const item of this.deps.svgManipulation.getLayerStackItems()) {
      if (idSet.has(item.id)) topmost = item.id;
    }
    return topmost;
  }

  private alignSelectionInner(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): boolean {
    const { svgManipulation, editorHistory } = this.deps;
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 2) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    editorHistory.pushAndExecute(new AlignCommand(svgManipulation, ids, direction));
    svgManipulation.clearHighlight();
    return true;
  }

  private distributeSelectionInner(direction: 'horizontal' | 'vertical'): boolean {
    const { svgManipulation, editorHistory } = this.deps;
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 3) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    editorHistory.pushAndExecute(new DistributeCommand(svgManipulation, ids, direction));
    svgManipulation.clearHighlight();
    return true;
  }

  selectAllShapesFromDocument(): void {
    const { svgManipulation, shapeSelection } = this.deps;
    const svg = svgManipulation.getSVGInstance();
    if (!svg) return;
    const items = svgManipulation.getLayerStackItems();
    if (items.length === 0) return;
    const shapes: ShapeProperties[] = [];
    for (const item of items) {
      const el = svg.findOne(`#${item.id}`) as SVGElement | undefined;
      if (el) shapes.push(svgManipulation.getShapeProperties(el));
    }
    if (shapes.length === 0) return;
    const expanded = svgManipulation.expandSelectionByClipGroups(shapes);
    shapeSelection.selectShapes(expanded);
    svgManipulation.clearHighlight();
  }

  copySelectionToClipboard(): boolean {
    const { svgManipulation, clipboard } = this.deps;
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    clipboard.set(payload);
    return true;
  }

  cutSelectionToClipboard(): boolean {
    const { svgManipulation, editorHistory, clipboard, shapeSelection } = this.deps;
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    clipboard.set(payload);
    const cmd = new RemoveShapesCommand(svgManipulation, ids, shapeSelection);
    editorHistory.pushAndExecute(cmd);
    svgManipulation.clearHighlight();
    return true;
  }

  pasteFromClipboard(): boolean {
    const { svgManipulation, editorHistory, clipboard, shapeSelection } = this.deps;
    const payload = clipboard.get();
    if (!payload || payload.shapes.length === 0) return false;
    const cmd = new PasteCommand(svgManipulation, payload, clipboard.nextPasteOffset(), shapeSelection);
    editorHistory.pushAndExecute(cmd);
    svgManipulation.clearHighlight();
    return true;
  }

  duplicateSelection(): boolean {
    const { svgManipulation, editorHistory, shapeSelection } = this.deps;
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    this.duplicateInvocationCount += 1;
    const delta = this.duplicateInvocationCount * 10;
    const cmd = new DuplicateCommand(svgManipulation, ids, { dx: delta, dy: delta }, shapeSelection);
    editorHistory.pushAndExecute(cmd);
    svgManipulation.clearHighlight();
    return true;
  }

  handleAlignmentShortcut(key: string): boolean {
    const normalized = key.length === 1 ? key.toLowerCase() : key;
    switch (normalized) {
      case ALIGN_LEFT_KEY: return this.alignSelectionInner('left');
      case ALIGN_RIGHT_KEY: return this.alignSelectionInner('right');
      case ALIGN_TOP_KEY: return this.alignSelectionInner('top');
      case ALIGN_CENTER_KEY: return this.alignSelectionInner('center');
      case ALIGN_MIDDLE_KEY: return this.alignSelectionInner('middle');
      case ALIGN_BOTTOM_KEY: return this.alignSelectionInner('bottom');
      case DISTRIBUTE_HORIZONTAL_KEY: return this.distributeSelectionInner('horizontal');
      case DISTRIBUTE_VERTICAL_KEY: return this.distributeSelectionInner('vertical');
      default: return false;
    }
  }

  groupSelectedShapes(): void {
    const { svgManipulation, editorHistory, shapeSelection, setDrilledIntoGroupId } = this.deps;
    const selected = shapeSelection.getSelectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    if (this.selectionTouchesLocked(ids)) return;
    const cmd = new GroupCommand(svgManipulation, ids);
    editorHistory.pushAndExecute(cmd);
    const newGroupId = cmd.createdGroupId;
    if (newGroupId) {
      const svg = svgManipulation.getSVGInstance();
      const groupEl = svg?.findOne(`#${newGroupId}`) as SVGElement | undefined;
      if (groupEl) {
        shapeSelection.selectShapes([svgManipulation.getShapeProperties(groupEl)]);
      }
    }
    setDrilledIntoGroupId(null);
  }

  ungroupSelectedShape(): void {
    const { svgManipulation, editorHistory, shapeSelection, setDrilledIntoGroupId } = this.deps;
    const selected = shapeSelection.getSelectedShapes();
    const groupIds = selected.filter((s) => s.type === 'g').map((s) => s.id);
    if (groupIds.length === 0) return;
    if (groupIds.some((id) => svgManipulation.isElementOrAncestorLocked(id))) return;

    const svg = svgManipulation.getSVGInstance();
    if (!svg) return;

    const collectChildShapes = (childIds: string[]): void => {
      const childShapes: ShapeProperties[] = [];
      for (const id of childIds) {
        const el = svg.findOne(`#${id}`) as SVGElement | undefined;
        if (el) childShapes.push(svgManipulation.getShapeProperties(el));
      }
      if (childShapes.length > 0) shapeSelection.selectShapes(childShapes);
    };

    if (groupIds.length === 1) {
      const groupId = groupIds[0];
      const groupNode = svg.findOne(`#${groupId}`)?.node as Element | null;
      if (!groupNode || groupNode.tagName?.toLowerCase() !== 'g') return;
      const childIds: string[] = [];
      for (const child of Array.from(groupNode.children)) {
        if (child.id) childIds.push(child.id);
      }
      const cmd = new UngroupCommand(svgManipulation, groupId);
      editorHistory.pushAndExecute(cmd);
      collectChildShapes(childIds);
    } else {
      const cmd = new UngroupElementsCommand(svgManipulation, groupIds);
      editorHistory.pushAndExecute(cmd);
      collectChildShapes(cmd.ungroupedChildIds);
    }
    setDrilledIntoGroupId(null);
  }

  makeClipPathFromSelection(): void {
    const { svgManipulation, editorHistory, shapeSelection, setDrilledIntoGroupId } = this.deps;
    const selected = shapeSelection.getSelectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    if (this.selectionTouchesLocked(ids)) return;
    const clipShapeId = this.resolveTopmostShapeId(ids);
    if (!clipShapeId) return;
    const contentIds = ids.filter((id) => id !== clipShapeId);
    const cmd = new MakeClipPathCommand(svgManipulation, contentIds, clipShapeId);
    editorHistory.pushAndExecute(cmd);
    const svg = svgManipulation.getSVGInstance();
    const clipGeomId = cmd.createdClipGeometryId;
    if (clipGeomId && svg) {
      const geomEl = svg.findOne(`#${clipGeomId}`) as SVGElement | undefined;
      if (geomEl) shapeSelection.selectShapes([svgManipulation.getShapeProperties(geomEl)]);
    }
    setDrilledIntoGroupId(null);
  }

  releaseClipPathFromSelection(): void {
    const { svgManipulation, editorHistory, shapeSelection, setDrilledIntoGroupId } = this.deps;
    const selected = shapeSelection.getSelectedShapes();
    if (selected.length === 0) return;
    const ids = selected.map((s) => s.id);
    if (this.selectionTouchesLocked(ids)) return;
    const cmd = new ReleaseClipPathCommand(svgManipulation, ids);
    editorHistory.pushAndExecute(cmd);
    const svg = svgManipulation.getSVGInstance();
    const releasedShapes: ShapeProperties[] = [];
    for (const id of cmd.releasedChildIds) {
      const el = svg?.findOne(`#${id}`) as SVGElement | undefined;
      if (el) releasedShapes.push(svgManipulation.getShapeProperties(el));
    }
    if (cmd.restoredClipShapeId) {
      const clipEl = svg?.findOne(`#${cmd.restoredClipShapeId}`) as SVGElement | undefined;
      if (clipEl) releasedShapes.push(svgManipulation.getShapeProperties(clipEl));
    }
    if (releasedShapes.length > 0) shapeSelection.selectShapes(releasedShapes);
    setDrilledIntoGroupId(null);
  }

  deleteSelectedShapes(): void {
    const { svgManipulation, editorHistory, shapeSelection } = this.deps;
    const ids = shapeSelection.getSelectedShapes().map((s) => s.id);
    if (ids.length === 0) return;
    if (ids.some((id) => svgManipulation.isElementOrAncestorLocked(id))) return;
    const cmd = new RemoveShapesCommand(svgManipulation, ids, shapeSelection);
    editorHistory.pushAndExecute(cmd);
    svgManipulation.clearHighlight();
  }
}

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

  if (ctx.getPathNodeEditState() && (event.key === 'Delete' || event.key === 'Backspace')) {
    if (ctx.tryDeleteSelectedPathNode()) {
      event.preventDefault();
      return;
    }
  }

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
