/**
 * Constructs pointer **gesture runtime**, {@link PointerGestureRouter}, and {@link PenToolSession}
 * in one place so the **Canvas adapter** constructor stays wiring-only. Interaction policy stays in
 * {@link ./svg-canvas-keyboard.controller} and gesture classes; this **Module** is assembly only.
 */
import type { ChangeDetectorRef, Signal } from '@angular/core';
import type { ElementRef } from '@angular/core';
import type { SvgManipulationService } from '../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { EditorHistoryService } from '../../services/editor-history.service';
import type { SnapCandidateShape, SnapService } from '../../services/snap.service';
import type { CanvasCoordinateMappingService } from '../../services/canvas-coordinate-mapping.service';
import type { ToolRegistryService } from '../../tools/tool-registry.service';
import type { CanvasBoundToolRegistrar } from '../../tools/canvas-bound-tool-registrar.service';
import type { PenCanvasToolDeps } from '../../tools/pen-canvas-tool';
import type { SelectorCanvasToolDeps } from '../../tools/selector-canvas-tool';
import type { ZoomCanvasToolDeps } from '../../tools/zoom-canvas-tool';
import type { PanCanvasToolDeps } from '../../tools/pan-canvas-tool';
import type { TextCanvasToolDeps } from '../../tools/text-canvas-tool';
import type { EyedropperCanvasToolDeps } from '../../tools/eyedropper-canvas-tool';
import type { GestureRuntimeContext } from './gestures/gesture-context';
import type { Rect } from './gestures/gesture-context';
import { createDefaultTransformGestureDoc } from './gestures/transform-gesture-doc.port';
import {
  DragGesture,
  ResizeGesture,
  RotateGesture,
  SkewGesture,
  CreationGesture,
  SelectionMarqueeGesture,
  ZoomMarqueeGesture,
  PointerGestureRouter
} from './gestures';
import { PenToolSession, type PenToolSessionPorts } from './pen-tool-session/pen-tool-session';

export interface SvgCanvasPointerStack {
  readonly gestureRuntime: GestureRuntimeContext;
  readonly pointerGestureRouter: PointerGestureRouter;
  readonly penTool: PenToolSession;
  readonly drag: DragGesture;
  readonly resize: ResizeGesture;
  readonly rotate: RotateGesture;
  readonly skew: SkewGesture;
  readonly creation: CreationGesture;
  readonly selectionMarquee: SelectionMarqueeGesture;
  readonly zoomMarquee: ZoomMarqueeGesture;
}

export interface CreateSvgCanvasPointerStackArgs {
  // Gesture runtime construction
  cdr: ChangeDetectorRef;
  highlightOverlayContainer: Signal<ElementRef<HTMLElement> | undefined>;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  snap: SnapService;
  coordinateMapping: CanvasCoordinateMappingService;
  invalidateHighlightCache: () => void;
  setLastBbox: (bbox: Rect | null) => void;
  getSmartGuideCandidates: () => SnapCandidateShape[];
  isSnapTemporarilyDisabled: () => boolean;
  /** Rect tool creation defaults (click-place size / corner / orientation). */
  getRectCreationDefaults: () => import('../../services/rect-creation-defaults.service').RectCreationDefaultsSnapshot;
  /** Ellipse tool creation defaults (click-place size / orientation). */
  getEllipseCreationDefaults: () => import('../../services/ellipse-creation-defaults.service').EllipseCreationDefaultsSnapshot;
  // Tool registration
  toolRegistry: ToolRegistryService;
  canvasBoundToolRegistrar: CanvasBoundToolRegistrar;
  isCanvasReady: () => boolean;
  createPenToolSessionPorts: () => PenToolSessionPorts;
  getSnappedPenPoint: PenCanvasToolDeps['getSnappedPenPoint'];
  hasPathNodeEditState: PenCanvasToolDeps['hasPathNodeEditState'];
  tryStartPathNodeDrag: PenCanvasToolDeps['tryStartPathNodeDrag'];
  scheduleInsertHoverCursorHitTest: PenCanvasToolDeps['scheduleInsertHoverCursorHitTest'];
  isEditorContentShapeTarget: SelectorCanvasToolDeps['isEditorContentShapeTarget'];
  isShapeSelected: SelectorCanvasToolDeps['isShapeSelected'];
  getNearestGroupAncestorId: SelectorCanvasToolDeps['getNearestGroupAncestorId'];
  getSelectedShapeIds: SelectorCanvasToolDeps['getSelectedShapeIds'];
  isSelectionMarquee: SelectorCanvasToolDeps['isSelectionMarquee'];
  isResizingSelection: SelectorCanvasToolDeps['isResizingSelection'];
  isSkewingSelection: SelectorCanvasToolDeps['isSkewingSelection'];
  isRotatingSelection: SelectorCanvasToolDeps['isRotatingSelection'];
  isDraggingShape: SelectorCanvasToolDeps['isDraggingShape'];
  getSelectorKeyboardActions: SelectorCanvasToolDeps['getKeyboardActions'];
  getSvgInstance: SelectorCanvasToolDeps['getSvgInstance'];
  enterInlineTextEditMode: SelectorCanvasToolDeps['enterInlineTextEditMode'];
  getDrilledIntoGroupId: SelectorCanvasToolDeps['getDrilledIntoGroupId'];
  setDrilledIntoGroupId: SelectorCanvasToolDeps['setDrilledIntoGroupId'];
  isGroupAClipMaskCarrier: SelectorCanvasToolDeps['isGroupAClipMaskCarrier'];
  getShapeProperties: SelectorCanvasToolDeps['getShapeProperties'];
  getSelectorSelectionForShape: SelectorCanvasToolDeps['getSelectorSelectionForShape'];
  getShapePropertiesInSameClipGroup: SelectorCanvasToolDeps['getShapePropertiesInSameClipGroup'];
  getExpandedDragShapeIds: SelectorCanvasToolDeps['getExpandedDragShapeIds'];
  shouldSkipEmptyHitSelectionClear: SelectorCanvasToolDeps['shouldSkipEmptyHitSelectionClear'];
  toggleShapeGroupInSelection: SelectorCanvasToolDeps['toggleShapeGroupInSelection'];
  selectShapes: SelectorCanvasToolDeps['selectShapes'];
  clearSelection: SelectorCanvasToolDeps['clearSelection'];
  clearHighlight: SelectorCanvasToolDeps['clearHighlight'];
  consumeSelectionMarqueeJustEnded: SelectorCanvasToolDeps['consumeSelectionMarqueeJustEnded'];
  getPathNodeDragSession: SelectorCanvasToolDeps['getPathNodeDragSession'];
  updatePathNodeDrag: SelectorCanvasToolDeps['updatePathNodeDrag'];
  finishPathNodeDrag: SelectorCanvasToolDeps['finishPathNodeDrag'];
  tryDeleteSelectedPathNode: SelectorCanvasToolDeps['tryDeleteSelectedPathNode'];
  markForCheck: () => void;
  setTool: (tool: import('../../services/editor-tool.service').EditorTool) => void;
  getZoomMarquee: ZoomCanvasToolDeps['getZoomMarquee'];
  isZoomMarquee: ZoomCanvasToolDeps['isZoomMarquee'];
  commitZoomMarquee: ZoomCanvasToolDeps['commitZoomMarquee'];
  consumeZoomMarqueeJustEnded: ZoomCanvasToolDeps['consumeZoomMarqueeJustEnded'];
  screenToSvgForZoom: ZoomCanvasToolDeps['screenToSvg'];
  zoomInAt: ZoomCanvasToolDeps['zoomInAt'];
  zoomOutAt: ZoomCanvasToolDeps['zoomOutAt'];
  refreshViewAfterZoomClick: ZoomCanvasToolDeps['refreshViewAfterZoomClick'];
  beginPanSession: PanCanvasToolDeps['beginPanSession'];
  isPanning: PanCanvasToolDeps['isPanning'];
  applyPanDragFromEvent: PanCanvasToolDeps['applyPanDragFromEvent'];
  clearPanningFlag: PanCanvasToolDeps['clearPanningFlag'];
  updateTextToolPreviewFromClient: TextCanvasToolDeps['updateTextToolPreviewFromClient'];
  createTextAtPoint: TextCanvasToolDeps['createTextAtPoint'];
  destroyTextToolPreview: TextCanvasToolDeps['destroyTextToolPreview'];
  tryEnterTextEditAfterCreate: TextCanvasToolDeps['tryEnterTextEditAfterCreate'];
  isInlineTextEditActive: TextCanvasToolDeps['isInlineTextEditActive'];
  resolveContentTextIdFromClick: TextCanvasToolDeps['resolveContentTextIdFromClick'];
  selectAndEnterTextEdit: TextCanvasToolDeps['selectAndEnterTextEdit'];
  sampleEyedropperAt: EyedropperCanvasToolDeps['sampleAt'];
}

export function createSvgCanvasPointerStack(args: CreateSvgCanvasPointerStackArgs): SvgCanvasPointerStack {
  const drag = new DragGesture();
  const resize = new ResizeGesture();
  const rotate = new RotateGesture();
  const skew = new SkewGesture();
  const creation = new CreationGesture({
    getRectDefaults: () => args.getRectCreationDefaults(),
    getEllipseDefaults: () => args.getEllipseCreationDefaults()
  });
  const selectionMarquee = new SelectionMarqueeGesture();
  const zoomMarquee = new ZoomMarqueeGesture();

  const doc = {
    svgManipulation: args.svgManipulation,
    shapeSelection: args.shapeSelection,
    editorHistory: args.editorHistory
  };
  const transformDoc = createDefaultTransformGestureDoc(
    args.svgManipulation,
    args.shapeSelection,
    args.editorHistory
  );

  const gestureRuntime: GestureRuntimeContext = {
    pointer: {
      cdr: args.cdr,
      highlightOverlayContainer: args.highlightOverlayContainer,
      clientToEditorSvgPoint: (cx, cy) => args.coordinateMapping.clientToEditorSvgPoint(cx, cy),
      svgBboxToOverlayPixels: (bbox) => args.coordinateMapping.svgBboxToOverlayPixels(bbox),
      invalidateHighlightCache: () => args.invalidateHighlightCache(),
      setLastBbox: (bbox) => args.setLastBbox(bbox)
    },
    doc,
    transformDoc,
    snap: {
      snap: args.snap,
      getSmartGuideCandidates: () => args.getSmartGuideCandidates(),
      isSnapTemporarilyDisabled: () => args.isSnapTemporarilyDisabled()
    }
  };

  const pointerGestureRouter = new PointerGestureRouter(args.toolRegistry);

  const penTool = new PenToolSession(args.createPenToolSessionPorts());

  args.canvasBoundToolRegistrar.registerCreationTools(
    creation,
    () => gestureRuntime,
    args.isCanvasReady
  );

  args.canvasBoundToolRegistrar.registerPenTool(() => ({
    getPenTool: () => penTool,
    isCanvasReady: args.isCanvasReady,
    scheduleInsertHoverCursorHitTest: args.scheduleInsertHoverCursorHitTest,
    markForCheck: args.markForCheck,
    getSnappedPenPoint: args.getSnappedPenPoint,
    hasPathNodeEditState: args.hasPathNodeEditState,
    tryStartPathNodeDrag: args.tryStartPathNodeDrag
  }));

  args.canvasBoundToolRegistrar.registerSelectorTools(() => ({
    getGestures: () => ({ selectionMarquee, resize, skew, rotate, drag }),
    getRuntime: () => gestureRuntime,
    isCanvasReady: args.isCanvasReady,
    hasPathNodeEditState: args.hasPathNodeEditState,
    tryStartPathNodeDrag: args.tryStartPathNodeDrag,
    tryDeleteSelectedPathNode: args.tryDeleteSelectedPathNode,
    isEditorContentShapeTarget: args.isEditorContentShapeTarget,
    clientToEditorSvgPoint: (cx, cy) => args.coordinateMapping.clientToEditorSvgPoint(cx, cy),
    isShapeSelected: args.isShapeSelected,
    getNearestGroupAncestorId: args.getNearestGroupAncestorId,
    getSelectedShapeIds: args.getSelectedShapeIds,
    isSelectionMarquee: args.isSelectionMarquee,
    isResizingSelection: args.isResizingSelection,
    isSkewingSelection: args.isSkewingSelection,
    isRotatingSelection: args.isRotatingSelection,
    isDraggingShape: args.isDraggingShape,
    getPathNodeDragSession: args.getPathNodeDragSession,
    updatePathNodeDrag: args.updatePathNodeDrag,
    finishPathNodeDrag: args.finishPathNodeDrag,
    getKeyboardActions: args.getSelectorKeyboardActions,
    getSvgInstance: args.getSvgInstance,
    enterInlineTextEditMode: args.enterInlineTextEditMode,
    getDrilledIntoGroupId: args.getDrilledIntoGroupId,
    setDrilledIntoGroupId: args.setDrilledIntoGroupId,
    isGroupAClipMaskCarrier: args.isGroupAClipMaskCarrier,
    getShapeProperties: args.getShapeProperties,
    getSelectorSelectionForShape: args.getSelectorSelectionForShape,
    getShapePropertiesInSameClipGroup: args.getShapePropertiesInSameClipGroup,
    getExpandedDragShapeIds: args.getExpandedDragShapeIds,
    shouldSkipEmptyHitSelectionClear: args.shouldSkipEmptyHitSelectionClear,
    toggleShapeGroupInSelection: args.toggleShapeGroupInSelection,
    selectShapes: args.selectShapes,
    clearSelection: args.clearSelection,
    clearHighlight: args.clearHighlight,
    consumeSelectionMarqueeJustEnded: args.consumeSelectionMarqueeJustEnded
  }));

  args.canvasBoundToolRegistrar.registerViewUtilityTools({
    getZoomDeps: () => ({
      getZoomMarquee: args.getZoomMarquee,
      isZoomMarquee: args.isZoomMarquee,
      commitZoomMarquee: args.commitZoomMarquee,
      isCanvasReady: args.isCanvasReady,
      consumeZoomMarqueeJustEnded: args.consumeZoomMarqueeJustEnded,
      screenToSvg: args.screenToSvgForZoom,
      zoomInAt: args.zoomInAt,
      zoomOutAt: args.zoomOutAt,
      refreshViewAfterZoomClick: args.refreshViewAfterZoomClick
    }),
    getPanDeps: () => ({
      beginPanSession: args.beginPanSession,
      isPanning: args.isPanning,
      applyPanDragFromEvent: args.applyPanDragFromEvent,
      clearPanningFlag: args.clearPanningFlag
    }),
    getTextDeps: () => ({
      isCanvasReady: args.isCanvasReady,
      isInlineTextEditActive: args.isInlineTextEditActive,
      resolveContentTextIdFromClick: args.resolveContentTextIdFromClick,
      selectAndEnterTextEdit: args.selectAndEnterTextEdit,
      updateTextToolPreviewFromClient: args.updateTextToolPreviewFromClient,
      createTextAtPoint: args.createTextAtPoint,
      destroyTextToolPreview: args.destroyTextToolPreview,
      tryEnterTextEditAfterCreate: args.tryEnterTextEditAfterCreate
    }),
    getEyedropperDeps: () => ({
      isCanvasReady: args.isCanvasReady,
      sampleAt: args.sampleEyedropperAt,
      setTool: (tool) => args.setTool(tool),
      markForCheck: args.markForCheck
    })
  });

  return {
    gestureRuntime,
    pointerGestureRouter,
    penTool,
    drag,
    resize,
    rotate,
    skew,
    creation,
    selectionMarquee,
    zoomMarquee
  };
}
