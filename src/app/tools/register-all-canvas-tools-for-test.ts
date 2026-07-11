import { vi } from 'vitest';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import { DragGesture } from '../components/svg-canvas/gestures/drag-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import { ResizeGesture } from '../components/svg-canvas/gestures/resize-gesture';
import { RotateGesture } from '../components/svg-canvas/gestures/rotate-gesture';
import { SelectionMarqueeGesture } from '../components/svg-canvas/gestures/selection-marquee-gesture';
import { SkewGesture } from '../components/svg-canvas/gestures/skew-gesture';
import { ZoomMarqueeGesture } from '../components/svg-canvas/gestures/zoom-marquee-gesture';
import type { PenToolSession } from '../components/svg-canvas/pen-tool-session/pen-tool-session';
import type { SelectorKeyboardActionsPort } from '../components/svg-canvas/selector-canvas-tool-keyboard';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditorTool } from '../services/editor-tool.service';
import { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import type { CanvasTool } from './canvas-tool.interface';
import { registerDefaultToolDescriptors } from './register-default-tool-descriptors';
import { ToolRegistryService } from './tool-registry.service';

export interface CanvasToolsTestGestures {
  creation: CreationGesture;
  selectionMarquee: SelectionMarqueeGesture;
  zoomMarquee: ZoomMarqueeGesture;
  resize: ResizeGesture;
  skew: SkewGesture;
  rotate: RotateGesture;
  drag: DragGesture;
}

/** Mutable flags and host callbacks wired into canvas tool deps. */
export interface CanvasToolsTestHostState {
  isSelectionMarquee: boolean;
  isZoomMarquee: boolean;
  isResizingSelection: boolean;
  isSkewingSelection: boolean;
  isRotatingSelection: boolean;
  isPanning: boolean;
  isDraggingShape: boolean;
  hasPathNodeEditState: boolean;
  isCanvasReady: boolean;
  isEditorContentShapeTarget: (target: Element) => boolean;
  isShapeSelected: (id: string) => boolean;
  getNearestGroupAncestorId: (id: string) => string | null;
  getSelectedShapeIds: () => string[];
  getExpandedDragShapeIds: () => string[];
  tryStartPathNodeDrag: (target: Element, event: MouseEvent) => boolean;
  beginPanSession: (event: MouseEvent) => void;
  applyPanDragFromEvent: (event: MouseEvent) => void;
  clearPanningFlag: () => void;
  commitZoomMarquee: () => void;
  consumeZoomMarqueeJustEnded: boolean;
  updateTextToolPreviewFromClient: (clientX: number, clientY: number) => void;
  createTextAtPoint: (clientX: number, clientY: number) => string | undefined;
  tryEnterTextEditAfterCreate: (newId: string) => void;
  destroyTextToolPreview: () => void;
  enterInlineTextEditMode: (textId: string) => void;
  getSvgInstance: () => import('@svgdotjs/svg.js').Svg | null;
  sampleEyedropperAt: (event: MouseEvent) => void;
  clientToEditorSvgPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  screenToSvg: (clientX: number, clientY: number) => { x: number; y: number } | null;
  zoomInAt: (x: number, y: number) => void;
  zoomOutAt: (x: number, y: number) => void;
  refreshViewAfterZoomClick: () => void;
  scheduleInsertHoverCursorHitTest: (clientX: number, clientY: number) => void;
  getSelectorKeyboardActions: () => SelectorKeyboardActionsPort;
  getDrilledIntoGroupId: () => string | null;
  setDrilledIntoGroupId: (id: string | null) => void;
  isGroupAClipMaskCarrier: (groupId: string) => boolean;
  getShapeProperties: (el: SvgJsElement) => ShapeProperties;
  getShapePropertiesInSameClipGroup: (el: SvgJsElement) => ShapeProperties[];
  getSelectorSelectionForShape: (el: SvgJsElement) => ShapeProperties[];
  toggleShapeGroupInSelection: (shapes: ShapeProperties[]) => void;
  selectShapes: (shapes: ShapeProperties[]) => void;
  clearSelection: () => void;
  clearHighlight: () => void;
  consumeSelectionMarqueeJustEnded: () => boolean;
  shouldSkipEmptyHitSelectionClear: () => boolean;
  getPathNodeDragSession: () => unknown | null;
  updatePathNodeDrag: (clientX: number, clientY: number) => void;
  finishPathNodeDrag: () => void;
  tryDeleteSelectedPathNode: () => boolean;
  markForCheck: () => void;
  setTool: (tool: EditorTool) => void;
}

export interface RegisterAllCanvasToolsForTestOptions {
  registry?: ToolRegistryService;
  gestures?: Partial<CanvasToolsTestGestures>;
  runtime?: GestureRuntimeContext;
  hostState?: Partial<CanvasToolsTestHostState>;
  penTool?: PenToolSession;
}

export interface RegisterAllCanvasToolsForTestResult {
  registry: ToolRegistryService;
  registrar: CanvasBoundToolRegistrar;
  gestures: CanvasToolsTestGestures;
  runtime: GestureRuntimeContext;
  hostState: CanvasToolsTestHostState;
  penTool: PenToolSession;
}

const emptyRuntime = (): GestureRuntimeContext => ({
  pointer: {} as GestureRuntimeContext['pointer'],
  doc: {} as GestureRuntimeContext['doc'],
  transformDoc: {} as GestureRuntimeContext['transformDoc'],
  snap: {} as GestureRuntimeContext['snap']
});

export function createDefaultCanvasToolsTestHostState(): CanvasToolsTestHostState {
  return {
    isSelectionMarquee: false,
    isZoomMarquee: false,
    isResizingSelection: false,
    isSkewingSelection: false,
    isRotatingSelection: false,
    isPanning: false,
    isDraggingShape: false,
    hasPathNodeEditState: false,
    isCanvasReady: true,
    isEditorContentShapeTarget: () => true,
    isShapeSelected: () => true,
    getNearestGroupAncestorId: () => null,
    getSelectedShapeIds: () => ['a'],
    getExpandedDragShapeIds: () => ['a'],
    tryStartPathNodeDrag: () => false,
    beginPanSession: vi.fn(),
    applyPanDragFromEvent: vi.fn(),
    clearPanningFlag: vi.fn(),
    commitZoomMarquee: vi.fn(),
    consumeZoomMarqueeJustEnded: false,
    updateTextToolPreviewFromClient: vi.fn(),
    createTextAtPoint: vi.fn(),
    tryEnterTextEditAfterCreate: vi.fn(),
    destroyTextToolPreview: vi.fn(),
    enterInlineTextEditMode: vi.fn(),
    getSvgInstance: () => null,
    sampleEyedropperAt: vi.fn(),
    clientToEditorSvgPoint: () => ({ x: 0, y: 0 }),
    screenToSvg: () => null,
    zoomInAt: vi.fn(),
    zoomOutAt: vi.fn(),
    refreshViewAfterZoomClick: vi.fn(),
    scheduleInsertHoverCursorHitTest: vi.fn(),
    getSelectorKeyboardActions: () =>
      ({
        getSvgContent: () => 'svg',
        svgManipulation: {} as SelectorKeyboardActionsPort['svgManipulation'],
        shapeSelection: {} as SelectorKeyboardActionsPort['shapeSelection'],
        editorHistory: {} as SelectorKeyboardActionsPort['editorHistory'],
        selectAllShapesFromDocument: vi.fn(),
        copySelectionToClipboard: vi.fn(() => false),
        cutSelectionToClipboard: vi.fn(() => false),
        pasteFromClipboard: vi.fn(() => false),
        duplicateSelection: vi.fn(() => false),
        groupSelectedShapes: vi.fn(),
        ungroupSelectedShape: vi.fn(),
        handleAlignmentShortcut: vi.fn(() => false)
      }) satisfies SelectorKeyboardActionsPort,
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    isGroupAClipMaskCarrier: () => false,
    consumeSelectionMarqueeJustEnded: () => false,
    shouldSkipEmptyHitSelectionClear: () => false,
    clearHighlight: vi.fn(),
    getShapeProperties: (el) => ({
      id: el.id(),
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    }),
    getShapePropertiesInSameClipGroup: (el) => [
      { id: el.id(), type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ],
    getSelectorSelectionForShape: (el) => [
      { id: el.id(), type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ],
    selectShapes: vi.fn(),
    toggleShapeGroupInSelection: vi.fn(),
    clearSelection: vi.fn(),
    getPathNodeDragSession: () => null,
    updatePathNodeDrag: vi.fn(),
    finishPathNodeDrag: vi.fn(),
    tryDeleteSelectedPathNode: () => false,
    markForCheck: vi.fn(),
    setTool: vi.fn()
  };
}

/** Replace a registered tool with a patched copy (e.g. custom onPointerMove for one test). */
export function patchRegisteredCanvasTool(
  registry: ToolRegistryService,
  toolId: EditorTool,
  patch: Partial<CanvasTool>
): CanvasTool {
  const existing = registry.get(toolId);
  if (!existing) {
    throw new Error(`Canvas tool "${toolId}" is not registered`);
  }
  const patched = { ...existing, ...patch };
  registry.register(patched);
  return patched;
}

function createDefaultPenToolStub(): PenToolSession {
  return {
    isPenSessionActive: false,
    isPenInsertOnPathDragActive: false,
    wouldPickUpPenOpenPathContinuationAt: () => false,
    onCanvasPenPrimaryMouseDown: () => false,
    onDocumentMouseMovePen: vi.fn(),
    onDocumentMouseUpPen: vi.fn(),
    clearDrawingState: vi.fn(),
    tryPenBackspaceShortcut: () => false,
    tryFinishPenPath: vi.fn()
  } as unknown as PenToolSession;
}

/**
 * Registers the same canvas-bound {@link CanvasTool} adapters production uses
 * (creation, selector, pen, zoom, pan, text, eyedropper) with minimal stub deps.
 */
export function registerAllCanvasToolsForTest(
  options: RegisterAllCanvasToolsForTestOptions = {}
): RegisterAllCanvasToolsForTestResult {
  const registry = options.registry ?? new ToolRegistryService();
  registerDefaultToolDescriptors(registry);

  const registrar = new CanvasBoundToolRegistrar(registry);
  registrar.attach(registry);

  const gestures: CanvasToolsTestGestures = {
    creation: options.gestures?.creation ?? new CreationGesture(),
    selectionMarquee: options.gestures?.selectionMarquee ?? new SelectionMarqueeGesture(),
    zoomMarquee: options.gestures?.zoomMarquee ?? new ZoomMarqueeGesture(),
    resize: options.gestures?.resize ?? new ResizeGesture(),
    skew: options.gestures?.skew ?? new SkewGesture(),
    rotate: options.gestures?.rotate ?? new RotateGesture(),
    drag: options.gestures?.drag ?? new DragGesture()
  };

  const runtime = options.runtime ?? emptyRuntime();
  const hostState: CanvasToolsTestHostState = {
    ...createDefaultCanvasToolsTestHostState(),
    ...options.hostState
  };
  const penTool = options.penTool ?? createDefaultPenToolStub();

  registrar.registerCreationTools(gestures.creation, () => runtime, () => hostState.isCanvasReady);

  registrar.registerPenTool(() => ({
    getPenTool: () => penTool,
    getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
    hasPathNodeEditState: () => hostState.hasPathNodeEditState,
    tryStartPathNodeDrag: hostState.tryStartPathNodeDrag,
    isCanvasReady: () => hostState.isCanvasReady,
    scheduleInsertHoverCursorHitTest: hostState.scheduleInsertHoverCursorHitTest,
    markForCheck: hostState.markForCheck
  }));

  registrar.registerSelectorTools(() => ({
    getGestures: () => gestures,
    getRuntime: () => runtime,
    isCanvasReady: () => hostState.isCanvasReady,
    hasPathNodeEditState: () => hostState.hasPathNodeEditState,
    tryStartPathNodeDrag: hostState.tryStartPathNodeDrag,
    tryDeleteSelectedPathNode: hostState.tryDeleteSelectedPathNode,
    isEditorContentShapeTarget: hostState.isEditorContentShapeTarget,
    clientToEditorSvgPoint: hostState.clientToEditorSvgPoint,
    isShapeSelected: hostState.isShapeSelected,
    getNearestGroupAncestorId: hostState.getNearestGroupAncestorId,
    getSelectedShapeIds: hostState.getSelectedShapeIds,
    getExpandedDragShapeIds: hostState.getExpandedDragShapeIds,
    isSelectionMarquee: () => hostState.isSelectionMarquee,
    isResizingSelection: () => hostState.isResizingSelection,
    isSkewingSelection: () => hostState.isSkewingSelection,
    isRotatingSelection: () => hostState.isRotatingSelection,
    isDraggingShape: () => hostState.isDraggingShape,
    getPathNodeDragSession: hostState.getPathNodeDragSession,
    updatePathNodeDrag: hostState.updatePathNodeDrag,
    finishPathNodeDrag: hostState.finishPathNodeDrag,
    getKeyboardActions: hostState.getSelectorKeyboardActions,
    getSvgInstance: hostState.getSvgInstance,
    getShapeProperties: hostState.getShapeProperties,
    getShapePropertiesInSameClipGroup: hostState.getShapePropertiesInSameClipGroup,
    getSelectorSelectionForShape: hostState.getSelectorSelectionForShape,
    selectShapes: hostState.selectShapes,
    toggleShapeGroupInSelection: hostState.toggleShapeGroupInSelection,
    clearSelection: hostState.clearSelection,
    clearHighlight: hostState.clearHighlight,
    getDrilledIntoGroupId: hostState.getDrilledIntoGroupId,
    setDrilledIntoGroupId: hostState.setDrilledIntoGroupId,
    isGroupAClipMaskCarrier: hostState.isGroupAClipMaskCarrier,
    consumeSelectionMarqueeJustEnded: hostState.consumeSelectionMarqueeJustEnded,
    shouldSkipEmptyHitSelectionClear: hostState.shouldSkipEmptyHitSelectionClear,
    enterInlineTextEditMode: hostState.enterInlineTextEditMode
  }));

  registrar.registerViewUtilityTools({
    getZoomDeps: () => ({
      getZoomMarquee: () => gestures.zoomMarquee,
      isZoomMarquee: () => hostState.isZoomMarquee,
      commitZoomMarquee: hostState.commitZoomMarquee,
      isCanvasReady: () => hostState.isCanvasReady,
      consumeZoomMarqueeJustEnded: () => hostState.consumeZoomMarqueeJustEnded,
      screenToSvg: hostState.screenToSvg,
      zoomInAt: hostState.zoomInAt,
      zoomOutAt: hostState.zoomOutAt,
      refreshViewAfterZoomClick: hostState.refreshViewAfterZoomClick
    }),
    getPanDeps: () => ({
      beginPanSession: hostState.beginPanSession,
      isPanning: () => hostState.isPanning,
      applyPanDragFromEvent: hostState.applyPanDragFromEvent,
      clearPanningFlag: hostState.clearPanningFlag
    }),
    getTextDeps: () => ({
      isCanvasReady: () => hostState.isCanvasReady,
      updateTextToolPreviewFromClient: hostState.updateTextToolPreviewFromClient,
      createTextAtPoint: hostState.createTextAtPoint,
      destroyTextToolPreview: hostState.destroyTextToolPreview,
      tryEnterTextEditAfterCreate: hostState.tryEnterTextEditAfterCreate
    }),
    getEyedropperDeps: () => ({
      isCanvasReady: () => hostState.isCanvasReady,
      sampleAt: hostState.sampleEyedropperAt,
      setTool: (tool) => hostState.setTool(tool),
      markForCheck: hostState.markForCheck
    })
  });

  return { registry, registrar, gestures, runtime, hostState, penTool };
}
