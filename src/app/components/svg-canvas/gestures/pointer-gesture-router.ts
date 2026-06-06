import { ChangeDetectorRef } from '@angular/core';
import type { EditorTool } from '../../../services/editor-tool.service';
import type { ResizeHandle } from '../../../utils/selection-resize';
import type { SkewEdge } from '../../../utils/selection-skew';
import type { GestureRuntimeContext } from './gesture-context';
import type { CreationGesture } from './creation-gesture';
import type { SelectionMarqueeGesture } from './selection-marquee-gesture';
import type { ZoomMarqueeGesture } from './zoom-marquee-gesture';
import type { ResizeGesture } from './resize-gesture';
import type { SkewGesture } from './skew-gesture';
import type { RotateGesture } from './rotate-gesture';
import type { DragGesture } from './drag-gesture';

/**
 * Narrow surface the canvas exposes for pointer-orchestration (document + canvas
 * routing). Keeps {@link PointerGestureRouter} independent of the full component graph.
 */
export interface SvgCanvasPointerGestureHost {
  readonly gestureRuntime: GestureRuntimeContext;

  // --- document:mousemove ---
  readonly isCreatingShape: boolean;
  getPathNodeDragSession(): unknown | null;
  updatePathNodeDrag(clientX: number, clientY: number): void;
  /**
   * True when the pen session has at least a moveto (`[M]`). Includes first-segment handle-draft
   * state where committed segments are still `M`-only — document `mousemove`/`mouseup` must keep routing.
   */
  isPenToolWithActiveSession(): boolean;
  /** True while pen insert-on-path mousedown→mouseup is in progress (no committed pen session). */
  isPenInsertOnPathDragActive(): boolean;
  onPenDocumentMouseMove(event: MouseEvent): void;
  readonly isSelectionMarquee: boolean;
  readonly isZoomMarquee: boolean;
  readonly isResizingSelection: boolean;
  readonly isSkewingSelection: boolean;
  readonly isRotatingSelection: boolean;
  readonly isPanning: boolean;
  applyPanDragFromEvent(event: MouseEvent): void;
  readonly isDraggingShape: boolean;
  updateTextToolPreviewFromClient(clientX: number, clientY: number): void;
  recordInsertAnchorFromClient(clientX: number, clientY: number): void;
  /** Throttled idle pen: valid insert hit cursor on canvas host. */
  schedulePenInsertHoverCursorHitTest(clientX: number, clientY: number): void;

  // --- document:mouseup ---
  finishPathNodeDrag(): void;
  onPenDocumentMouseUp(event: MouseEvent): void;
  commitZoomMarquee(): void;
  clearPanningFlag(): void;

  // --- canvas:mousedown (primary button path) ---
  readonly svgContentValue: string | null | undefined;
  readonly canvasViewInitialized: boolean;
  beginPanSession(event: MouseEvent): void;
  onCanvasPenPrimaryMouseDown(event: MouseEvent): boolean;
  isCreationToolActive(): boolean;
  getCurrentTool(): EditorTool;
  isSelectorInteractionTool(tool: EditorTool): boolean;
  hasPathNodeEditState(): boolean;
  tryStartPathNodeDrag(target: Element, event: MouseEvent): boolean;
  isEditorContentShapeTarget(target: Element): boolean;
  clientToEditorSvgPointForDrag(clientX: number, clientY: number): { x: number; y: number } | null;
  isShapeSelected(id: string): boolean;
  getNearestGroupAncestorId(id: string): string | null;
  getSelectedShapeIds(): string[];
}

type GesturePack = {
  creation: CreationGesture;
  selectionMarquee: SelectionMarqueeGesture;
  zoomMarquee: ZoomMarqueeGesture;
  resize: ResizeGesture;
  skew: SkewGesture;
  rotate: RotateGesture;
  drag: DragGesture;
};

export class PointerGestureRouter {
  constructor(
    private readonly g: GesturePack,
    private readonly cdr: ChangeDetectorRef
  ) {}

  onDocumentMouseMove(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (host.isCreatingShape) {
      this.g.creation.move(host.gestureRuntime, event.clientX, event.clientY, event.shiftKey);
      return;
    }
    if (host.getPathNodeDragSession()) {
      host.updatePathNodeDrag(event.clientX, event.clientY);
      return;
    }
    if (host.getCurrentTool() === 'pen' && (host.isPenToolWithActiveSession() || host.isPenInsertOnPathDragActive())) {
      host.onPenDocumentMouseMove(event);
      return;
    }
    if (host.getCurrentTool() === 'pen') {
      host.schedulePenInsertHoverCursorHitTest(event.clientX, event.clientY);
    }
    if (host.isSelectionMarquee) {
      this.g.selectionMarquee.move(event.clientX, event.clientY, host.gestureRuntime);
      return;
    }
    if (host.isZoomMarquee) {
      this.g.zoomMarquee.move(event.clientX, event.clientY);
      this.cdr.detectChanges();
      return;
    }
    if (host.isResizingSelection) {
      this.g.resize.move(host.gestureRuntime, event.clientX, event.clientY, event.altKey, event.shiftKey);
      return;
    }
    if (host.isSkewingSelection) {
      this.g.skew.move(host.gestureRuntime, event.clientX, event.clientY);
      return;
    }
    if (host.isRotatingSelection) {
      this.g.rotate.move(host.gestureRuntime, event.clientX, event.clientY, event.shiftKey);
      return;
    }
    if (host.isPanning) {
      host.applyPanDragFromEvent(event);
    } else if (host.isDraggingShape) {
      this.g.drag.move(host.gestureRuntime, event.clientX, event.clientY, event.shiftKey);
    }
    host.updateTextToolPreviewFromClient(event.clientX, event.clientY);
    host.recordInsertAnchorFromClient(event.clientX, event.clientY);
  }

  onDocumentMouseUp(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (event.button !== 0) return;
    if (host.getPathNodeDragSession()) {
      host.finishPathNodeDrag();
      return;
    }
    if (host.isPenToolWithActiveSession() || host.isPenInsertOnPathDragActive()) {
      host.onPenDocumentMouseUp(event);
      return;
    }
    if (host.isCreatingShape) {
      this.g.creation.end(host.gestureRuntime, event.clientX, event.clientY, event.shiftKey);
      return;
    }
    if (host.isSelectionMarquee) {
      this.g.selectionMarquee.endAt(event.clientX, event.clientY, event.shiftKey, host.gestureRuntime);
      return;
    }
    if (host.isZoomMarquee) {
      host.commitZoomMarquee();
      return;
    }
    host.clearPanningFlag();
    if (host.isResizingSelection) {
      this.g.resize.end(host.gestureRuntime, event.altKey);
      return;
    }
    if (host.isSkewingSelection) {
      this.g.skew.end(host.gestureRuntime);
      return;
    }
    if (host.isRotatingSelection) {
      this.g.rotate.end(host.gestureRuntime);
      return;
    }
    if (host.isDraggingShape) {
      this.g.drag.end(host.gestureRuntime, event.clientX, event.clientY, event.shiftKey);
    }
  }

  /**
   * Primary-button canvas mousedown after right-button pen handling; `event.button === 0`.
   */
  onCanvasMouseDownPrimary(host: SvgCanvasPointerGestureHost, event: MouseEvent): void {
    if (host.getCurrentTool() === 'zoom') {
      this.g.zoomMarquee.startAt(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }
    if (host.getCurrentTool() === 'pan') {
      host.beginPanSession(event);
      event.preventDefault();
      return;
    }
    if (host.getCurrentTool() === 'pen') {
      const target = event.target as Element;
      if (host.hasPathNodeEditState() && host.tryStartPathNodeDrag(target, event)) {
        event.preventDefault();
        return;
      }
      if (host.onCanvasPenPrimaryMouseDown(event)) {
        event.preventDefault();
      }
      return;
    }
    if (host.isCreationToolActive()) {
      if (!host.svgContentValue || !host.canvasViewInitialized) return;
      if (this.g.creation.start(host.gestureRuntime, host.getCurrentTool(), event)) {
        event.preventDefault();
      }
      return;
    }
    if (!host.isSelectorInteractionTool(host.getCurrentTool()) || !host.svgContentValue || !host.canvasViewInitialized) {
      return;
    }
    const target = event.target as Element;

    if (host.hasPathNodeEditState() && host.tryStartPathNodeDrag(target, event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const resizeEl = target.closest?.('[data-resize-handle]');
    if (resizeEl) {
      const h = resizeEl.getAttribute('data-resize-handle') as ResizeHandle | null;
      if (
        h &&
        (h === 'nw' ||
          h === 'ne' ||
          h === 'sw' ||
          h === 'se' ||
          h === 'n' ||
          h === 's' ||
          h === 'e' ||
          h === 'w')
      ) {
        if (this.g.resize.start(host.gestureRuntime, h, event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    const skewEl = target.closest?.('[data-skew-handle]');
    if (skewEl) {
      const edge = skewEl.getAttribute('data-skew-handle') as SkewEdge | null;
      if (edge === 'n' || edge === 's' || edge === 'e' || edge === 'w') {
        if (this.g.skew.start(host.gestureRuntime, edge, event)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    }

    const rotateEl = target.closest?.('[data-rotate-handle]');
    if (rotateEl) {
      if (this.g.rotate.start(host.gestureRuntime, event)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (!host.isEditorContentShapeTarget(target)) {
      this.g.selectionMarquee.startAt(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }

    if (target.tagName === 'svg' || !target.id) return;
    let effectiveDragId = target.id;
    if (!host.isShapeSelected(target.id)) {
      const nearestGroupId = host.getNearestGroupAncestorId(target.id);
      if (nearestGroupId && host.isShapeSelected(nearestGroupId)) {
        effectiveDragId = nearestGroupId;
      } else {
        return;
      }
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    const point = host.clientToEditorSvgPointForDrag(event.clientX, event.clientY);
    if (!point) return;
    const selectedIds = host.getSelectedShapeIds();
    if (this.g.drag.start(host.gestureRuntime, selectedIds, effectiveDragId, point, event)) {
      event.preventDefault();
    }
  }
}
