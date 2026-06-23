import { Component, input, viewChild, AfterViewInit, ElementRef, OnInit, OnDestroy, ChangeDetectorRef, effect, signal, inject } from '@angular/core';
import { SVG, Svg, Element as SVGElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService, type EditorTool } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';
import { SnapService } from '../../services/snap.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { RasterInsertAnchorStore } from '../../services/raster-insert-anchor.store';
import { RasterImageInsertService } from '../../services/raster-image-insert.service';
import {
  computeProportionalResizedUnion,
  type BBox,
  type ResizeCorner,
  type ResizeHandle
} from '../../utils/selection-resize';
import { type SkewEdge } from '../../utils/selection-skew';
import {
  unionRotationPivot,
  rotationDeltaFromPointerMoveRad,
  radiansToDegrees,
  rotateGhostWorldToUnionMatrix
} from '../../utils/selection-rotate';
import { MARQUEE_MIN_DRAG_PX } from '../../utils/marquee-selection';
import { rootSvgUserPointToScreenPoint, screenPointToRootSvgUserPoint } from '../../utils/svg-screen-user';
import { ShapeProperties } from '../../models/shape-properties.interface';
import {
  EditorCommand,
  TranslateCommand,
  AlignCommand,
  DistributeCommand,
  UnionRotateCommand,
  RemoveShapesCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand,
  AddShapeCommand,
  AddPathCommand,
  EditPathNodesCommand,
  SetPathNodeHandleLinkCommand,
  CompositeCommand,
  PasteCommand,
  DuplicateCommand,
  TextContentCommand,
} from '../../models/editor-commands';
import {
  DragGesture,
  ResizeGesture,
  RotateGesture,
  SkewGesture,
  CreationGesture,
  SelectionMarqueeGesture,
  ZoomMarqueeGesture,
  PointerGestureRouter,
  type GestureRuntimeContext,
  type Rect,
  type SvgCanvasPointerGestureHost
} from './gestures';
import { PenToolSession, type PenToolSessionPorts } from './pen-tool-session/pen-tool-session';
import { handleSvgCanvasKeyDown, type SvgCanvasKeyboardContext } from './svg-canvas-keyboard.controller';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { CanvasBoundToolRegistrar } from '../../tools/canvas-bound-tool-registrar.service';
import type { CanvasToolHost } from '../../tools/canvas-tool-host.interface';
import { SvgCanvasEditorChromeFacade } from './svg-canvas-editor-chrome.facade';
import { createSvgCanvasPointerStack } from './svg-canvas-pointer-stack.factory';
import { lastCommittedVertex, penSvgDistanceSq } from '../../models/pen-path';
import { parsePathD, parsePathDForNodeEditing, pathSegmentsToD, type PathSegment } from '../../models/path-d';
import { buildPathSelectionOutlineOverlayD } from '../../models/path-selection-outline';
import {
  convertPathAnchorAtMoveSegmentIndexToCorner,
  convertPathAnchorAtMoveSegmentIndexToIndependentHandles,
  convertPathAnchorAtMoveSegmentIndexToMirrorCubic,
  getIndependentHandlesJointUiState,
  isIndependentHandlesJointActionable,
  getMirrorCubicJointUiState,
  isPathNodeCornerAnchorAlreadyApplied,
  PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK,
  resolvePathNodeConversionLegs
} from '../../models/path-node-anchor-convert';
import { applySymmetricCubicControlDragInPlace } from '../../models/path-node-cubic-handle-mirror';
import {
  parsePathNodeHandleLinkMap,
  remapPathNodeHandleLinkMapByStableAnchors,
  serializePathNodeHandleLinkMap,
  type PathNodeHandleLinkMap
} from '../../models/path-node-handle-link';
import { findPenPathInsertHit } from '../../models/path-pen-insert';
import { ClipboardService } from '../../services/clipboard.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import {
  applyTextTypographyFromDrawingDefaults,
  isTextToolPreviewNode,
  TEXT_TOOL_PREVIEW_DATA_ATTR
} from '../../utils/text-typography-from-defaults';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { PathBooleanPreviewService } from '../../services/path-boolean-preview.service';
import { PathNodeEditCommandBridgeService } from '../../services/path-node-edit-command-bridge.service';
import {
  EditorPointerIntentDebugService,
  type EditorPointerIntentSnapshot
} from '../../services/editor-pointer-intent-debug.service';
import { sampleSolidComputedPaint } from '../../utils/svg-computed-color-sample';
import {
  inlineTextEditorFontShorthand,
  resolveInlineTextEditorTypography
} from '../../utils/svg-inline-text-typography';
import { SelectionOverlayComponent } from './overlays/selection-overlay.component';
import { PathNodeOverlayComponent } from './overlays/path-node-overlay.component';
import { SnapCandidateShape } from '../../services/snap.service';

/**
 * **Canvas adapter** seams (Editor runtime): keyboard policy → `svg-canvas-keyboard.controller.ts`;
 * pointer assembly → `svg-canvas-pointer-stack.factory.ts`; template **Editor chrome** bindings →
 * {@link SvgCanvasEditorChromeFacade}.
 */

/** Target number of major ticks visible across the ruler at any zoom level. */
const RULER_TICK_COUNT = 30;

const CONTENT_SHAPE_TAGS = new Set([
  'circle',
  'rect',
  'path',
  'polygon',
  'ellipse',
  'line',
  'polyline',
  'text',
  'image',
  'use',
  'g'
]);

/** After loading SVG, fit the editor stage in the canvas with this much inset (margin). */
const INITIAL_LOAD_VIEWPORT_FIT_FRACTION = 0.88;
/** When a drawable segment ends at the subpath start and is followed by `Z`, skip a duplicate node-edit anchor (squared distance in user space). */
const PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ = 1e-6;
const PATH_NODE_EDIT_FEEDBACK_DURATION_MS = 1400;
const ALIGN_LEFT_SHORTCUT = 'ArrowLeft';
const ALIGN_RIGHT_SHORTCUT = 'ArrowRight';
const ALIGN_TOP_SHORTCUT = 'ArrowUp';
const ALIGN_CENTER_SHORTCUT = 'ArrowDown';
const ALIGN_MIDDLE_SHORTCUT = 'm';
const ALIGN_BOTTOM_SHORTCUT = 'b';
const DISTRIBUTE_HORIZONTAL_SHORTCUT = 'h';
const DISTRIBUTE_VERTICAL_SHORTCUT = 'v';

interface PathNodePoint {
  x: number;
  y: number;
  segmentIndex: number;
  moveSegmentIndex: number;
}

interface PathNodeControlHandle {
  anchorX: number;
  anchorY: number;
  controlX: number;
  controlY: number;
  segmentIndex: number;
  controlPoint: 'x1y1' | 'x2y2';
  /** Move-segment index of the anchor vertex this handle belongs to (node-edit selection key). */
  vertexMoveSegmentIndex: number;
}

interface PathNodeEditPathState {
  pathId: string;
  anchors: PathNodePoint[];
  controlHandles: PathNodeControlHandle[];
}

interface PathNodeSelectionState {
  pathId: string;
  moveSegmentIndex: number;
}

interface PathNodeEditState {
  paths: PathNodeEditPathState[];
  activePathId: string | null;
}

interface PathNodeEditStateBuildResult {
  state: PathNodeEditPathState | null;
  reason: string | null;
}

interface PathNodeDragSession {
  pathId: string;
  oldD: string;
  segments: PathSegment[];
  target:
    | { kind: 'anchor'; index: number }
    | { kind: 'control'; index: number };
}

interface InlineTextEditState {
  textId: string;
  originalText: string;
}

interface GridLineOverlay {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  major: boolean;
}

interface SmartGuideLineOverlay {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Round to nearest "nice" step (1, 2, 5 × 10^n) for readable labels. */
function roundToNiceStep(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 1;
  const exp = Math.floor(Math.log10(value));
  const mag = Math.pow(10, exp);
  const normalized = value / mag;
  const nice = normalized <= 1.5 ? 1 : normalized <= 3.5 ? 2 : normalized <= 7.5 ? 5 : 10;
  return mag * nice;
}

/** 10%–1000% zoom band for TUX-5 inverse-scale formulas; avoids div-by-zero and runaway values. */
const SELECTION_CHROME_ZOOM_CLAMP_MIN = 0.1;
const SELECTION_CHROME_ZOOM_CLAMP_MAX = 10;

const HANDLE_RADIUS_REF_SCREEN_PX = 6;
const HANDLE_RADIUS_MIN_SCREEN_PX = 4;
const HANDLE_RADIUS_MAX_SCREEN_PX = 8;

const ROTATE_HANDLE_OFFSET_REF_SCREEN_PX = 28;
const ROTATE_HANDLE_OFFSET_MIN_SCREEN_PX = 20;
const ROTATE_HANDLE_OFFSET_MAX_SCREEN_PX = 40;

/** Exported for unit tests (TUX-5). */
export function clampCanvasScaleForSelectionChrome(scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.min(SELECTION_CHROME_ZOOM_CLAMP_MAX, Math.max(SELECTION_CHROME_ZOOM_CLAMP_MIN, s));
}

/** Overlay SVG `r` in px (overlay viewBox matches screen px of the scaled stage). */
export function selectionHandleRadiusOverlayPx(scale: number): number {
  const s = clampCanvasScaleForSelectionChrome(scale);
  const raw = HANDLE_RADIUS_REF_SCREEN_PX / s;
  return Math.min(HANDLE_RADIUS_MAX_SCREEN_PX, Math.max(HANDLE_RADIUS_MIN_SCREEN_PX, raw));
}

/** Outward offset for skew midpoint handles (past the bbox edge; overlay px). */
export function selectionSkewEdgeOutsetOverlayPx(scale: number): number {
  const s = clampCanvasScaleForSelectionChrome(scale);
  return Math.max(8, Math.min(18, 14 / s));
}

/** Distance from selection top edge to rotate handle center, in overlay px. */
export function rotateHandleOffsetOverlayPx(scale: number): number {
  const s = clampCanvasScaleForSelectionChrome(scale);
  const raw = ROTATE_HANDLE_OFFSET_REF_SCREEN_PX / s;
  return Math.min(ROTATE_HANDLE_OFFSET_MAX_SCREEN_PX, Math.max(ROTATE_HANDLE_OFFSET_MIN_SCREEN_PX, raw));
}

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [SelectionOverlayComponent, PathNodeOverlayComponent],
  templateUrl: './svg-canvas.component.html',
  styleUrl: './svg-canvas.component.css',
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(document:mousemove)': 'onDocumentMouseMove($event)',
    '(document:mouseup)': 'onDocumentMouseUp($event)'
  }
})
export class SvgCanvasComponent implements AfterViewInit, OnInit, OnDestroy, SvgCanvasPointerGestureHost {
  private readonly rasterInsertAnchor = inject(RasterInsertAnchorStore);
  private readonly rasterImageInsert = inject(RasterImageInsertService);
  readonly RULER_SIZE = 24;
  readonly svgContent = input<string>('');
  readonly svgContainer = viewChild<ElementRef<HTMLElement>>('svgContainer');
  readonly zoomWrapper = viewChild<ElementRef<HTMLElement>>('zoomWrapper');
  readonly highlightOverlayContainer = viewChild<ElementRef<HTMLElement>>('highlightOverlayContainer');
  readonly canvasViewport = viewChild<ElementRef<HTMLElement>>('canvasViewport');
  private readonly pointerIntentDebug = inject(EditorPointerIntentDebugService);
  readonly rulerLeft = viewChild<ElementRef<HTMLElement>>('rulerLeft');
  readonly inlineTextEditor = viewChild<ElementRef<HTMLTextAreaElement>>('inlineTextEditor');
  altKeyPressed = false;
  isPanning = false;
  overlayViewBox = '0 0 100 100';
  wrapperWidth = 0;
  wrapperHeight = 0;
  rulerOriginOffsetX = 0;
  rulerOriginOffsetY = 0;

  get overlayWidthPx(): number {
    return this.wrapperWidth * this.canvasView.scale;
  }
  get overlayHeightPx(): number {
    return this.wrapperHeight * this.canvasView.scale;
  }
  get zoomLevelPercent(): number {
    return Math.round(this.canvasView.scale * 100);
  }

  get isInlineTextEditModeActive(): boolean {
    return this.inlineTextEditState !== null;
  }

  get inlineTextEditValue(): string {
    return this.inlineTextEditDraft;
  }

  get inlineTextEditOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    if (!this.inlineTextEditState) return null;
    const bbox =
      this.svgManipulation.getShapeBBox(this.inlineTextEditState.textId) ??
      this.svgManipulation.getShapeBBox(this.inlineTextEditState.textId, { preferScreenBounds: false });
    if (!bbox) return null;
    return this.svgBboxToOverlayPixels(bbox);
  }

  inlineTextEditWidthPx(rect: { width: number }): number {
    return Math.max(24, rect.width);
  }

  inlineTextEditHeightPx(rect: { height: number }): number {
    return Math.max(18, rect.height);
  }

  /** Tooltip for the floating SVG text editor (a11y / TER polish). */
  readonly inlineTextEditorHint =
    'Edits canvas text. Press Escape or click outside the editor to apply changes.';

  /**
   * `font` shorthand for the inline HTML editor so it tracks the target `<text>` (see
   * `resolveInlineTextEditorTypography` for SVG vs DOM font limitations).
   */
  inlineTextEditorTypographyStyle(): string {
    if (!this.inlineTextEditState) {
      return inlineTextEditorFontShorthand({
        fontSizePx: 14,
        fontFamily: 'sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.2
      });
    }
    const svg = this.svgManipulation.getSVGInstance();
    const shape = svg?.findOne(`#${this.inlineTextEditState.textId}`) as SVGElement | undefined;
    const node = shape?.node ?? null;
    const props = shape ? this.svgManipulation.getShapeProperties(shape) : null;
    const t = resolveInlineTextEditorTypography(node, props, (b) => this.svgBboxToOverlayPixels(b));
    return inlineTextEditorFontShorthand(t);
  }

  get horizontalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originX = this.rulerOriginOffsetX + this.canvasView.panX;
    return this.getRulerTicks(
      (0 - originX) / this.canvasView.scale,
      (this.wrapperWidth - originX) / this.canvasView.scale,
      this.canvasView.scale,
      (svgVal) => this.rulerOriginOffsetX + this.canvasView.panX + svgVal * this.canvasView.scale,
      this.wrapperWidth,
      RULER_TICK_COUNT
    );
  }

  get showResizeHandles(): boolean {
    return (
      this.editorTool.getCurrentTool() === 'selector' &&
      this.shapeSelection.getSelectedShapes().length > 0 &&
      !this.isDraggingShape &&
      !this.isResizingSelection &&
      !this.isRotatingSelection &&
      !this.isSkewingSelection &&
      !this.isSelectionMarquee &&
      this.wrapperWidth > 0 &&
      !!this.lastBbox
    );
  }

  /**
   * Skew handles are hidden when every selected shape is a raster `<image>`. Union skew applies a
   * generic `matrix()` which is confusing and rarely useful for bitmaps; resize and rotate stay.
   */
  get showSelectionSkewHandles(): boolean {
    if (!this.showResizeHandles) return false;
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length === 0) return true;
    return !shapes.every((s) => s.type === 'image');
  }

  /** Resize/skew/rotate handle circle radius in overlay px (inverse zoom, clamped 4–8 screen px). */
  get selectionHandleRadiusOverlay(): number {
    return selectionHandleRadiusOverlayPx(this.canvasView.scale);
  }

  get selectionSkewEdgeOutset(): number {
    return selectionSkewEdgeOutsetOverlayPx(this.canvasView.scale);
  }

  /** Rotate stem length and handle offset from selection top (inverse zoom, clamped 20–40 screen px). */
  get rotateHandleOffset(): number {
    return rotateHandleOffsetOverlayPx(this.canvasView.scale);
  }

  get verticalRulerTicks(): { position: number; value: number; major: boolean }[] {
    const originY = this.rulerOriginOffsetY + this.canvasView.panY;
    return this.getRulerTicks(
      (0 - originY) / this.canvasView.scale,
      (this.wrapperHeight - originY) / this.canvasView.scale,
      this.canvasView.scale,
      (svgVal) => this.rulerOriginOffsetY + this.canvasView.panY + svgVal * this.canvasView.scale,
      this.wrapperHeight,
      Math.max(1, Math.floor(RULER_TICK_COUNT / 2))
    );
  }

  get showGridOverlay(): boolean {
    return (
      this.editorTool.isGridSnapEnabled() &&
      !!this.svgContent() &&
      this.wrapperWidth > 0 &&
      this.wrapperHeight > 0 &&
      this.canvasView.scale > 0
    );
  }

  get gridStepSvgUnits(): number {
    const baseStep = 10;
    const minScreenSpacingPx = 16;
    const maxScreenSpacingPx = 48;
    const scale = this.canvasView.scale;
    if (scale <= 0 || !Number.isFinite(scale)) return baseStep;

    let step = baseStep;
    let screenSpacing = step * scale;
    if (screenSpacing < minScreenSpacingPx) {
      while (screenSpacing < minScreenSpacingPx) {
        step *= 2;
        screenSpacing *= 2;
      }
      return step;
    }
    while (screenSpacing > maxScreenSpacingPx && step > baseStep / 64) {
      step /= 2;
      screenSpacing /= 2;
    }
    return step;
  }

  get verticalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgX / step) * step;
    const out: GridLineOverlay[] = [];
    for (let x = first; x <= maxSvgX + step * 0.5; x += step) {
      const xOverlay = this.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).x;
      const top = this.svgBboxToOverlayPixels({ x, y: minSvgY, width: 0, height: 0 }).y;
      const bottom = this.svgBboxToOverlayPixels({ x, y: maxSvgY, width: 0, height: 0 }).y;
      const major = Math.abs((x / majorStep) - Math.round(x / majorStep)) < 1e-6;
      out.push({
        key: `vx-${x.toFixed(4)}`,
        x1: xOverlay,
        y1: Math.min(top, bottom),
        x2: xOverlay,
        y2: Math.max(top, bottom),
        major
      });
    }
    return out;
  }

  get horizontalGridLines(): GridLineOverlay[] {
    if (!this.showGridOverlay) return [];
    const { minSvgX, maxSvgX, minSvgY, maxSvgY } = this.getVisibleSvgBoundsFromRulerFrame();
    const step = this.gridStepSvgUnits;
    const majorStep = step * 5;
    const first = Math.floor(minSvgY / step) * step;
    const out: GridLineOverlay[] = [];
    for (let y = first; y <= maxSvgY + step * 0.5; y += step) {
      const yOverlay = this.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).y;
      const left = this.svgBboxToOverlayPixels({ x: minSvgX, y, width: 0, height: 0 }).x;
      const right = this.svgBboxToOverlayPixels({ x: maxSvgX, y, width: 0, height: 0 }).x;
      const major = Math.abs((y / majorStep) - Math.round(y / majorStep)) < 1e-6;
      out.push({
        key: `hy-${y.toFixed(4)}`,
        x1: Math.min(left, right),
        y1: yOverlay,
        x2: Math.max(left, right),
        y2: yOverlay,
        major
      });
    }
    return out;
  }

  get verticalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.altKeyPressed) return [];
    const guides = this.isDraggingShape
      ? this.drag.activeGuides.vertical
      : this.isResizingSelection
        ? this.resize.activeGuides.vertical
        : [];
    if (guides.length === 0 || this.overlayHeightPx <= 0) return [];
    return guides.map((x) => {
      const mapped = this.svgBboxToOverlayPixels({ x, y: 0, width: 0, height: 0 });
      return {
        key: `smart-v-${x.toFixed(4)}`,
        x1: mapped.x,
        y1: 0,
        x2: mapped.x,
        y2: this.overlayHeightPx
      };
    });
  }

  get horizontalSmartGuideLines(): SmartGuideLineOverlay[] {
    if (this.altKeyPressed) return [];
    const guides = this.isDraggingShape
      ? this.drag.activeGuides.horizontal
      : this.isResizingSelection
        ? this.resize.activeGuides.horizontal
        : [];
    if (guides.length === 0 || this.overlayWidthPx <= 0) return [];
    return guides.map((y) => {
      const mapped = this.svgBboxToOverlayPixels({ x: 0, y, width: 0, height: 0 });
      return {
        key: `smart-h-${y.toFixed(4)}`,
        x1: 0,
        y1: mapped.y,
        x2: this.overlayWidthPx,
        y2: mapped.y
      };
    });
  }

  private getVisibleSvgBoundsFromRulerFrame(): { minSvgX: number; maxSvgX: number; minSvgY: number; maxSvgY: number } {
    const originX = this.rulerOriginOffsetX + this.canvasView.panX;
    const originY = this.rulerOriginOffsetY + this.canvasView.panY;
    const scale = this.canvasView.scale || 1;
    return {
      minSvgX: (0 - originX) / scale,
      maxSvgX: (this.wrapperWidth - originX) / scale,
      minSvgY: (0 - originY) / scale,
      maxSvgY: (this.wrapperHeight - originY) / scale
    };
  }

  private getRulerTicks(
    minSvg: number,
    maxSvg: number,
    scale: number,
    toPosition: (svgVal: number) => number,
    sizePx: number,
    tickCount: number
  ): { position: number; value: number; major: boolean }[] {
    if (sizePx <= 0 || scale <= 0 || tickCount <= 0) return [];
    const visibleRangeSvg = sizePx / scale;
    const rawStep = visibleRangeSvg / tickCount;
    const step = roundToNiceStep(rawStep);
    const minorStep = step / 2;
    const first = Math.floor(minSvg / minorStep) * minorStep;
    const out: { position: number; value: number; major: boolean }[] = [];
    for (let v = first; v <= maxSvg + minorStep * 0.5; v += minorStep) {
      const pos = toPosition(v);
      if (pos >= -0.5 && pos <= sizePx + 0.5) {
        const isMajor = Math.abs((v / step) - Math.round(v / step)) < 1e-6;
        out.push({ position: pos, value: isMajor ? Math.round(v) : v, major: isMajor });
      }
    }
    return out;
  }

  // --- Gesture handlers (assembled in {@link createSvgCanvasPointerStack}) ---
  private readonly drag: DragGesture;
  private readonly resize: ResizeGesture;
  private readonly rotate: RotateGesture;
  private readonly skew: SkewGesture;
  private readonly creation: CreationGesture;
  private readonly selectionMarquee: SelectionMarqueeGesture;
  private readonly zoomMarquee: ZoomMarqueeGesture;

  readonly gestureRuntime: GestureRuntimeContext;

  private readonly pointerGestureRouter: PointerGestureRouter;

  readonly penTool: PenToolSession;

  /**
   * **Editor chrome** façade for the template — overlay/ruler/marquee bindings; logic remains on
   * this **Canvas adapter** (see {@link SvgCanvasEditorChromeFacade}).
   */
  readonly editorChrome!: SvgCanvasEditorChromeFacade;
  private readonly acceptedSvgContent = signal<string>('');
  private lastObservedTool: EditorTool = 'selector';
  private isRevertingToolChange = false;
  pathNodeEditFeedbackMessage: string | null = null;
  private pathNodeEditFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  // Proxy getters for template bindings and inter-gesture guards
  get isDraggingShape(): boolean { return this.drag.isActive; }
  get isResizingSelection(): boolean { return this.resize.isActive; }
  get isRotatingSelection(): boolean { return this.rotate.isActive; }
  get isSkewingSelection(): boolean { return this.skew.isActive; }
  get isCreatingShape(): boolean { return this.creation.isActive; }
  get isSelectionMarquee(): boolean { return this.selectionMarquee.isActive; }
  get isZoomMarquee(): boolean { return this.zoomMarquee.isActive; }
  get creationGhostRect(): Rect | null { return this.creation.ghostRect; }
  get creationShapeType(): string { return this.creation.activeShapeType; }

  get creationGhostLineOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const start = this.creation.ghostLineStart;
    const end = this.creation.ghostLineEnd;
    if (!start || !end) return null;
    const p1 = this.svgBboxToOverlayPixels({ x: start.x, y: start.y, width: 0, height: 0 });
    const p2 = this.svgBboxToOverlayPixels({ x: end.x, y: end.y, width: 0, height: 0 });
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }

  get penFinishFeedbackMessage(): string | null {
    return this.penTool.penFinishFeedbackMessage;
  }

  get isPenSessionActive(): boolean {
    return this.penTool.isPenSessionActive;
  }

  get penPendingShowsCurvePreview(): boolean {
    return this.penTool.penPendingShowsCurvePreview;
  }

  get penSessionPreviewPathD(): string | null {
    return this.penTool.penSessionPreviewPathD;
  }

  get penInsertOnPathPreviewPathD(): string | null {
    return this.penTool.penInsertOnPathPreviewPathD;
  }

  /**
   * While dragging to shape a pen insert on an existing path, draw node-edit–style handles and a
   * planted anchor dot for the vertex being edited (same colors/sizes as path node overlays).
   */
  get penInsertOnPathNodeAffordanceOverlay(): {
    lines: { x1: number; y1: number; x2: number; y2: number }[];
    knobs: { cx: number; cy: number }[];
    plantedAnchor: { cx: number; cy: number };
  } | null {
    if (!this.penTool.isPenInsertOnPathDragActive) return null;
    const pathId = this.penTool.penInsertOnPathPathId;
    const d = this.penInsertOnPathPreviewPathD;
    const planted = this.penTool.penInsertOnPathPlantedAnchorSvg;
    if (!pathId || !d || !planted) return null;
    const plantedPt = this.pathNodeLocalPointToOverlay(pathId, planted.x, planted.y);
    const plantedAnchor = { cx: plantedPt.x, cy: plantedPt.y };
    const parsed = this.parsePathDataForNodeEditing(d);
    if (!parsed) {
      return { lines: [], knobs: [], plantedAnchor };
    }
    const handles = this.collectPathControlHandles(parsed);
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const knobs: { cx: number; cy: number }[] = [];
    for (const h of handles) {
      if (
        penSvgDistanceSq({ x: h.anchorX, y: h.anchorY }, planted) > PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
      ) {
        continue;
      }
      if (
        penSvgDistanceSq(
          { x: h.anchorX, y: h.anchorY },
          { x: h.controlX, y: h.controlY }
        ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
      ) {
        continue;
      }
      const a = this.pathNodeLocalPointToOverlay(pathId, h.anchorX, h.anchorY);
      const c = this.pathNodeLocalPointToOverlay(pathId, h.controlX, h.controlY);
      lines.push({ x1: a.x, y1: a.y, x2: c.x, y2: c.y });
      knobs.push({ cx: c.x, cy: c.y });
    }
    return { lines, knobs, plantedAnchor };
  }

  get penCurvePreviewPathD(): string | null {
    return this.penTool.penCurvePreviewPathD;
  }

  /** True while plant-at-tip drag shows mirrored P1/P2 without a provisional curve path (next down commits). */
  get penColocatedTipMirroredHandleDragActive(): boolean {
    return this.penTool.penColocatedTipMirroredHandleDragActive;
  }

  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return this.penTool.penFirstAnchorMirroredHandleDragActive;
  }

  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    return this.penTool.penCurveHandleOverlays;
  }

  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return this.penTool.penRubberBandOverlay;
  }

  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return this.penTool.penOutgoingHandleGuideOverlay;
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penOutgoingHandleKnobOverlay;
  }

  get penPendingCurveHandleGuideOverlays(): { x1: number; y1: number; x2: number; y2: number }[] {
    return this.penTool.penPendingCurveHandleGuideOverlays;
  }

  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penCloseTargetHoverOverlay;
  }

  get penOpenPathContinueHoverOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penOpenPathContinueHoverOverlay;
  }

  get penContinuationGhostPathD(): string | null {
    return this.penTool.penContinuationGhostPathD;
  }

  /**
   * While authoring a pen path, node-edit–style anchors and Bézier handles for the current preview
   * `d` (committed preview plus live curve preview when dragging). `null` when inactive or not parseable.
   * Visual only — template uses class `pen-session-path-node-affordance` so pointer hits pass through.
   */
  get penSessionPathNodeOverlays(): {
    anchors: { cx: number; cy: number }[];
    handles: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }[];
  } | null {
    if (!this.isPenToolWithActiveSession()) return null;
    const d = this.penCurvePreviewPathD ?? this.penTool.penSessionPreviewPathD;
    if (!d?.trim()) return null;
    const parsed = this.parsePathDataForNodeEditing(d);
    if (!parsed) return null;
    const anchorsRaw = this.collectPathNodeAnchors(parsed);
    if (anchorsRaw.length === 0) return null;
    const anchors = anchorsRaw.map((a) => {
      const o = this.penRootUserPointToOverlay(a.x, a.y);
      return { cx: o.x, cy: o.y };
    });
    const handles = this.collectPathControlHandles(parsed)
      .filter(
        (h) =>
          penSvgDistanceSq(
            { x: h.anchorX, y: h.anchorY },
            { x: h.controlX, y: h.controlY }
          ) >= PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
      )
      .map((h) => {
        const anchor = this.penRootUserPointToOverlay(h.anchorX, h.anchorY);
        const control = this.penRootUserPointToOverlay(h.controlX, h.controlY);
        return {
          x1: anchor.x,
          y1: anchor.y,
          x2: control.x,
          y2: control.y,
          cx: control.x,
          cy: control.y
        };
      });
    return { anchors, handles };
  }

  private penRootUserPointToOverlay(rx: number, ry: number): { x: number; y: number } {
    const o = this.svgBboxToOverlayPixels({ x: rx, y: ry, width: 0, height: 0 });
    return { x: o.x, y: o.y };
  }

  get isPathNodeEditModeActive(): boolean {
    return this.pathNodeEditState !== null;
  }

  /** Hide path node handles during selection transform gestures (stale overlay positions mid-gesture). */
  get showPathNodeEditOverlays(): boolean {
    return (
      this.isPathNodeEditModeActive &&
      !this.isPenToolWithActiveSession() &&
      !this.isDraggingShape &&
      !this.isResizingSelection &&
      !this.isRotatingSelection &&
      !this.isSkewingSelection
    );
  }

  /**
   * Thin blue path outline in overlay space for selected paths (node-edit or idle pen).
   * Uses current DOM `d` so it tracks live node drags and parent transforms.
   */
  get pathSelectionOutlineOverlays(): { pathId: string; d: string }[] {
    if (!this.showPathNodeEditOverlays || !this.pathNodeEditState) return [];
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return [];
    const overlays: { pathId: string; d: string }[] = [];
    for (const pathState of this.pathNodeEditState.paths) {
      const pathEl = svg.findOne(`#${pathState.pathId}`)?.node as SVGPathElement | null;
      if (!pathEl) continue;
      const overlayD = this.pathLocalPathDToOutlineOverlayD(pathState.pathId, pathEl.getAttribute('d') ?? '');
      if (overlayD) overlays.push({ pathId: pathState.pathId, d: overlayD });
    }
    return overlays;
  }

  /**
   * Thin blue outline for the in-progress pen preview (`penSessionPreviewPathD` / curve preview).
   * Root SVG user space → overlay pixels; same stroke chrome as {@link pathSelectionOutlineOverlays}.
   */
  get penSessionPathOutlineOverlayD(): string | null {
    if (!this.isPenToolWithActiveSession()) return null;
    const sourceD = this.penCurvePreviewPathD ?? this.penSessionPreviewPathD;
    if (!sourceD?.trim()) return null;
    return this.rootUserPathDToOutlineOverlayD(sourceD);
  }

  /** Semi-transparent ghost for path boolean preview (root user `d` → overlay pixels). */
  get pathBooleanPreviewOverlayD(): string | null {
    const d = this.pathBooleanPreview.previewRootUserD();
    if (!d?.trim()) return null;
    return this.rootUserPathDToOutlineOverlayD(d);
  }

  /** Blue bbox / union highlight: off during path node edit and whenever Pen is active (insert + idle). */
  get hideSelectionHighlightOverlay(): boolean {
    return this.isPathNodeEditModeActive || this.editorTool.getCurrentTool() === 'pen';
  }

  get pathNodeAnchorOverlays(): { cx: number; cy: number; selected: boolean; pathId: string; anchorIndex: number }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.anchors.map((anchor, anchorIndex) => {
        const overlay = this.pathNodeLocalPointToOverlay(pathState.pathId, anchor.x, anchor.y);
        return {
          cx: overlay.x,
          cy: overlay.y,
          selected:
            this.selectedPathNode?.pathId === pathState.pathId &&
            this.selectedPathNode.moveSegmentIndex === anchor.moveSegmentIndex,
          pathId: pathState.pathId,
          anchorIndex
        };
      })
    );
  }

  get pathNodeControlHandleOverlays(): {
    x1: number; y1: number; x2: number; y2: number; cx: number; cy: number; pathId: string; handleIndex: number
  }[] {
    if (!this.pathNodeEditState) return [];
    return this.pathNodeEditState.paths.flatMap((pathState) =>
      pathState.controlHandles
        .map((handle, handleIndex) => ({ handle, handleIndex }))
        .filter(
          ({ handle }) =>
            penSvgDistanceSq(
              { x: handle.anchorX, y: handle.anchorY },
              { x: handle.controlX, y: handle.controlY }
            ) >= PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ
        )
        .map(({ handle, handleIndex }) => {
          const anchor = this.pathNodeLocalPointToOverlay(pathState.pathId, handle.anchorX, handle.anchorY);
          const control = this.pathNodeLocalPointToOverlay(pathState.pathId, handle.controlX, handle.controlY);
          return {
            x1: anchor.x,
            y1: anchor.y,
            x2: control.x,
            y2: control.y,
            cx: control.x,
            cy: control.y,
            pathId: pathState.pathId,
            handleIndex
          };
        })
    );
  }

  // --- Shared selection/highlight state ---
  lastBbox: { x: number; y: number; width: number; height: number } | null = null;
  private _highlightRectCache: { x: number; y: number; width: number; height: number } | null = null;
  _highlightRectCacheKey = '';

  get highlightRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.isResizingSelection && this.resize.overlayRect) return this.resize.overlayRect;
    if (this.isSkewingSelection && this.skew.overlayRect) return this.skew.overlayRect;
    if (this.isRotatingSelection && this.rotate.unionStart && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
      return this.svgBboxToOverlayPixels(this.rotate.unionStart);
    }
    if (this.isDraggingShape && this.drag.overlayRect) return this.drag.overlayRect;
    if (!this.lastBbox || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this._highlightRectCache = null;
      this._highlightRectCacheKey = '';
      return null;
    }
    const idKey = this.shapeSelection.getSelectedShapes().map((s) => s.id).join(',');
    const key = `${this.lastBbox.x}-${this.lastBbox.y}-${this.lastBbox.width}-${this.lastBbox.height}-${this.wrapperWidth}-${this.wrapperHeight}-${this.canvasView.scale}-${this.canvasView.panX}-${this.canvasView.panY}-${this.svgManipulation.documentRevision()}-${idKey}`;
    if (this._highlightRectCacheKey === key) {
      return this._highlightRectCache;
    }
    this._highlightRectCacheKey = key;
    const fromDom = this.selectionHighlightOverlayFromDom();
    const resolved =
      fromDom ?? this.svgBboxToOverlayPixels(this.lastBbox);
    this._highlightRectCache = resolved;
    this.logSelectionHighlightRecompute(
      fromDom != null ? 'dom-union' : 'lastBbox-fallback',
      fromDom,
      resolved
    );
    return this._highlightRectCache;
  }

  private logSelectionHighlightRecompute(
    source: 'dom-union' | 'lastBbox-fallback',
    fromDom: { x: number; y: number; width: number; height: number } | null,
    resolvedOverlay: { x: number; y: number; width: number; height: number }
  ): void {
    const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    const svg = this.svgManipulation.getSVGInstance();
    const perId: Record<string, { left: number; top: number; width: number; height: number }> = {};
    if (svg) {
      for (const id of ids) {
        const el = svg.findOne(`#${id}`);
        const node = el?.node as unknown as SVGGraphicsElement | undefined;
        if (!node || typeof node.getBoundingClientRect !== 'function') {
          perId[id] = { left: NaN, top: NaN, width: NaN, height: NaN };
          continue;
        }
        const r = node.getBoundingClientRect();
        perId[id] = { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    }
    console.debug('[selection-highlight]', {
      source,
      selectedIds: ids,
      selectedCount: ids.length,
      fromDomOverlay: fromDom,
      lastBboxUserSpace: this.lastBbox,
      resolvedOverlay,
      fallbackWouldBeLastBboxMapping: source === 'lastBbox-fallback',
      perIdClientRect: perId,
      documentRevision: this.svgManipulation.documentRevision()
    });
  }

  private selectionHighlightOverlayFromDom(): { x: number; y: number; width: number; height: number } | null {
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const svg = this.svgManipulation.getSVGInstance();
    if (!overlayEl || !svg) return null;
    const ocr = overlayEl.getBoundingClientRect();
    if (ocr.width <= 0 || ocr.height <= 0) return null;
    const ids = this.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (ids.length === 0) return null;
    let minL = Infinity;
    let minT = Infinity;
    let maxR = -Infinity;
    let maxB = -Infinity;
    let any = false;
    for (const id of ids) {
      const el = svg.findOne(`#${id}`);
      const node = el?.node as unknown as SVGGraphicsElement | undefined;
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      any = true;
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    }
    if (!any || !Number.isFinite(minL)) return null;
    const w = maxR - minL;
    const h = maxB - minT;
    if (w <= 0 || h <= 0) return null;
    return {
      x: minL - ocr.left,
      y: minT - ocr.top,
      width: w,
      height: h
    };
  }

  get multiSelectionOutlineRects(): { x: number; y: number; width: number; height: number; id: string }[] {
    if (this.isDraggingShape || this.isResizingSelection || this.isRotatingSelection) return [];
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return [];
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length <= 1) return [];
    const overlayEl = this.highlightOverlayContainer()?.nativeElement;
    const svg = this.svgManipulation.getSVGInstance();
    if (!overlayEl || !svg) return [];
    const ocr = overlayEl.getBoundingClientRect();
    if (ocr.width <= 0 || ocr.height <= 0) return [];
    const out: { x: number; y: number; width: number; height: number; id: string }[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`);
      const node = el?.node as unknown as SVGGraphicsElement | undefined;
      if (!node || typeof node.getBoundingClientRect !== 'function') continue;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      out.push({
        id: s.id,
        x: r.left - ocr.left,
        y: r.top - ocr.top,
        width: r.width,
        height: r.height
      });
    }
    return out.length >= 2 ? out : [];
  }

  selectionRotateHighlightTransform(_hr: { x: number; y: number; width: number; height: number }): string {
    if (!this.isRotatingSelection || !this.rotate.pivotDoc) return '';
    const po = this.svgBboxToOverlayPixels({
      x: this.rotate.pivotDoc.x,
      y: this.rotate.pivotDoc.y,
      width: 0,
      height: 0
    });
    return `rotate(${radiansToDegrees(this.rotate.accumulatedRad)},${po.x},${po.y})`;
  }

  readonly selectionRotateHighlightTransformFn = (hr: { x: number; y: number; width: number; height: number }) =>
    this.selectionRotateHighlightTransform(hr);

  private _viewBoxOverlayRect: { x: number; y: number; width: number; height: number } | null = null;
  get viewBoxOverlayRect(): { x: number; y: number; width: number; height: number } | null {
    return this._viewBoxOverlayRect;
  }

  // --- Pan state ---
  private panStartClientX = 0;
  private panStartClientY = 0;
  private panStartX = 0;
  private panStartY = 0;

  get zoomMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    const r = this.zoomMarquee.rect;
    if (!r) return null;
    return { left: r.x, top: r.y, width: r.width, height: r.height };
  }

  get selectionMarqueeRect(): { left: number; top: number; width: number; height: number } | null {
    const r = this.selectionMarquee.rect;
    if (!r) return null;
    return { left: r.x, top: r.y, width: r.width, height: r.height };
  }

  drilledIntoGroupId: string | null = null;
  private pathNodeEditState: PathNodeEditState | null = null;
  private inlineTextEditState: InlineTextEditState | null = null;
  private inlineTextEditDraft = '';
  private selectedPathNode: PathNodeSelectionState | null = null;
  private pathNodeDragSession: PathNodeDragSession | null = null;
  private pathNodeDragJustEnded = false;
  private duplicateInvocationCount = 0;
  private duplicateSelectionKey = '';

  /**
   * Legacy fallback: pen insert on a path **without** shared `pathNodeEditState` drew anchors in-root via
   * {@link syncPenPostInsertAnchorOverlayDom}. When overlays already cover the path, this stays null.
   */
  private penPostInsertAnchorPathId: string | null = null;
  private penInsertCursorRaf = 0;
  private pendingPenInsertHoverClient: { x: number; y: number } | null = null;
  /**
   * After pen close → `node-edit-selector`, a trailing primary `click` often targets the root `<svg>`
   * (no `id`); `onCanvasClick` would clear selection and exit path-node edit. Pen finish calls
   * `armPenClosePostNodeEditEmptyClickSelectionGuard` to raise this deadline so both are skipped briefly.
   */
  private penClosePostNodeEditEmptyClickClearUntilMs = 0;

  /** Last pointer position in root SVG user space while the text tool is active (placement preview). */
  private textToolPreviewLastPoint: { x: number; y: number } | null = null;

  // --- SvgCanvasPointerGestureHost (pointer router seam) ---
  getPathNodeDragSession(): PathNodeDragSession | null {
    return this.pathNodeDragSession;
  }

  isPenToolWithActiveSession(): boolean {
    return this.editorTool.getCurrentTool() === 'pen' && this.isPenSessionActive;
  }

  isPenInsertOnPathDragActive(): boolean {
    return this.penTool.isPenInsertOnPathDragActive;
  }

  onPenDocumentMouseMove(event: MouseEvent): void {
    this.penTool.onDocumentMouseMovePen(event, (cx, cy, s) => this.getSnappedPenPoint(cx, cy, s));
  }

  onPenDocumentMouseUp(event: MouseEvent): void {
    this.penTool.onDocumentMouseUpPen(event);
  }

  applyPanDragFromEvent(event: MouseEvent): void {
    this.canvasView.setPan(
      this.panStartX + (event.clientX - this.panStartClientX),
      this.panStartY + (event.clientY - this.panStartClientY)
    );
  }

  clearPanningFlag(): void {
    this.isPanning = false;
  }

  get svgContentValue(): string | null | undefined {
    return this.svgContent();
  }

  get canvasViewInitialized(): boolean {
    return this.canvasView.isInitialized();
  }

  beginPanSession(event: MouseEvent): void {
    this.isPanning = true;
    this.panStartClientX = event.clientX;
    this.panStartClientY = event.clientY;
    this.panStartX = this.canvasView.panX;
    this.panStartY = this.canvasView.panY;
  }

  onCanvasPenPrimaryMouseDown(event: MouseEvent): boolean {
    return this.penTool.onCanvasPenPrimaryMouseDown(event, (cx, cy, s) => this.getSnappedPenPoint(cx, cy, s));
  }

  wouldPickUpPenOpenPathContinuationAt(event: MouseEvent): boolean {
    return this.penTool.wouldPickUpPenOpenPathContinuationAt(event);
  }

  isCreationToolActive(): boolean {
    return this.editorTool.isCreationTool();
  }

  getCurrentTool(): EditorTool {
    return this.editorTool.getCurrentTool();
  }

  hasPathNodeEditState(): boolean {
    return this.pathNodeEditState !== null;
  }

  clientToEditorSvgPointForDrag(clientX: number, clientY: number): { x: number; y: number } | null {
    return this.clientToEditorSvgPoint(clientX, clientY);
  }

  isShapeSelected(id: string): boolean {
    return this.shapeSelection.isShapeSelected(id);
  }

  getNearestGroupAncestorId(id: string): string | null {
    return this.svgManipulation.getNearestGroupAncestorId(id);
  }

  getSelectedShapeIds(): string[] {
    return this.shapeSelection.getSelectedShapes().map((s) => s.id);
  }

  // --- Keyboard shortcuts (policy in `svg-canvas-keyboard.controller.ts`) ---
  onKeyDown(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
    handleSvgCanvasKeyDown(this.buildSvgCanvasKeyboardContext(), event, this.editorTool);
  }

  /** Builds the keyboard **seam** for {@link handleSvgCanvasKeyDown} — keeps the **Canvas adapter** thin. */
  private buildSvgCanvasKeyboardContext(): SvgCanvasKeyboardContext {
    return {
      gestureRuntime: this.gestureRuntime,
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory,
      cdr: this.cdr,
      drag: this.drag,
      resize: this.resize,
      skew: this.skew,
      rotate: this.rotate,
      selectionMarquee: this.selectionMarquee,
      zoomMarquee: this.zoomMarquee,
      penTool: this.penTool,
      toolRegistry: this.toolRegistry,
      getSvgContent: () => this.svgContent(),
      getCurrentTool: () => this.editorTool.getCurrentTool(),
      isSelectorActive: () => this.editorTool.getCurrentTool() === 'selector',
      commitInlineTextEditIfActive: () => this.commitInlineTextEditIfActive(),
      shouldIgnoreKeyboardShortcuts: (e: KeyboardEvent) => this.shouldIgnoreKeyboardShortcuts(e),
      isDraggingShape: () => this.isDraggingShape,
      isResizingSelection: () => this.isResizingSelection,
      isSkewingSelection: () => this.isSkewingSelection,
      isRotatingSelection: () => this.isRotatingSelection,
      isSelectionMarquee: () => this.isSelectionMarquee,
      isZoomMarquee: () => this.isZoomMarquee,
      isPenSessionActive: () => this.isPenSessionActive,
      cancelActiveMarquees: () => this.cancelActiveMarquees(),
      exitPathNodeEditMode: () => this.exitPathNodeEditMode(),
      clearSelectionAndHighlight: () => {
        this.shapeSelection.clearSelection();
        this.svgManipulation.clearHighlight();
      },
      setDrilledIntoGroupId: (id: string | null) => {
        this.drilledIntoGroupId = id;
      },
      setTool: (tool: EditorTool) => this.editorTool.setTool(tool),
      markForCheck: () => this.cdr.markForCheck(),
      selectAllShapesFromDocument: () => this.selectAllShapesFromDocument(),
      copySelectionToClipboard: () => this.copySelectionToClipboard(),
      cutSelectionToClipboard: () => this.cutSelectionToClipboard(),
      pasteFromClipboard: () => this.pasteFromClipboard(),
      duplicateSelection: () => this.duplicateSelection(),
      groupSelectedShapes: () => this.groupSelectedShapes(),
      ungroupSelectedShape: () => this.ungroupSelectedShape(),
      zoomInAtViewportCenter: () => this.zoomInAtViewportCenter(),
      zoomOutAtViewportCenter: () => this.zoomOutAtViewportCenter(),
      resetZoomAndRefreshOverlay: () => {
        this.canvasView.resetZoom();
        this.updateViewBoxOverlayRect();
        this.cdr.detectChanges();
      },
      fitArtboardToViewport: () => this.fitArtboardToViewport(),
      fitContentToViewport: () => this.fitContentToViewport(),
      updateViewBoxOverlayRect: () => this.updateViewBoxOverlayRect(),
      getPathNodeEditState: () => this.pathNodeEditState,
      tryDeleteSelectedPathNode: () => this.tryDeleteSelectedPathNode(),
      handleAlignmentShortcut: (key: string) => this.handleAlignmentShortcut(key)
    };
  }

  onKeyUp(event: KeyboardEvent): void {
    this.altKeyPressed = event.altKey;
  }

  private getSmartGuideCandidates(): SnapCandidateShape[] {
    const items = this.svgManipulation.getLayerStackItems();
    const out: SnapCandidateShape[] = [];
    for (const item of items) {
      const bbox = this.svgManipulation.getShapeBBox(item.id);
      if (!bbox) continue;
      out.push({
        id: item.id,
        bbox: {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height
        }
      });
    }
    return out;
  }

  private shouldIgnoreKeyboardShortcuts(event: KeyboardEvent): boolean {
    const t = event.target;
    if (!t || !(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  private zoomInAtViewportCenter(): void {
    if (!this.canvasView.isInitialized() || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;
    const svgX = (this.wrapperWidth / 2 - this.canvasView.panX) / this.canvasView.scale;
    const svgY = (this.wrapperHeight / 2 - this.canvasView.panY) / this.canvasView.scale;
    this.canvasView.zoomInAt(svgX, svgY);
    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private zoomOutAtViewportCenter(): void {
    if (!this.canvasView.isInitialized() || this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;
    const svgX = (this.wrapperWidth / 2 - this.canvasView.panX) / this.canvasView.scale;
    const svgY = (this.wrapperHeight / 2 - this.canvasView.panY) / this.canvasView.scale;
    this.canvasView.zoomOutAt(svgX, svgY);
    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitDocumentToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) return;

    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(0, 0, svgWpx, svgHpx, vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION);
    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitArtboardToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const ab = this.svgManipulation.getArtboard();
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) return;

    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(0, 0, svgWpx, svgHpx, vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION);
    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private fitContentToViewport(): void {
    if (!this.canvasView.isInitialized()) return;
    this.syncOverlayViewBox();
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) return;

    const items = this.svgManipulation.getLayerStackItems();
    if (items.length === 0) return;

    const allIds = items.map((item) => item.id);
    const contentBbox = this.svgManipulation.getUnionBBox(allIds);
    if (!contentBbox || contentBbox.width <= 0 || contentBbox.height <= 0) return;

    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return;

    const overlayBbox = this.svgBboxToOverlayPixels(contentBbox);
    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;

    this.canvasView.zoomToFitRect(
      overlayBbox.x, overlayBbox.y,
      overlayBbox.width, overlayBbox.height,
      vw, vh, 64, INITIAL_LOAD_VIEWPORT_FIT_FRACTION
    );

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private cancelActiveMarquees(): void {
    let changed = false;
    if (this.isSelectionMarquee) {
      this.selectionMarquee.cancel();
      changed = true;
    }
    if (this.isZoomMarquee) {
      this.zoomMarquee.cancel();
      changed = true;
    }
    if (changed) this.cdr.detectChanges();
  }

  private selectAllShapesFromDocument(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const items = this.svgManipulation.getLayerStackItems();
    if (items.length === 0) return;
    const shapes: ShapeProperties[] = [];
    for (const item of items) {
      const el = svg.findOne(`#${item.id}`) as SVGElement | undefined;
      if (el) shapes.push(this.svgManipulation.getShapeProperties(el));
    }
    if (shapes.length === 0) return;
    const expanded = this.svgManipulation.expandSelectionByClipGroups(shapes);
    this.shapeSelection.selectShapes(expanded);
    this.svgManipulation.clearHighlight();
  }

  private getExpandedSelectedShapeIds(): string[] {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return [];
    const expanded = this.svgManipulation.expandSelectionByClipGroups(selected);
    const ids = expanded.map((shape) => shape.id);
    return this.svgManipulation.getShapeIdsInDomOrder(ids);
  }

  private copySelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    return true;
  }

  private cutSelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    const cmd = new RemoveShapesCommand(this.svgManipulation, ids, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private pasteFromClipboard(): boolean {
    const payload = this.clipboard.get();
    if (!payload || payload.shapes.length === 0) return false;
    const cmd = new PasteCommand(
      this.svgManipulation,
      payload,
      this.clipboard.nextPasteOffset(),
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private selectionTouchesLocked(shapeIds: string[]): boolean {
    return shapeIds.some((id) => this.svgManipulation.isElementOrAncestorLocked(id));
  }

  private duplicateSelection(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    this.duplicateInvocationCount += 1;
    const delta = this.duplicateInvocationCount * 10;
    const cmd = new DuplicateCommand(
      this.svgManipulation,
      ids,
      { dx: delta, dy: delta },
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  private handleAlignmentShortcut(key: string): boolean {
    const normalized = key.length === 1 ? key.toLowerCase() : key;
    switch (normalized) {
      case ALIGN_LEFT_SHORTCUT:
        return this.alignSelection('left');
      case ALIGN_RIGHT_SHORTCUT:
        return this.alignSelection('right');
      case ALIGN_TOP_SHORTCUT:
        return this.alignSelection('top');
      case ALIGN_CENTER_SHORTCUT:
        return this.alignSelection('center');
      case ALIGN_MIDDLE_SHORTCUT:
        return this.alignSelection('middle');
      case ALIGN_BOTTOM_SHORTCUT:
        return this.alignSelection('bottom');
      case DISTRIBUTE_HORIZONTAL_SHORTCUT:
        return this.distributeSelection('horizontal');
      case DISTRIBUTE_VERTICAL_SHORTCUT:
        return this.distributeSelection('vertical');
      default:
        return false;
    }
  }

  private alignSelection(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 2) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    this.editorHistory.pushAndExecute(new AlignCommand(this.svgManipulation, ids, direction));
    this.svgManipulation.clearHighlight();
    return true;
  }

  private distributeSelection(direction: 'horizontal' | 'vertical'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 3) return false;
    if (this.selectionTouchesLocked(ids)) return false;
    this.editorHistory.pushAndExecute(new DistributeCommand(this.svgManipulation, ids, direction));
    this.svgManipulation.clearHighlight();
    return true;
  }

  private groupSelectedShapes(): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    if (this.selectionTouchesLocked(ids)) return;
    const cmd = new GroupCommand(this.svgManipulation, ids);
    this.editorHistory.pushAndExecute(cmd);
    const newGroupId = cmd.createdGroupId;
    if (newGroupId) {
      const svg = this.svgManipulation.getSVGInstance();
      const groupEl = svg?.findOne(`#${newGroupId}`) as SVGElement | undefined;
      if (groupEl) {
        const groupProps = this.svgManipulation.getShapeProperties(groupEl);
        this.shapeSelection.selectShapes([groupProps]);
      }
    }
    this.drilledIntoGroupId = null;
  }

  private syncDrillAfterGroupStructureChange(payload: {
    movedElementIds: string[];
    targetGroupId?: string | null;
  }): void {
    if (!this.drilledIntoGroupId) return;

    const drilledId = this.drilledIntoGroupId;
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg?.findOne(`#${drilledId}`)) {
      this.drilledIntoGroupId = null;
      return;
    }

    if (payload.movedElementIds.includes(drilledId)) {
      this.drilledIntoGroupId = null;
      return;
    }

    if (payload.targetGroupId === drilledId) {
      return;
    }

    for (const movedId of payload.movedElementIds) {
      const movedNode = svg.findOne(`#${movedId}`)?.node as Element | undefined;
      const drilledNode = svg.findOne(`#${drilledId}`)?.node as Element | undefined;
      if (movedNode && drilledNode && drilledNode.contains(movedNode)) {
        return;
      }
    }

    const drilledNode = svg.findOne(`#${drilledId}`)?.node as Element | undefined;
    if (!drilledNode) {
      this.drilledIntoGroupId = null;
    }
  }

  private ungroupSelectedShape(): void {
    const selected = this.shapeSelection.getSelectedShapes();
    const groupIds = selected.filter((s) => s.type === 'g').map((s) => s.id);
    if (groupIds.length === 0) return;
    if (groupIds.some((id) => this.svgManipulation.isElementOrAncestorLocked(id))) return;

    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;

    const collectChildShapes = (childIds: string[]): void => {
      const childShapes: ShapeProperties[] = [];
      for (const id of childIds) {
        const el = svg.findOne(`#${id}`) as SVGElement | undefined;
        if (el) childShapes.push(this.svgManipulation.getShapeProperties(el));
      }
      if (childShapes.length > 0) {
        this.shapeSelection.selectShapes(childShapes);
      }
    };

    if (groupIds.length === 1) {
      const groupId = groupIds[0];
      const groupNode = svg.findOne(`#${groupId}`)?.node as Element | null;
      if (!groupNode || groupNode.tagName?.toLowerCase() !== 'g') return;
      const childIds: string[] = [];
      for (const child of Array.from(groupNode.children)) {
        if (child.id) childIds.push(child.id);
      }
      const cmd = new UngroupCommand(this.svgManipulation, groupId);
      this.editorHistory.pushAndExecute(cmd);
      collectChildShapes(childIds);
    } else {
      const cmd = new UngroupElementsCommand(this.svgManipulation, groupIds);
      this.editorHistory.pushAndExecute(cmd);
      collectChildShapes(cmd.ungroupedChildIds);
    }
    this.drilledIntoGroupId = null;
  }

  // --- Mouse event orchestration ---
  onDocumentMouseMove(event: MouseEvent): void {
    this.pointerGestureRouter.onDocumentMouseMove(this, event);
    this.refreshPointerIntentDebug(event.clientX, event.clientY);
  }

  onDocumentMouseUp(event: MouseEvent): void {
    this.pointerGestureRouter.onDocumentMouseUp(this, event);
  }

  commitZoomMarquee(): void {
    const viewportEl = this.zoomWrapper()?.nativeElement?.closest('.canvas-container') as HTMLElement | undefined;
    if (viewportEl && viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0) {
      this.wrapperWidth = viewportEl.clientWidth;
      this.wrapperHeight = viewportEl.clientHeight;
    }
    const rawRect = this.svgContainer()?.nativeElement?.getBoundingClientRect();
    if (rawRect && this.svgContent() && this.canvasView.isInitialized()) {
      const scale = this.canvasView.scale;
      const marqueeRect = this.zoomMarquee.toSvgRect(rawRect, scale);
      if (marqueeRect && !this.zoomMarquee.isTinyDrag() && marqueeRect.width > 0 && marqueeRect.height > 0 && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
        const { x, y, width, height } = marqueeRect;
        this.canvasView.zoomToFitRect(x, y, width, height, this.wrapperWidth, this.wrapperHeight);
        const wrapperEl = this.zoomWrapper()?.nativeElement;
        if (viewportEl && wrapperEl) {
          const wrapperRect = wrapperEl.getBoundingClientRect();
          const containerRect = viewportEl.getBoundingClientRect();
          this.canvasView.panX += containerRect.left - wrapperRect.left;
          this.canvasView.panY += containerRect.top - wrapperRect.top;
        }
        this.updateViewBoxOverlayRect();
        this.zoomMarquee.finish(true);
      } else {
        this.zoomMarquee.finish(false);
      }
    } else {
      this.zoomMarquee.finish(false);
    }
    this.cdr.detectChanges();
  }

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService,
    public editorTool: EditorToolService,
    public canvasView: CanvasViewService,
    private snap: SnapService,
    private cdr: ChangeDetectorRef,
    private editorHistory: EditorHistoryService,
    private clipboard: ClipboardService,
    protected drawingDefaults: DrawingStyleDefaultsService,
    private chromeEditorApply: ChromeEditorApplyService,
    private pathNodeEditBridge: PathNodeEditCommandBridgeService,
    private pathBooleanPreview: PathBooleanPreviewService,
    private toolRegistry: ToolRegistryService,
    private canvasBoundToolRegistrar: CanvasBoundToolRegistrar
  ) {
    const pointerStack = createSvgCanvasPointerStack({
      cdr: this.cdr,
      highlightOverlayContainer: this.highlightOverlayContainer,
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory,
      snap: this.snap,
      clientToEditorSvgPoint: (cx: number, cy: number) => this.clientToEditorSvgPoint(cx, cy),
      svgBboxToOverlayPixels: (bbox: Rect) => this.svgBboxToOverlayPixels(bbox),
      invalidateHighlightCache: () => {
        this._highlightRectCacheKey = '';
      },
      setLastBbox: (bbox: Rect | null) => {
        this.lastBbox = bbox;
      },
      getSmartGuideCandidates: () => this.getSmartGuideCandidates(),
      isSnapTemporarilyDisabled: () => this.altKeyPressed,
      createPenToolSessionPorts: () => this.createPenToolSessionPorts(),
      toolRegistry: this.toolRegistry,
      canvasBoundToolRegistrar: this.canvasBoundToolRegistrar,
      isCanvasReady: () => !!(this.svgContent() && this.canvasView.isInitialized())
    });
    this.drag = pointerStack.drag;
    this.resize = pointerStack.resize;
    this.rotate = pointerStack.rotate;
    this.skew = pointerStack.skew;
    this.creation = pointerStack.creation;
    this.selectionMarquee = pointerStack.selectionMarquee;
    this.zoomMarquee = pointerStack.zoomMarquee;
    this.gestureRuntime = pointerStack.gestureRuntime;
    this.pointerGestureRouter = pointerStack.pointerGestureRouter;
    this.penTool = pointerStack.penTool;
    this.editorChrome = new SvgCanvasEditorChromeFacade(this);

    effect(() => {
      this.pathBooleanPreview.previewRootUserD();
      this.pathBooleanPreview.previewOp();
      void this.canvasView.scale;
      void this.canvasView.panX;
      void this.canvasView.panY;
      void this.wrapperWidth;
      void this.wrapperHeight;
      this.cdr.markForCheck();
    });

    effect(() => {
      const incomingSvgContent = this.svgContent();
      const acceptedSvgContent = this.acceptedSvgContent();
      if (incomingSvgContent === acceptedSvgContent) return;
      if (
        this.editorTool.getCurrentTool() === 'pen' &&
        !this.penTool.confirmDiscardPenSessionIfNeeded('document replace/load')
      ) {
        return;
      }
      this.acceptedSvgContent.set(incomingSvgContent);
      this.rasterInsertAnchor.clear();
      this.canvasView.resetZoom();
    });
    effect(() => {
      const currentTool = this.editorTool.currentTool();
      if (this.isRevertingToolChange) {
        this.lastObservedTool = currentTool;
        return;
      }
      const previousTool = this.lastObservedTool;
      this.lastObservedTool = currentTool;
      if (
        previousTool === 'pen' &&
        currentTool !== 'pen' &&
        !this.penTool.confirmDiscardPenSessionIfNeeded('tool switch')
      ) {
        this.isRevertingToolChange = true;
        this.editorTool.setTool('pen');
        this.isRevertingToolChange = false;
        this.lastObservedTool = 'pen';
        return;
      }
      if (currentTool !== 'pen') {
        this.penTool.clearDrawingState();
      }
      if (previousTool !== currentTool) {
        this.toolRegistry.get(previousTool)?.onDeactivate();
        this.toolRegistry.get(currentTool)?.onActivate(this.createCanvasToolHost());
      }
      if (!this.toolKeepsOrBuildsPathNodeTopology(currentTool)) {
        this.exitPathNodeEditMode();
      }
    });
    effect(() => {
      this.editorHistory.revision();
      this.drilledIntoGroupId = null;
      if (this.pathNodeEditState) {
        const selectedPathIds = this.shapeSelection
          .selectedShapes()
          .map((shape) => shape.id)
          .filter((id) => this.isPathElementId(id));
        if (selectedPathIds.length === 0) {
          this.exitPathNodeEditMode();
        } else {
          this.enterPathNodeEditMode(selectedPathIds, this.pathNodeEditState.activePathId ?? selectedPathIds[0]);
        }
      }
      setTimeout(() => this.syncSelectionFromDom(), 0);
    });
    effect(() => {
      this.snap.setGridEnabled(this.editorTool.isGridSnapEnabled());
      this.snap.setShapeEnabled(this.editorTool.isShapeSnapEnabled());
    });
    effect(() => {
      const shapes = this.shapeSelection.selectedShapes();
      const duplicateKey = shapes.map((shape) => shape.id).sort().join('|');
      if (duplicateKey !== this.duplicateSelectionKey) {
        this.duplicateSelectionKey = duplicateKey;
        this.duplicateInvocationCount = 0;
      }
      if (
        this.pathNodeEditState &&
        !shapes.some((shape) => this.pathNodeEditState?.paths.some((state) => state.pathId === shape.id))
      ) {
        this.exitPathNodeEditMode();
      }
      setTimeout(() => {
        if (shapes.length === 0) {
          this.lastBbox = null;
          this._highlightRectCache = null;
          this._highlightRectCacheKey = '';
        } else {
          this.syncOverlayViewBox();
          const ids = shapes.map((s) => s.id);
          const unionBbox = this.svgManipulation.getUnionBBox(ids);
          this.lastBbox = unionBbox;
          if (unionBbox) {
            this._highlightRectCacheKey = '';
          } else {
            this._highlightRectCache = null;
            this._highlightRectCacheKey = '';
          }
        }
        this.cdr.markForCheck();
      }, 0);
    });
    effect(() => {
      void this.editorTool.currentTool();
      void this.drawingDefaults.defaults();
      void this.editorHistory.revision();
      void this.svgContent();
      this.syncTextToolPreviewPresentation();
      if (this.editorTool.getCurrentTool() !== 'pen') {
        this.clearPenInsertHostCursor();
      }
    });
    effect(() => {
      void this.editorHistory.revision();
      if (this.penPostInsertAnchorPathId) {
        this.syncPenPostInsertAnchorOverlayDom();
      }
    });
    effect(() => {
      const currentTool = this.editorTool.currentTool();
      const shapes = this.shapeSelection.selectedShapes();
      if (!this.isNodeEditSelectorTool(currentTool) && currentTool !== 'pen') return;
      const pathIds = shapes
        .map((shape) => shape.id)
        .filter((id) => this.isPathElementId(id));
      if (pathIds.length === 0) {
        this.exitPathNodeEditMode();
        return;
      }
      const activePathId = this.pathNodeEditState?.activePathId;
      const shouldRefresh =
        !this.pathNodeEditState ||
        pathIds.length !== this.pathNodeEditState.paths.length ||
        pathIds.some((id) => !this.pathNodeEditState?.paths.some((state) => state.pathId === id));
      if (shouldRefresh) {
        this.enterPathNodeEditMode(pathIds, activePathId ?? pathIds[0]);
      }
    });
    effect(() => {
      const acceptedSvgContent = this.acceptedSvgContent();
      if (acceptedSvgContent && this.svgContainer()?.nativeElement) {
        setTimeout(() => this.initializeSVG(acceptedSvgContent), 0);
      }
    });
    this.pathNodeEditBridge.register({
      convertSelectedAnchorToCorner: () =>
        this.tryApplyPathNodeAnchorCornerFromBridge() ? { ok: true } : { ok: false },
      convertSelectedAnchorToMirrorCubic: () =>
        this.tryApplyPathNodeMirrorCubicFromBridge() ? { ok: true } : { ok: false },
      convertSelectedAnchorToIndependentHandles: () =>
        this.tryApplyPathNodeIndependentHandlesFromBridge() ? { ok: true } : { ok: false }
    });
    effect(() => {
      void this.editorTool.currentTool();
      void this.shapeSelection.selectedShapes();
      void this.editorHistory.revision();
      this.syncPathNodeEditBridgeChrome();
    });
  }

  private boundOnWheel = this.onWheel.bind(this);

  ngOnInit(): void {
    this.chromeEditorApply.afterGroupStructureChange = (payload) =>
      this.syncDrillAfterGroupStructureChange(payload);
  }

  ngOnDestroy(): void {
    this.chromeEditorApply.afterGroupStructureChange = null;
    if (this.penInsertCursorRaf !== 0) {
      window.cancelAnimationFrame(this.penInsertCursorRaf);
      this.penInsertCursorRaf = 0;
    }
    this.clearPenInsertHostCursor();
    this.clearPenPostInsertAnchorOverlay();
    this.penTool.dispose();
    this.clearPathNodeEditFeedback();
    this.pathNodeEditBridge.register(null);
    const el = this.canvasViewport()?.nativeElement;
    if (el) {
      el.removeEventListener('wheel', this.boundOnWheel);
    }
  }

  private armPenClosePostNodeEditEmptyClickSelectionGuard(): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Cover trailing primary `click` / `dblclick` after close (mousedown-only double-close, slow frames).
    this.penClosePostNodeEditEmptyClickClearUntilMs = now + 320;
  }

  private createCanvasToolHost(): CanvasToolHost {
    return {
      markForCheck: () => this.cdr.markForCheck(),
      getCurrentTool: () => this.editorTool.getCurrentTool(),
      setTool: (tool) => this.editorTool.setTool(tool),
      clientToEditorSvgPoint: (clientX, clientY) => this.clientToEditorSvgPoint(clientX, clientY),
      getMainSvgElement: () =>
        this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null,
      isEditorContentShapeTarget: (target) => !!(target && this.isEditorContentShapeTarget(target)),
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory
    };
  }

  private createPenToolSessionPorts(): PenToolSessionPorts {
    return {
      markForCheck: () => this.cdr.markForCheck(),
      getCurrentTool: () => this.editorTool.getCurrentTool(),
      isPenAltCurveMode: () => this.editorTool.isPenAltCurveMode(),
      setPenAltCurveMode: (enabled) => this.editorTool.setPenAltCurveMode(enabled),
      setTool: (tool) => this.editorTool.setTool(tool),
      clientToEditorSvgPoint: (clientX, clientY) => this.clientToEditorSvgPoint(clientX, clientY),
      svgBboxToOverlayPixels: (bbox) => this.svgBboxToOverlayPixels(bbox),
      parseOverlayViewBox: () => this.parseOverlayViewBox(),
      getMainSvgElement: () =>
        this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null,
      confirmDiscardInProgressPath: (reason) =>
        typeof window === 'undefined' ||
        window.confirm(`Discard the current in-progress pen path before ${reason}?`),
      svgManipulation: this.svgManipulation,
      shapeSelection: this.shapeSelection,
      editorHistory: this.editorHistory,
      penBackspaceShortcutShouldDefer: () =>
        !!(this.pathNodeEditState || this.inlineTextEditState),
      setLastBbox: (bbox) => {
        this.lastBbox = bbox;
      },
      clearHighlightRectCache: () => {
        this._highlightRectCacheKey = '';
      },
      isEditorContentShapeTarget: (target) => !!(target && this.isEditorContentShapeTarget(target)),
      getPenPathInsertToleranceSvg: () => this.getPenPathInsertToleranceSvg(),
      getPathDForId: (pathId: string) => {
        const svg = this.svgManipulation.getSVGInstance();
        const d = svg?.findOne(`#${pathId}`)?.attr('d');
        return typeof d === 'string' ? d : null;
      },
      commitPenInsertOnExistingPath: (pathId, oldD, newD, insertedMoveSegIndex) =>
        this.commitPenInsertOnExistingPath(pathId, oldD, newD, insertedMoveSegIndex),
      clearPenPostInsertAnchorOverlay: () => this.clearPenPostInsertAnchorOverlay(),
      clearSelectionForPenBackgroundStroke: () => {
        this.shapeSelection.clearSelection();
        this.svgManipulation.clearHighlight();
        this.drilledIntoGroupId = null;
      },
      isCanvasReadyForPenInput: () => !!(this.svgContent() && this.canvasView.isInitialized()),
      armPenClosePostNodeEditEmptyClickSelectionGuard: () =>
        this.armPenClosePostNodeEditEmptyClickSelectionGuard()
    };
  }

  ngAfterViewInit(): void {
    const el = this.canvasViewport()?.nativeElement;
    if (el) {
      el.addEventListener('wheel', this.boundOnWheel, { passive: false });
    }
    const acceptedSvgContent = this.acceptedSvgContent();
    if (acceptedSvgContent) {
      this.initializeSVG(acceptedSvgContent);
    }
  }

  private onWheel(event: WheelEvent): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) return;

    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = this.svgContainer()!.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (!point) return;
      const factor = Math.pow(1.002, -event.deltaY);
      this.canvasView.zoomByAt(factor, point.x, point.y);
    } else if (event.shiftKey) {
      const dx = event.deltaX || event.deltaY;
      this.canvasView.panBy(-dx, 0);
    } else {
      this.canvasView.panBy(-event.deltaX, -event.deltaY);
    }

    this.updateViewBoxOverlayRect();
    this.cdr.detectChanges();
  }

  private syncOverlayViewBox(): void {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      this._viewBoxOverlayRect = null;
      return;
    }
    const vb = mainSvg.getAttribute('viewBox');
    if (vb) {
      this.overlayViewBox = vb;
    } else {
      const w = mainSvg.getAttribute('width') || mainSvg.clientWidth || 100;
      const h = mainSvg.getAttribute('height') || mainSvg.clientHeight || 100;
      const width = typeof w === 'string' && w.endsWith('%') ? 100 : Number(w) || 100;
      const height = typeof h === 'string' && h.endsWith('%') ? 100 : Number(h) || 100;
      this.overlayViewBox = `0 0 ${width} ${height}`;
    }
    const el = this.zoomWrapper()?.nativeElement;
    const viewportRef = this.canvasViewport()?.nativeElement;
    const viewportEl =
      (this.svgContent() && viewportRef && viewportRef.clientWidth > 0 && viewportRef.clientHeight > 0
        ? viewportRef
        : el?.closest('.canvas-container')) as HTMLElement | undefined;
    if (viewportEl && viewportEl.clientWidth > 0 && viewportEl.clientHeight > 0) {
      this.wrapperWidth = viewportEl.clientWidth;
      const rulerLeftEl = this.rulerLeft()?.nativeElement;
      this.wrapperHeight =
        rulerLeftEl && rulerLeftEl.clientHeight > 0
          ? rulerLeftEl.clientHeight
          : viewportEl.clientHeight;
      if (this.svgContent() && el?.parentElement) {
        const viewportRect = viewportEl.getBoundingClientRect();
        const innerRect = el.parentElement.getBoundingClientRect();
        this.rulerOriginOffsetX = innerRect.left - viewportRect.left;
        this.rulerOriginOffsetY = innerRect.top - viewportRect.top;
      } else {
        this.rulerOriginOffsetX = 0;
        this.rulerOriginOffsetY = 0;
      }
    } else if (el && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
      this.wrapperWidth = el.offsetWidth;
      this.wrapperHeight = el.offsetHeight;
      this.rulerOriginOffsetX = 0;
      this.rulerOriginOffsetY = 0;
    }
    if (this.svgManipulation.getSVGInstance() && this.wrapperWidth > 0 && this.wrapperHeight > 0) {
      const vb = this.svgManipulation.getDocumentViewBox();
      const parts = vb.split(/\s+/);
      if (parts.length >= 4) {
        const x = Number(parts[0]) || 0;
        const y = Number(parts[1]) || 0;
        const w = Number(parts[2]) || 100;
        const h = Number(parts[3]) || 100;
        const bbox = { x, y, width: w, height: h };
        setTimeout(() => {
          this._viewBoxOverlayRect = this.svgBboxToOverlayPixels(bbox);
          this.cdr.markForCheck();
        }, 0);
        return;
      }
    }
    this._viewBoxOverlayRect = null;
  }

  private updateViewBoxOverlayRect(): void {
    this.syncOverlayViewBox();
  }

  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const parts = this.overlayViewBox.split(/\s+/);
    const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
    const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
    const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
    const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
    const canvasScale = this.canvasView.scale;
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      const sx = (this.wrapperWidth * canvasScale) / vbW;
      const sy = (this.wrapperHeight * canvasScale) / vbH;
      return { x: (bbox.x - vbMinX) * sx, y: (bbox.y - vbMinY) * sy, width: bbox.width * sx, height: bbox.height * sy };
    }
    const wrapperRect = this.zoomWrapper()?.nativeElement?.getBoundingClientRect();
    const svgRect = mainSvg.getBoundingClientRect();
    let viewportW = svgRect.width;
    let viewportH = svgRect.height;
    let svgLeftInWrapper = 0;
    let svgTopInWrapper = 0;
    const usingVisualRects = Boolean(wrapperRect && viewportW > 0 && viewportH > 0);
    if (!usingVisualRects) {
      viewportW = this.wrapperWidth;
      viewportH = this.wrapperHeight;
    } else {
      svgLeftInWrapper = svgRect.left - wrapperRect!.left;
      svgTopInWrapper = svgRect.top - wrapperRect!.top;
    }
    const par = mainSvg.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
    const isNone = par.split(/\s+/)[0] === 'none';
    let scaleFit: number;
    let offsetX: number;
    let offsetY: number;
    if (isNone) {
      const sx = (viewportW * (usingVisualRects ? 1 : canvasScale)) / vbW;
      const sy = (viewportH * (usingVisualRects ? 1 : canvasScale)) / vbH;
      const px = svgLeftInWrapper + (bbox.x - vbMinX) * (viewportW / vbW);
      const py = svgTopInWrapper + (bbox.y - vbMinY) * (viewportH / vbH);
      return { x: usingVisualRects ? px : px * canvasScale, y: usingVisualRects ? py : py * canvasScale, width: bbox.width * sx, height: bbox.height * sy };
    }
    scaleFit = Math.min(viewportW / vbW, viewportH / vbH);
    const align = par.split(/\s+/)[0].toLowerCase();
    const contentW = scaleFit * vbW;
    const contentH = scaleFit * vbH;
    if (align.includes('xmin')) offsetX = 0;
    else if (align.includes('xmid')) offsetX = (viewportW - contentW) / 2;
    else offsetX = viewportW - contentW;
    if (align.includes('ymin')) offsetY = 0;
    else if (align.includes('ymid')) offsetY = (viewportH - contentH) / 2;
    else offsetY = viewportH - contentH;
    const viewportX = offsetX + (bbox.x - vbMinX) * scaleFit;
    const viewportY = offsetY + (bbox.y - vbMinY) * scaleFit;
    if (usingVisualRects) {
      return { x: svgLeftInWrapper + viewportX, y: svgTopInWrapper + viewportY, width: bbox.width * scaleFit, height: bbox.height * scaleFit };
    }
    const x = (svgLeftInWrapper + viewportX) * canvasScale;
    const y = (svgTopInWrapper + viewportY) * canvasScale;
    const w = bbox.width * scaleFit * canvasScale;
    const h = bbox.height * scaleFit * canvasScale;
    return { x, y, width: w, height: h };
  }

  private parseOverlayViewBox(): { vbMinX: number; vbMinY: number; vbW: number; vbH: number } | null {
    const parts = this.overlayViewBox.split(/\s+/);
    if (parts.length < 4) return null;
    return {
      vbMinX: Number(parts[0]) || 0,
      vbMinY: Number(parts[1]) || 0,
      vbW: Number(parts[2]) || 100,
      vbH: Number(parts[3]) || 100
    };
  }

  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return null;
    const fromCtm = screenPointToRootSvgUserPoint(mainSvg, clientX, clientY);
    if (fromCtm) return fromCtm;
    const vb = this.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return null;
    const { vbMinX, vbMinY, vbW, vbH } = vb;
    return {
      x: vbMinX + ((clientX - r.left) / r.width) * vbW,
      y: vbMinY + ((clientY - r.top) / r.height) * vbH
    };
  }

  private syncSelectionFromDom(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return;
    const refreshed = selected.map((s) => {
      const el = svg.findOne(`#${s.id}`) as SVGElement | undefined;
      return el ? this.svgManipulation.getShapeProperties(el) : s;
    });
    this.shapeSelection.selectShapes(refreshed);
    const ids = refreshed.map((s) => s.id);
    const unionBbox = this.svgManipulation.getUnionBBox(ids);
    if (unionBbox) {
      this.lastBbox = unionBbox;
      this._highlightRectCacheKey = '';
    }
    this.cdr.detectChanges();
  }

  private initializeSVG(svgContent: string): void {
    this.destroyTextToolPreview();
    this.editorHistory.clear();
    this.selectionMarquee.cancel();
    this.zoomMarquee.cancel();
    this.exitPathNodeEditMode();
    this.svgManipulation.initializeSVG(this.svgContainer()!.nativeElement, svgContent);
    this.canvasView.init();
    this.syncOverlayViewBox();
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length > 0) {
      const ids = shapes.map((s) => s.id);
      this.lastBbox = this.svgManipulation.getUnionBBox(ids);
    } else {
      this.lastBbox = null;
    }
    this._highlightRectCacheKey = '';
    if (svgContent.includes('svg-editor-test-icon')) {
      queueMicrotask(() => this.applyInitialFitToViewport());
    }
  }

  private applyInitialFitToViewport(attempt = 0): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) {
      return;
    }
    if (this.wrapperWidth <= 0 || this.wrapperHeight <= 0) {
      this.syncOverlayViewBox();
    }
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) {
      return;
    }
    const vw = this.wrapperWidth;
    const vh = this.wrapperHeight;
    if (vw <= 0 || vh <= 0) {
      if (attempt < 4) {
        requestAnimationFrame(() => this.applyInitialFitToViewport(attempt + 1));
      }
      return;
    }

    const wAttr = mainSvg.getAttribute('width');
    const hAttr = mainSvg.getAttribute('height');
    const svgWpx = wAttr && !wAttr.endsWith('%') ? Number(wAttr) : mainSvg.clientWidth || 0;
    const svgHpx = hAttr && !hAttr.endsWith('%') ? Number(hAttr) : mainSvg.clientHeight || 0;
    if (!Number.isFinite(svgWpx) || !Number.isFinite(svgHpx) || svgWpx <= 0 || svgHpx <= 0) {
      return;
    }

    const layoutOffsetX = (vw - svgWpx) / 2;
    const layoutOffsetY = (vh - svgHpx) / 2;

    this.canvasView.zoomToFitRect(
      0,
      0,
      svgWpx,
      svgHpx,
      vw,
      vh,
      64,
      INITIAL_LOAD_VIEWPORT_FIT_FRACTION
    );

    this.canvasView.panX -= layoutOffsetX;
    this.canvasView.panY -= layoutOffsetY;

    this.cdr.markForCheck();
    setTimeout(() => {
      this.updateViewBoxOverlayRect();
      this.cdr.markForCheck();
    }, 0);
  }

  /** Raster drag-drop (e4s.5): allow drop only when a document is loaded and the drag carries files. */
  onCanvasRasterDragOver(event: DragEvent): void {
    if (!this.svgContent() || this.svgManipulation.getSVGInstance() == null) return;
    if (!this.canvasRasterDragHasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }

  onCanvasRasterDrop(event: DragEvent): void {
    void this.handleCanvasRasterDrop(event);
  }

  private async handleCanvasRasterDrop(event: DragEvent): Promise<void> {
    if (!this.svgContent() || this.svgManipulation.getSVGInstance() == null) return;
    const dt = event.dataTransfer;
    if (!dt || !this.canvasRasterDragHasFiles(dt)) return;
    event.preventDefault();
    const anchor = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!anchor) return;
    const files = dt.files;
    if (!files?.length) return;

    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) continue;
      const result = await this.rasterImageInsert.insertRasterFileAtAnchor(file, anchor, {
        silentDisallowedMime: true
      });
      if (result.kind === 'failed') {
        window.alert(result.message);
        break;
      }
    }
    this.cdr.markForCheck();
  }

  /** True when the drag payload may include local files (see `DataTransfer.types` / `files`). */
  private canvasRasterDragHasFiles(dt: DataTransfer | null): boolean {
    if (!dt) return false;
    if (dt.types?.includes('Files')) return true;
    return (dt.files?.length ?? 0) > 0;
  }

  private tryDispatchRegisteredCanvasClick(event: MouseEvent): boolean {
    const tool = this.toolRegistry.get(this.editorTool.getCurrentTool());
    if (!tool?.onClick) return false;
    const svgPoint = this.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!svgPoint) return false;
    return tool.onClick(event, svgPoint);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pen' && event.button === 2) {
      this.penTool.onPenRightMouseDown();
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    this.pointerGestureRouter.onCanvasMouseDownPrimary(this, event);
  }

  onCanvasClick(event: MouseEvent): void {
    const clickTarget = event.target as Element;
    if (this.inlineTextEditState && !this.isInlineTextEditTarget(clickTarget)) {
      this.commitInlineTextEditIfActive();
    }
    if (this.pathNodeDragJustEnded) {
      this.pathNodeDragJustEnded = false;
      return;
    }
    if (this.drag.consumeJustEnded()) return;
    if (this.resize.consumeJustEnded()) return;
    if (this.skew.consumeJustEnded()) return;
    if (this.rotate.consumeJustEnded()) return;
    if (this.creation.consumeJustEnded()) return;
    const svgInstanceForClick = this.svgManipulation.getSVGInstance();
    const clickedContentShapeEl =
      clickTarget.id && (svgInstanceForClick?.findOne(`#${clickTarget.id}`) as SVGElement);
    const emptyHitNoResolvedShape = !clickedContentShapeEl;
    if (this.pathNodeEditState && !this.isPathNodeEditTarget(clickTarget)) {
      if (this.editorTool.getCurrentTool() !== 'pen') {
        const nowForPenCloseGuard =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
        const skipExitForTrailingPenCloseClick =
          nowForPenCloseGuard < this.penClosePostNodeEditEmptyClickClearUntilMs &&
          emptyHitNoResolvedShape;
        if (!skipExitForTrailingPenCloseClick) {
          this.exitPathNodeEditMode();
        }
      }
    }
    if (this.tryDispatchRegisteredCanvasClick(event)) {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pan') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'pen') {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'text') {
      this.createTextAtPoint(event.clientX, event.clientY);
      return;
    }
    if (this.editorTool.isCreationTool()) {
      return;
    }
    if (this.editorTool.getCurrentTool() === 'zoom') {
      if (this.zoomMarquee.consumeJustEnded()) {
        return;
      }
      if (!this.svgContent() || !this.canvasView.isInitialized()) return;
      const rect = this.svgContainer()!.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (point) {
        if (event.altKey) {
          this.canvasView.zoomOutAt(point.x, point.y);
        } else {
          this.canvasView.zoomInAt(point.x, point.y);
        }
        setTimeout(() => {
          this.updateViewBoxOverlayRect();
          this.cdr.detectChanges();
        }, 0);
      }
      return;
    }

    if (this.editorTool.getCurrentTool() === 'eyedropper') {
      this.tryEyedropperSample(event);
      return;
    }

    if (this.selectionMarquee.consumeJustEnded()) {
      return;
    }

    const svgInstance = svgInstanceForClick;
    const svgElement = clickedContentShapeEl;
    if (svgElement) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      const nearestGroupId = this.svgManipulation.getNearestGroupAncestorId(clickTarget.id);
      const groupIsClipCarrier = nearestGroupId ? this.isGroupAClipMaskCarrier(nearestGroupId) : false;

      if (nearestGroupId && !groupIsClipCarrier) {
        if (this.drilledIntoGroupId === nearestGroupId) {
          const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(svgElement);
          if (additive) {
            this.shapeSelection.toggleShapeGroupInSelection(expanded);
          } else {
            this.shapeSelection.selectShapes(expanded);
          }
        } else {
          const groupEl = svgInstance?.findOne(`#${nearestGroupId}`) as SVGElement | undefined;
          if (groupEl) {
            const groupProps = this.svgManipulation.getShapeProperties(groupEl);
            if (additive) {
              this.shapeSelection.toggleShapeGroupInSelection([groupProps]);
            } else {
              this.shapeSelection.selectShapes([groupProps]);
            }
            this.drilledIntoGroupId = null;
          }
        }
      } else {
        const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(svgElement);
        if (additive) {
          this.shapeSelection.toggleShapeGroupInSelection(expanded);
        } else {
          this.shapeSelection.selectShapes(expanded);
        }
      }
    } else {
      // Pen may finish on mousedown/mouseup; the following primary `click` can target the root SVG
      // (no `id`) and would clear selection — see `pen-tool-session-finish.ts` + guard below.
      const now =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      if (now < this.penClosePostNodeEditEmptyClickClearUntilMs) {
        // Skip clearSelection only; still drop drill/highlight parity with empty hit.
      } else {
        this.shapeSelection.clearSelection();
      }
      this.svgManipulation.clearHighlight();
      this.drilledIntoGroupId = null;
    }
  }

  private createTextAtPoint(clientX: number, clientY: number): void {
    if (!this.svgContent()) return;
    this.destroyTextToolPreview();
    const point = this.clientToEditorSvgPoint(clientX, clientY) ?? { x: clientX, y: clientY };
    const newId = this.svgManipulation.addShape('text', {
      x: point.x,
      y: point.y,
      textContent: 'Text'
    });
    if (!newId) return;

    const svgInstance = this.svgManipulation.getSVGInstance();
    const el = svgInstance?.findOne(`#${newId}`) as SVGElement | undefined;
    if (el) {
      this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    }
    const cmd = new AddShapeCommand(this.svgManipulation, newId, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    const shapeBbox = this.svgManipulation.getShapeBBox(newId);
    if (shapeBbox) {
      this.lastBbox = shapeBbox;
      this._highlightRectCacheKey = '';
    }
    this.editorTool.setTool('selector');
    this.openTextEditPrompt(newId);
    this.cdr.markForCheck();
  }

  /**
   * Minimal edit path for newly created text until a dedicated inline editor lands.
   */
  private openTextEditPrompt(shapeId: string): void {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
    const svgInstance = this.svgManipulation.getSVGInstance();
    const shape = svgInstance?.findOne(`#${shapeId}`) as SVGElement | undefined;
    const node = shape?.node as SVGTextElement | undefined;
    if (!node || node.tagName.toLowerCase() !== 'text') return;
    const currentText = node.textContent ?? 'Text';
    const nextText = window.prompt('Edit text', currentText);
    if (nextText === null || nextText === currentText) return;
    this.svgManipulation.updateTextContent(shapeId, nextText);
  }

  onCanvasDoubleClick(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'pen') return;
    if (this.editorTool.getCurrentTool() !== 'selector') return;
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const selectedId = selected[0].id;
    const svgInstance = this.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const selectedEl = svgInstance.findOne(`#${selectedId}`)?.node as Element | null;
    if (!selectedEl) return;

    const selectedTag = selectedEl.tagName?.toLowerCase();
    if (selectedTag === 'text' || selectedTag === 'tspan') {
      const resolvedTextId =
        selectedTag === 'text'
          ? selectedId
          : (selectedEl.closest('text') as Element | null)?.id ?? null;
      if (!resolvedTextId) return;
      this.enterInlineTextEditMode(resolvedTextId);
      return;
    }
    if (selectedTag !== 'g') return;

    this.drilledIntoGroupId = selectedId;

    const clickTarget = event.target as Element;
    if (clickTarget.id) {
      const childEl = svgInstance.findOne(`#${clickTarget.id}`) as SVGElement | undefined;
      if (childEl) {
        const expanded = this.svgManipulation.getShapePropertiesInSameClipGroup(childEl);
        this.shapeSelection.selectShapes(expanded);
      }
    }
  }

  onInlineTextEditInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.inlineTextEditDraft = target?.value ?? '';
  }

  private enterInlineTextEditMode(textId: string): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length !== 1) return;
    const text = this.svgManipulation.getTextContent(textId);
    if (text === null) return;
    this.inlineTextEditState = {
      textId,
      originalText: text
    };
    this.inlineTextEditDraft = text;
    this.cdr.markForCheck();
    setTimeout(() => {
      const input = this.inlineTextEditor()?.nativeElement;
      if (!input) return;
      input.focus();
      input.select();
    }, 0);
  }

  private commitInlineTextEditIfActive(): boolean {
    if (!this.inlineTextEditState) return false;
    const { textId, originalText } = this.inlineTextEditState;
    const nextText = this.inlineTextEditDraft;
    if (nextText !== originalText) {
      const cmd = new TextContentCommand(this.svgManipulation, textId, originalText, nextText);
      this.editorHistory.pushAndExecute(cmd);
    }
    this.inlineTextEditState = null;
    this.inlineTextEditDraft = '';
    this.cdr.markForCheck();
    return true;
  }

  private isInlineTextEditTarget(target: Element | null): boolean {
    if (!target) return false;
    const editor = this.inlineTextEditor()?.nativeElement;
    return !!editor && (target === editor || editor.contains(target));
  }

  private getSnappedPenPoint(
    clientX: number,
    clientY: number,
    suspendSnap: boolean
  ): { x: number; y: number } | null {
    const raw = this.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return null;
    if (suspendSnap) return raw;

    const gridSnapped = this.snap.snapToGrid(raw);
    if (!this.snap.shapeEnabled()) return gridSnapped;

    const guideResult = this.snap.snapDeltaToSmartGuides(
      { x: gridSnapped.x, y: gridSnapped.y, width: 0, height: 0 },
      { x: 0, y: 0 },
      this.getSmartGuideCandidates()
    );
    return {
      x: gridSnapped.x + guideResult.delta.x,
      y: gridSnapped.y + guideResult.delta.y
    };
  }

  private showPathNodeEditFeedback(message: string): void {
    this.pathNodeEditFeedbackMessage = message;
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
    }
    this.pathNodeEditFeedbackTimer = setTimeout(() => {
      this.pathNodeEditFeedbackMessage = null;
      this.pathNodeEditFeedbackTimer = null;
      this.cdr.markForCheck();
    }, PATH_NODE_EDIT_FEEDBACK_DURATION_MS);
    this.cdr.markForCheck();
  }

  private clearPathNodeEditFeedback(): void {
    if (this.pathNodeEditFeedbackTimer) {
      clearTimeout(this.pathNodeEditFeedbackTimer);
      this.pathNodeEditFeedbackTimer = null;
    }
    if (this.pathNodeEditFeedbackMessage === null) return;
    this.pathNodeEditFeedbackMessage = null;
    this.cdr.markForCheck();
  }

  private enterPathNodeEditMode(pathIds: string[], preferredPathId?: string): void {
    const states: PathNodeEditPathState[] = [];
    let lastReason: string | null = null;
    for (const pathId of pathIds) {
      const build = this.buildPathNodeEditState(pathId);
      if (build.state) {
        states.push(build.state);
      } else if (build.reason) {
        lastReason = build.reason;
      }
    }
    if (states.length === 0) {
      this.pathNodeEditState = null;
      this.selectedPathNode = null;
      this.pathNodeDragSession = null;
      this.pathNodeDragJustEnded = false;
      if (lastReason) {
        this.showPathNodeEditFeedback(lastReason);
      } else {
        this.clearPathNodeEditFeedback();
      }
      this.syncPathNodeEditBridgeChrome();
      this.cdr.markForCheck();
      return;
    }
    const activePathId = states.some((state) => state.pathId === preferredPathId)
      ? (preferredPathId as string)
      : states[0].pathId;
    this.pathNodeEditState = { paths: states, activePathId };
    this.selectedPathNode = null;
    this.drilledIntoGroupId = null;
    this.clearPathNodeEditFeedback();
    this.syncPenPostInsertAnchorOverlayDom();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
  }

  private exitPathNodeEditMode(): boolean {
    if (!this.pathNodeEditState) return false;
    this.pathNodeEditState = null;
    this.selectedPathNode = null;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = false;
    this.clearPathNodeEditFeedback();
    this.syncPenPostInsertAnchorOverlayDom();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
    return true;
  }

  private isPathNodeEditTarget(target: Element): boolean {
    if (!this.pathNodeEditState) return false;
    const activePathIds = new Set(this.pathNodeEditState.paths.map((state) => state.pathId));
    if (target.id && activePathIds.has(target.id)) return true;
    if (typeof target.closest !== 'function') return false;
    return !!target.closest('[data-path-node-edit-target]');
  }

  tryStartPathNodeDrag(target: Element, event: MouseEvent): boolean {
    if (!this.pathNodeEditState) return false;
    if (typeof target.closest !== 'function') return false;
    const anchorEl = target.closest('[data-path-node-anchor-index]') as Element | null;
    const handleEl = target.closest('[data-path-node-handle-index]') as Element | null;
    if (!anchorEl && !handleEl) return false;
    const rawPathId = (anchorEl ?? handleEl)?.getAttribute('data-path-node-path-id');
    if (!rawPathId) return false;
    const targetPathState = this.pathNodeEditState.paths.find((state) => state.pathId === rawPathId);
    if (!targetPathState) return false;

    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const pathEl = svg.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;

    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    if (anchorEl) {
      const index = Number(anchorEl.getAttribute('data-path-node-anchor-index'));
      if (!Number.isFinite(index) || index < 0 || index >= targetPathState.anchors.length) return false;
      this.selectedPathNode = {
        pathId: targetPathState.pathId,
        moveSegmentIndex: targetPathState.anchors[index].moveSegmentIndex
      };
      this.pathNodeEditState.activePathId = targetPathState.pathId;
      this.pathNodeDragSession = {
        pathId: targetPathState.pathId,
        oldD,
        segments: parsed.map((segment) => ({ ...segment })),
        target: { kind: 'anchor', index }
      };
      this.pathNodeDragJustEnded = false;
      this.updatePathNodeDrag(event.clientX, event.clientY);
      this.syncPathNodeEditBridgeChrome();
      return true;
    }

    const index = Number(handleEl?.getAttribute('data-path-node-handle-index'));
    if (!Number.isFinite(index) || index < 0 || index >= targetPathState.controlHandles.length) return false;
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    this.pathNodeDragSession = {
      pathId: targetPathState.pathId,
      oldD,
      segments: parsed.map((segment) => ({ ...segment })),
      target: { kind: 'control', index }
    };
    this.pathNodeDragJustEnded = false;
    this.updatePathNodeDrag(event.clientX, event.clientY);
    this.syncPathNodeEditBridgeChrome();
    return true;
  }

  private tryDeleteSelectedPathNode(): boolean {
    if (!this.pathNodeEditState) return false;
    if (this.selectedPathNode === null) {
      this.showPathNodeEditFeedback('Select a node before deleting.');
      return true;
    }
    const targetPathState = this.pathNodeEditState.paths.find(
      (state) => state.pathId === this.selectedPathNode?.pathId
    );
    if (!targetPathState) return false;

    const selectedAnchorIndex = targetPathState.anchors.findIndex(
      (anchor) => anchor.moveSegmentIndex === this.selectedPathNode?.moveSegmentIndex
    );
    if (selectedAnchorIndex < 0) return false;

    const uniqueMoveSegments = new Set(targetPathState.anchors.map((anchor) => anchor.moveSegmentIndex));
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${targetPathState.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) return false;

    const isClosedPath = parsed.some((segment) => segment.type === 'Z');
    const minimumNodeCount = isClosedPath ? 3 : 2;
    if (uniqueMoveSegments.size <= minimumNodeCount) {
      this.showPathNodeEditFeedback(
        isClosedPath ? 'Closed paths need at least 3 nodes.' : 'Paths need at least 2 nodes.'
      );
      return true;
    }

    const nextSegments = this.removePathAnchorByMoveSegmentIndex(
      parsed,
      this.selectedPathNode.moveSegmentIndex
    );
    if (!nextSegments) {
      this.showPathNodeEditFeedback('Unable to delete that node.');
      return true;
    }

    const newD = pathSegmentsToD(nextSegments);
    if (newD === oldD) return true;

    pathEl.setAttribute('d', newD);
    const cmd = new EditPathNodesCommand(this.svgManipulation, targetPathState.pathId, oldD, newD, true);
    this.editorHistory.pushAndExecute(cmd);

    const remappedLinks = remapPathNodeHandleLinkMapByStableAnchors(
      parsed,
      nextSegments,
      parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(targetPathState.pathId))
    );
    this.pushPathNodeHandleLinkMapIfChanged(targetPathState.pathId, remappedLinks);

    const refreshed = this.buildPathNodeEditState(targetPathState.pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === targetPathState.pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = targetPathState.pathId;
    const fallbackAnchor = refreshed.state.anchors[Math.max(0, selectedAnchorIndex - 1)];
    this.selectedPathNode = fallbackAnchor
      ? { pathId: targetPathState.pathId, moveSegmentIndex: fallbackAnchor.moveSegmentIndex }
      : null;
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
    return true;
  }

  private removePathAnchorByMoveSegmentIndex(
    segments: readonly PathSegment[],
    moveSegmentIndex: number
  ): PathSegment[] | null {
    const nextSegments = segments.map((segment) => ({ ...segment }));
    if (moveSegmentIndex < 0 || moveSegmentIndex >= nextSegments.length) return null;
    const target = nextSegments[moveSegmentIndex];
    if (!target || target.type === 'Z') return null;

    if (target.type === 'M') {
      let replacementIndex = moveSegmentIndex + 1;
      while (replacementIndex < nextSegments.length && nextSegments[replacementIndex].type === 'Z') {
        replacementIndex++;
      }
      if (replacementIndex >= nextSegments.length) return null;
      const replacement = nextSegments[replacementIndex];
      if (replacement.type === 'Z') return null;
      nextSegments[replacementIndex] = {
        type: 'M',
        x: replacement.x,
        y: replacement.y
      };
      nextSegments.splice(moveSegmentIndex, 1);
      return nextSegments;
    }

    nextSegments.splice(moveSegmentIndex, 1);
    return nextSegments;
  }

  private syncPathNodeEditBridgeChrome(): void {
    const toolIsNodeEdit = this.editorTool.getCurrentTool() === 'node-edit-selector';
    if (!toolIsNodeEdit || !this.pathNodeEditState || !this.selectedPathNode) {
      this.pathNodeEditBridge.setChrome({
        toolIsNodeEdit,
        hasSelectedPathNode: false,
        pathLocked: false,
        cornerEnabled: false,
        mirrorCubicEnabled: false,
        independentHandlesEnabled: false,
        anchorMode: 'none'
      });
      return;
    }
    const pathId = this.selectedPathNode.pathId;
    const locked = this.svgManipulation.isElementOrAncestorLocked(pathId);
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    const d = pathEl?.getAttribute('d') ?? '';
    const parsed = parsePathDForNodeEditing(d);
    if (!parsed) {
      this.pathNodeEditBridge.setChrome({
        toolIsNodeEdit: true,
        hasSelectedPathNode: true,
        pathLocked: locked,
        cornerEnabled: false,
        mirrorCubicEnabled: false,
        independentHandlesEnabled: false,
        anchorMode: 'none'
      });
      return;
    }
    const mi = this.selectedPathNode.moveSegmentIndex;
    const legs = resolvePathNodeConversionLegs(parsed, mi);
    let cornerEnabled =
      !locked && !!legs && (legs.incoming !== null || legs.outgoing !== null);
    if (cornerEnabled && legs) {
      const idxs = [legs.incoming, legs.outgoing].filter((i): i is number => i !== null);
      for (const i of idxs) {
        const ty = parsed[i]?.type;
        if (ty === 'Q' || ty === 'T' || ty === 'S') {
          cornerEnabled = false;
          break;
        }
      }
    }
    if (cornerEnabled && isPathNodeCornerAnchorAlreadyApplied(parsed, mi)) {
      cornerEnabled = false;
    }
    const mirrorState = getMirrorCubicJointUiState(parsed, mi);
    const independentState = getIndependentHandlesJointUiState(parsed, mi);
    const linkMap = parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    const independentAtVertex = linkMap.get(mi) === 'independent';
    const cornerAtVertex = isPathNodeCornerAnchorAlreadyApplied(parsed, mi);

    let anchorMode: 'corner' | 'mirror' | 'independent' | 'none' = 'none';
    if (cornerAtVertex) {
      anchorMode = 'corner';
    } else if (independentAtVertex) {
      anchorMode = 'independent';
    } else if (mirrorState.kind === 'already-cubic-noop') {
      anchorMode = 'mirror';
    }

    const mirrorCubicEnabled =
      !locked &&
      (mirrorState.kind === 'applicable' ||
        (independentAtVertex && isIndependentHandlesJointActionable(independentState)));
    const independentHandlesEnabled =
      !locked && isIndependentHandlesJointActionable(independentState) && !independentAtVertex;

    this.pathNodeEditBridge.setChrome({
      toolIsNodeEdit: true,
      hasSelectedPathNode: true,
      pathLocked: locked,
      cornerEnabled: !!cornerEnabled,
      mirrorCubicEnabled,
      independentHandlesEnabled,
      anchorMode
    });
  }

  private pushPathNodeHandleLinkMapIfChanged(pathId: string, nextMap: PathNodeHandleLinkMap): void {
    const oldRaw = this.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const newSer = serializePathNodeHandleLinkMap(nextMap);
    const normOld = oldRaw?.trim() || null;
    const normNew = newSer?.trim() || null;
    if (normOld === normNew) return;
    this.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNew);
    this.editorHistory.pushAndExecute(
      new SetPathNodeHandleLinkCommand(this.svgManipulation, pathId, normOld, normNew, true)
    );
  }

  private clearIndependentHandleLinkForMove(pathId: string, moveSegmentIndex: number): void {
    const map = parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    if (!map.delete(moveSegmentIndex)) return;
    this.pushPathNodeHandleLinkMapIfChanged(pathId, map);
  }

  private tryApplyPathNodeIndependentHandlesFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const mi = this.selectedPathNode.moveSegmentIndex;
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }
    const linkMap = parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    if (linkMap.get(mi) === 'independent') {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    const state = getIndependentHandlesJointUiState(parsed, mi);
    if (!isIndependentHandlesJointActionable(state)) {
      const msg =
        state.kind === 'rejects-quadratic'
          ? PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK
          : state.kind === 'needs-cubic-joint'
            ? 'Independent handles need two segments meeting at this node.'
            : 'Independent handles are not available at this node.';
      this.showPathNodeEditFeedback(msg);
      return false;
    }

    const outcome = convertPathAnchorAtMoveSegmentIndexToIndependentHandles(parsed, mi);
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    const newD = pathSegmentsToD(outcome.segments);
    if (newD !== oldD && !this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply independent handles for this path.');
      return false;
    }

    const oldLinkRaw = this.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const nextLinkMap = parsePathNodeHandleLinkMap(oldLinkRaw);
    nextLinkMap.set(mi, 'independent');
    const newLinkSer = serializePathNodeHandleLinkMap(nextLinkMap);
    const normOldLink = oldLinkRaw?.trim() || null;
    const normNewLink = newLinkSer?.trim() || null;

    const historyCmds: EditorCommand[] = [];
    if (newD !== oldD) {
      pathEl.setAttribute('d', newD);
      historyCmds.push(
        new EditPathNodesCommand(this.svgManipulation, pathId, oldD, newD, true)
      );
    }
    if (normOldLink !== normNewLink) {
      this.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNewLink);
      historyCmds.push(
        new SetPathNodeHandleLinkCommand(this.svgManipulation, pathId, normOldLink, normNewLink, true)
      );
    }

    if (historyCmds.length === 1) {
      this.editorHistory.pushAndExecute(historyCmds[0]);
    } else if (historyCmds.length > 1) {
      this.editorHistory.pushAndExecute(
        new CompositeCommand(historyCmds, 'Independent handles')
      );
    }

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((s) =>
      s.pathId === pathId ? refreshed.state! : s
    );
    this.pathNodeEditState.activePathId = pathId;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === mi)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: mi };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
    return true;
  }

  private tryApplyPathNodeAnchorCornerFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }

    const moveIdx = this.selectedPathNode.moveSegmentIndex;
    const outcome = convertPathAnchorAtMoveSegmentIndexToCorner(parsed, moveIdx);
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    this.clearIndependentHandleLinkForMove(pathId, moveIdx);

    const newD = pathSegmentsToD(outcome.segments);
    if (newD === oldD) {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    if (!this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply corner anchor for this path.');
      return false;
    }

    pathEl.setAttribute('d', newD);
    const cmd = new EditPathNodesCommand(this.svgManipulation, pathId, oldD, newD, true);
    this.editorHistory.pushAndExecute(cmd);

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = pathId;
    const preserve = moveIdx;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === preserve)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: preserve };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
    return true;
  }

  private tryApplyPathNodeMirrorCubicFromBridge(): boolean {
    if (!this.pathNodeEditState || !this.selectedPathNode) {
      this.showPathNodeEditFeedback('Select a path node first.');
      return false;
    }
    const pathId = this.selectedPathNode.pathId;
    if (this.svgManipulation.isElementOrAncestorLocked(pathId)) {
      this.showPathNodeEditFeedback('That path is locked.');
      return false;
    }
    if (!this.pathNodeEditState.paths.some((s) => s.pathId === pathId)) return false;
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return false;
    const oldD = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(oldD);
    if (!parsed) {
      this.showPathNodeEditFeedback('Unable to read that path.');
      return false;
    }

    const moveIdx = this.selectedPathNode.moveSegmentIndex;
    const linkMap = parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(pathId));
    const fromIndependent = linkMap.get(moveIdx) === 'independent';

    const joint = getMirrorCubicJointUiState(parsed, moveIdx);
    if (!fromIndependent && joint.kind === 'already-cubic-noop') {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }
    if (!fromIndependent && joint.kind !== 'applicable') {
      const msg =
        joint.kind === 'rejects-quadratic'
          ? PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK
          : joint.kind === 'needs-two-lines'
            ? 'Mirror cubic needs two straight edges meeting at this node.'
            : 'Unable to apply mirror cubic at this node.';
      this.showPathNodeEditFeedback(msg);
      return false;
    }

    const outcome = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(parsed, moveIdx, {
      fromIndependent
    });
    if (!outcome.ok) {
      if (outcome.feedback) {
        this.showPathNodeEditFeedback(outcome.feedback);
      }
      return false;
    }

    const newD = pathSegmentsToD(outcome.segments);
    if (newD !== oldD && !this.isValidNodeEditSerializedPath(newD)) {
      this.showPathNodeEditFeedback('Unable to apply mirror cubic for this path.');
      return false;
    }

    const oldLinkRaw = this.svgManipulation.getPathNodeHandleLinkRaw(pathId);
    const nextLinkMap = parsePathNodeHandleLinkMap(oldLinkRaw);
    if (fromIndependent) {
      nextLinkMap.delete(moveIdx);
    }
    const newLinkSer = serializePathNodeHandleLinkMap(nextLinkMap);
    const normOldLink = oldLinkRaw?.trim() || null;
    const normNewLink = newLinkSer?.trim() || null;

    const historyCmds: EditorCommand[] = [];
    if (newD !== oldD) {
      pathEl.setAttribute('d', newD);
      historyCmds.push(
        new EditPathNodesCommand(this.svgManipulation, pathId, oldD, newD, true)
      );
    }
    if (fromIndependent && normOldLink !== normNewLink) {
      this.svgManipulation.setPathNodeHandleLinkRaw(pathId, normNewLink);
      historyCmds.push(
        new SetPathNodeHandleLinkCommand(this.svgManipulation, pathId, normOldLink, normNewLink, true)
      );
    }

    if (historyCmds.length === 1) {
      this.editorHistory.pushAndExecute(historyCmds[0]);
    } else if (historyCmds.length > 1) {
      this.editorHistory.pushAndExecute(new CompositeCommand(historyCmds, 'Mirror cubic'));
    }

    if (newD === oldD && !fromIndependent) {
      this.clearPathNodeEditFeedback();
      this.syncPathNodeEditBridgeChrome();
      return true;
    }

    const refreshed = this.buildPathNodeEditState(pathId);
    if (!refreshed.state) {
      this.exitPathNodeEditMode();
      return true;
    }
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === pathId ? refreshed.state! : state
    );
    this.pathNodeEditState.activePathId = pathId;
    const preserve = moveIdx;
    if (refreshed.state.anchors.some((a) => a.moveSegmentIndex === preserve)) {
      this.selectedPathNode = { pathId, moveSegmentIndex: preserve };
    } else {
      this.selectedPathNode = null;
    }
    this.clearPathNodeEditFeedback();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
    return true;
  }

  updatePathNodeDrag(clientX: number, clientY: number): void {
    if (!this.pathNodeDragSession || !this.pathNodeEditState) return;
    const rootPt = this.clientToEditorSvgPoint(clientX, clientY);
    if (!rootPt) return;
    const pathId = this.pathNodeDragSession.pathId;
    const localPt = this.pathNodeRootUserPointToLocal(pathId, rootPt.x, rootPt.y);
    const point = localPt ?? rootPt;

    const nextSegments = this.pathNodeDragSession.segments.map((segment) => ({ ...segment }));
    if (this.pathNodeDragSession.target.kind === 'anchor') {
      this.applyAnchorDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    } else {
      this.applyControlDrag(nextSegments, this.pathNodeDragSession.target.index, point.x, point.y);
    }

    const nextD = pathSegmentsToD(nextSegments);
    if (!this.isValidNodeEditSerializedPath(nextD)) {
      this.showPathNodeEditFeedback('Unable to apply node move for this path.');
      return;
    }
    const svg = this.svgManipulation.getSVGInstance();
    const pathEl = svg?.findOne(`#${this.pathNodeDragSession.pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return;
    pathEl.setAttribute('d', nextD);

    this.pathNodeDragSession.segments = nextSegments;
    this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
      state.pathId === this.pathNodeDragSession?.pathId
        ? {
            pathId: state.pathId,
            anchors: this.collectPathNodeAnchors(nextSegments),
            controlHandles: this.collectPathControlHandles(nextSegments)
          }
        : state
    );
    this.pathNodeEditState.activePathId = this.pathNodeDragSession.pathId;
    this.cdr.markForCheck();
  }

  finishPathNodeDrag(): void {
    const drag = this.pathNodeDragSession;
    this.pathNodeDragSession = null;
    this.pathNodeDragJustEnded = true;
    if (!drag) return;

    const newD = pathSegmentsToD(drag.segments);
    if (newD !== drag.oldD) {
      const cmd = new EditPathNodesCommand(
        this.svgManipulation,
        drag.pathId,
        drag.oldD,
        newD,
        true
      );
      this.editorHistory.pushAndExecute(cmd);
    }
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
  }

  private applyAnchorDrag(segments: PathSegment[], anchorIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const anchor = pathState?.anchors[anchorIndex];
    if (!anchor) return;
    const moveSegment = segments[anchor.moveSegmentIndex];
    if (!moveSegment || moveSegment.type === 'Z') return;

    const oldX = moveSegment.x;
    const oldY = moveSegment.y;
    const dx = x - oldX;
    const dy = y - oldY;

    moveSegment.x = x;
    moveSegment.y = y;

    // Move the incoming handle (P2) that lives inside the segment ending at this anchor.
    if (moveSegment.type === 'C') {
      moveSegment.x2 += dx;
      moveSegment.y2 += dy;
    }
    if (moveSegment.type === 'Q') {
      moveSegment.x1 += dx;
      moveSegment.y1 += dy;
    }

    // Move the outgoing handle (P1) of the segment immediately following the moved anchor.
    // (Done by direct index because moveSegment.x has already been updated, so the
    // position-based loop below cannot match it.)
    const nextSeg = segments[anchor.moveSegmentIndex + 1];
    if (nextSeg?.type === 'C' || nextSeg?.type === 'Q') {
      nextSeg.x1 += dx;
      nextSeg.y1 += dy;
    }

    // For any other segment that happens to share the same old endpoint (rare; e.g. duplicate
    // anchors in multi-subpath data), move its incoming handle and the outgoing handle of
    // whatever follows it.
    for (const segment of segments) {
      if (segment.type === 'C' && segment.x === oldX && segment.y === oldY) {
        segment.x2 += dx;
        segment.y2 += dy;
      }
      if (segment.type === 'Q' && segment.x === oldX && segment.y === oldY) {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }

    for (let i = 1; i < segments.length; i++) {
      const previous = segments[i - 1];
      const segment = segments[i];
      if (previous.type === 'Z') continue;
      if (previous.x !== oldX || previous.y !== oldY) continue;
      if (segment.type === 'C') {
        segment.x1 += dx;
        segment.y1 += dy;
      } else if (segment.type === 'Q') {
        segment.x1 += dx;
        segment.y1 += dy;
      }
    }

    // Closed paths: dragging `M` only updated the moveto; the closing `C`/`L`/… endpoint can
    // still equal the pre-drag point, so `collectPathNodeAnchors` sees a gap before `Z` and
    // emits a duplicate start/end overlay until mouseup (svg-editor-19z).
    for (const segment of segments) {
      if (segment.type === 'Z' || segment.type === 'M') continue;
      if (segment.x === oldX && segment.y === oldY) {
        segment.x = x;
        segment.y = y;
      }
    }
  }

  private applyControlDrag(segments: PathSegment[], handleIndex: number, x: number, y: number): void {
    const pathId = this.pathNodeDragSession?.pathId;
    const pathState = this.pathNodeEditState?.paths.find((state) => state.pathId === pathId);
    const handle = pathState?.controlHandles[handleIndex];
    if (!handle) return;
    const segment = segments[handle.segmentIndex];
    if (!segment) return;
    if (segment.type === 'Q') {
      if (handle.controlPoint === 'x1y1') {
        segment.x1 = x;
        segment.y1 = y;
      }
      return;
    }
    if (segment.type !== 'C') return;
    const linkMap = parsePathNodeHandleLinkMap(
      pathId ? this.svgManipulation.getPathNodeHandleLinkRaw(pathId) : null
    );
    if (linkMap.get(handle.vertexMoveSegmentIndex) === 'independent') {
      if (handle.controlPoint === 'x1y1') {
        segment.x1 = x;
        segment.y1 = y;
      } else {
        segment.x2 = x;
        segment.y2 = y;
      }
      return;
    }
    applySymmetricCubicControlDragInPlace(segments, handle.segmentIndex, handle.controlPoint, x, y);
  }

  /**
   * Path `d` is stored in **element-local** space; overlay and pointer math use **root SVG user**
   * space (same as selection bbox). Uses `getTransformToElement` so parent `<g>` transforms are
   * included. Multi-select: each path id has its own mapping.
   */
  private pathNodeLocalPointToOverlay(pathId: string, lx: number, ly: number): { x: number; y: number } {
    const mapped = this.svgManipulation.mapPathLocalToRootUser(pathId, lx, ly);
    const o = this.svgBboxToOverlayPixels({ x: mapped.x, y: mapped.y, width: 0, height: 0 });
    return { x: o.x, y: o.y };
  }

  private pathLocalPathDToOutlineOverlayD(pathId: string, pathD: string): string | null {
    const parsed = this.parsePathDataForNodeEditing(pathD);
    if (!parsed) return null;
    const d = buildPathSelectionOutlineOverlayD(pathId, parsed, (id, lx, ly) =>
      this.pathNodeLocalPointToOverlay(id, lx, ly)
    );
    return d || null;
  }

  private rootUserPathDToOutlineOverlayD(pathD: string): string | null {
    const parsed = this.parsePathDataForNodeEditing(pathD);
    if (!parsed?.some((segment) => segment.type !== 'M')) return null;
    const d = buildPathSelectionOutlineOverlayD('pen-session', parsed, (_id, rx, ry) =>
      this.penRootUserPointToOverlay(rx, ry)
    );
    return d || null;
  }

  private pathNodeRootUserPointToLocal(pathId: string, rx: number, ry: number): { x: number; y: number } | null {
    return this.svgManipulation.mapRootUserToPathLocal(pathId, rx, ry);
  }

  private buildPathNodeEditState(pathId: string): PathNodeEditStateBuildResult {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return { state: null, reason: null };
    const pathEl = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return { state: null, reason: null };
    const pathData = pathEl.getAttribute('d') ?? '';
    if (!pathData.trim()) return { state: null, reason: null };

    const parsed = this.parsePathDataForNodeEditing(pathData);
    if (!parsed) {
      return {
        state: null,
        reason: 'Node editing supports only clean M/L/C/S/Q/T/Z path commands (smooth S/T are stored as C/Q).'
      };
    }
    return {
      state: {
        pathId,
        anchors: this.collectPathNodeAnchors(parsed),
        controlHandles: this.collectPathControlHandles(parsed)
      },
      reason: null
    };
  }

  private parsePathDataForNodeEditing(pathData: string): PathSegment[] | null {
    return parsePathDForNodeEditing(pathData);
  }

  /** ~18px in screen space, expressed in root SVG user units, for pen path insert hit testing (cursor + click). */
  private getPenPathInsertToleranceSvg(): number {
    const mainSvg = this.svgContainer()?.nativeElement?.firstElementChild as SVGSVGElement | null;
    if (!mainSvg) return 14;
    const vb = this.parseOverlayViewBox();
    const r = mainSvg.getBoundingClientRect();
    if (!vb || r.width <= 0 || r.height <= 0) return 14;
    const svgPerPx = (vb.vbW / r.width + vb.vbH / r.height) / 2;
    return 18 * svgPerPx;
  }

  /**
   * Commit pen insert-on-path from {@link PenToolSession} (mousedown→mouseup / micro-drag).
   * @param insertedMoveSegIndex move-segment index of the inserted vertex (for `selectedPathNode` parity with node-edit).
   */
  private commitPenInsertOnExistingPath(pathId: string, oldD: string, newD: string, insertedMoveSegIndex?: number): void {
    if (newD === oldD || !this.isValidNodeEditSerializedPath(newD)) return;
    const svg = this.svgManipulation.getSVGInstance();
    const pathNode = svg?.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathNode) return;

    this.svgManipulation.updatePathData(pathId, newD);
    const cmd = new EditPathNodesCommand(this.svgManipulation, pathId, oldD, newD, true);
    this.editorHistory.pushAndExecute(cmd);

    const oldParsed = this.parsePathDataForNodeEditing(oldD);
    const newParsed = this.parsePathDataForNodeEditing(newD);
    if (oldParsed && newParsed) {
      const remappedLinks = remapPathNodeHandleLinkMapByStableAnchors(
        oldParsed,
        newParsed,
        parsePathNodeHandleLinkMap(this.svgManipulation.getPathNodeHandleLinkRaw(pathId))
      );
      this.pushPathNodeHandleLinkMapIfChanged(pathId, remappedLinks);
    }

    const el = svg?.findOne(`#${pathId}`) as SVGElement | undefined;
    if (el) {
      this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    }
    const shapeBbox = this.svgManipulation.getShapeBBox(pathId);
    if (shapeBbox) {
      this.lastBbox = shapeBbox;
      this._highlightRectCacheKey = '';
    }

    if (this.pathNodeEditState?.paths.some((state) => state.pathId === pathId)) {
      const refreshed = this.buildPathNodeEditState(pathId);
      if (refreshed.state) {
        this.pathNodeEditState.paths = this.pathNodeEditState.paths.map((state) =>
          state.pathId === pathId ? refreshed.state! : state
        );
        this.pathNodeEditState.activePathId = pathId;
        if (
          insertedMoveSegIndex !== undefined &&
          refreshed.state.anchors.some((a) => a.moveSegmentIndex === insertedMoveSegIndex)
        ) {
          this.selectedPathNode = { pathId, moveSegmentIndex: insertedMoveSegIndex };
        } else {
          this.selectedPathNode = null;
        }
      } else {
        this.exitPathNodeEditMode();
      }
    }

    // Legacy single-path anchor ring: only when shared path-node overlays are not driving this path.
    if (this.pathNodeEditState?.paths.some((state) => state.pathId === pathId)) {
      this.penPostInsertAnchorPathId = null;
    } else {
      this.penPostInsertAnchorPathId = pathId;
    }
    this.syncPenPostInsertAnchorOverlayDom();
    this.syncPathNodeEditBridgeChrome();
    this.cdr.markForCheck();
  }

  clearPenPostInsertAnchorOverlay(): void {
    this.penPostInsertAnchorPathId = null;
    this.syncPenPostInsertAnchorOverlayDom();
  }

  private syncPenPostInsertAnchorOverlayDom(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    svg.findOne('#pen-post-insert-anchor-overlay')?.remove();
    if (!this.penPostInsertAnchorPathId) return;
    if (this.pathNodeEditState?.paths.some((state) => state.pathId === this.penPostInsertAnchorPathId)) {
      return;
    }
    const pathId = this.penPostInsertAnchorPathId;
    const pathEl = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
    if (!pathEl) return;
    const pathData = pathEl.getAttribute('d') ?? '';
    const parsed = this.parsePathDataForNodeEditing(pathData);
    if (!parsed) return;
    const anchors = this.collectPathNodeAnchors(parsed);
    const g = svg.group().id('pen-post-insert-anchor-overlay').attr('pointer-events', 'none');
    for (const anchor of anchors) {
      const m = this.svgManipulation.mapPathLocalToRootUser(pathId, anchor.x, anchor.y);
      // Match `path-node-anchor` in the selection overlay (white fill, blue stroke).
      g.circle(4)
        .center(m.x, m.y)
        .attr({
          fill: '#ffffff',
          stroke: '#1E88E5',
          'stroke-width': 2,
          'vector-effect': 'non-scaling-stroke'
        });
    }
    svg.add(g);
  }

  schedulePenInsertHoverCursorHitTest(clientX: number, clientY: number): void {
    this.pendingPenInsertHoverClient = { x: clientX, y: clientY };
    if (this.penInsertCursorRaf !== 0) return;
    this.penInsertCursorRaf = window.requestAnimationFrame(() => {
      this.penInsertCursorRaf = 0;
      const p = this.pendingPenInsertHoverClient;
      this.pendingPenInsertHoverClient = null;
      if (p) {
        this.penTool.updateIdlePenHoverClient(p.x, p.y);
        this.applyPenInsertHoverCursorFromClient(p.x, p.y);
      }
    });
  }

  private clearPenInsertHostCursor(): void {
    const el = this.canvasViewport()?.nativeElement;
    if (el?.style?.cursor) {
      el.style.removeProperty('cursor');
    }
  }

  private applyPenInsertHoverCursorFromClient(clientX: number, clientY: number): void {
    const el = this.canvasViewport()?.nativeElement;
    if (!el) return;
    if (this.editorTool.getCurrentTool() !== 'pen') {
      this.clearPenInsertHostCursor();
      return;
    }
    if (this.penTool.isPenInsertOnPathDragActive) {
      el.style.cursor = 'copy';
      return;
    }
    if (!this.penTool.canTryPenInsertNodeOnPath) {
      this.clearPenInsertHostCursor();
      return;
    }
    const under =
      typeof document !== 'undefined' ? (document.elementFromPoint(clientX, clientY) as Element | null) : null;
    const pathHit = under?.closest?.('path') as SVGPathElement | null;
    if (!pathHit?.id || !this.isEditorContentShapeTarget(pathHit)) {
      this.clearPenInsertHostCursor();
      return;
    }
    const pt = this.clientToEditorSvgPoint(clientX, clientY);
    if (!pt) {
      this.clearPenInsertHostCursor();
      return;
    }
    const rawD = this.svgManipulation.getSVGInstance()?.findOne(`#${pathHit.id}`)?.attr('d');
    if (typeof rawD !== 'string' || !rawD.trim()) {
      this.clearPenInsertHostCursor();
      return;
    }
    const parsed = parsePathDForNodeEditing(rawD);
    if (!parsed) {
      this.clearPenInsertHostCursor();
      return;
    }
    const tol = this.getPenPathInsertToleranceSvg();
    const hit = findPenPathInsertHit(parsed, pt.x, pt.y, tol * tol);
    if (!hit) {
      this.clearPenInsertHostCursor();
      return;
    }
    el.style.cursor = 'copy';
  }

  /** Same conditions as {@link applyPenInsertHoverCursorFromClient} `copy` branch, without mutating DOM. */
  private penInsertCopyCursorWouldApplySync(clientX: number, clientY: number): boolean {
    if (this.editorTool.getCurrentTool() !== 'pen') return false;
    if (this.penTool.isPenInsertOnPathDragActive) return true;
    if (!this.penTool.canTryPenInsertNodeOnPath) return false;
    const under =
      typeof document !== 'undefined' ? (document.elementFromPoint(clientX, clientY) as Element | null) : null;
    const pathHit = under?.closest?.('path') as SVGPathElement | null;
    if (!pathHit?.id || !this.isEditorContentShapeTarget(pathHit)) return false;
    const pt = this.clientToEditorSvgPoint(clientX, clientY);
    if (!pt) return false;
    const rawD = this.svgManipulation.getSVGInstance()?.findOne(`#${pathHit.id}`)?.attr('d');
    if (typeof rawD !== 'string' || !rawD.trim()) return false;
    const parsed = parsePathDForNodeEditing(rawD);
    if (!parsed) return false;
    const tol = this.getPenPathInsertToleranceSvg();
    return findPenPathInsertHit(parsed, pt.x, pt.y, tol * tol) !== null;
  }

  private static expectedCursorForResizeHandle(h: string): string {
    switch (h) {
      case 'nw':
        return 'nw-resize';
      case 'ne':
        return 'ne-resize';
      case 'sw':
        return 'sw-resize';
      case 'se':
        return 'se-resize';
      case 'n':
      case 's':
        return 'ns-resize';
      case 'e':
      case 'w':
        return 'ew-resize';
      default:
        return 'default';
    }
  }

  private static expectedCursorForSkewEdge(e: string): string {
    if (e === 'n' || e === 's') return 'ew-resize';
    if (e === 'e' || e === 'w') return 'ns-resize';
    return 'default';
  }

  /**
   * Best-effort description of the cursor the editor intends (svg-canvas.component.css + viewport inline).
   */
  private computeExpectedCursorHint(
    clientX: number,
    clientY: number,
    hitTarget: Element | null,
    overCanvas: boolean
  ): string {
    const tool = this.editorTool.getCurrentTool();
    const vp = this.canvasViewport()?.nativeElement;
    const vpCur = vp?.style?.cursor?.trim();

    if (this.pathNodeDragSession) {
      return 'Expected cursor: move (path node drag in progress)';
    }
    if (this.creation.isActive) {
      return 'Expected cursor: crosshair (creation in progress)';
    }
    if (this.isDraggingShape) {
      return 'Expected cursor: move (shape drag in progress)';
    }
    if (this.isResizingSelection) {
      return 'Expected cursor: (resize — axis from active handle; .selection-resize-*)';
    }
    if (this.isSkewingSelection) {
      return 'Expected cursor: (skew — .selection-skew-*)';
    }
    if (this.isPanning && tool === 'pan') {
      return 'Expected cursor: grabbing (.canvas-container.pan-dragging)';
    }

    if (this.isRotatingSelection && typeof document !== 'undefined') {
      const b = document.body.style.cursor?.trim();
      if (b) return `Expected cursor: ${b} (rotate gesture on document.body)`;
    }
    if (this.isPenInsertOnPathDragActive()) {
      return 'Expected cursor: copy (pen insert-on-path drag; #canvasViewport inline)';
    }
    if (overCanvas && hitTarget) {
      if (tool === 'pen' && hitTarget.closest?.('[data-pen-outgoing-handle]')) {
        return 'Expected cursor: grab (pen outgoing handle; .pen-outgoing-handle)';
      }
      if (this.hasPathNodeEditState()) {
        if (hitTarget.closest?.('[data-path-node-anchor-index]')) {
          return 'Expected cursor: move (path node anchor; .path-node-anchor)';
        }
        if (hitTarget.closest?.('[data-path-node-handle-index]')) {
          return 'Expected cursor: move (path control handle; .path-node-control-handle)';
        }
      }
      if (this.isSelectorInteractionTool(tool)) {
        const rh = hitTarget.closest?.('[data-resize-handle]')?.getAttribute('data-resize-handle');
        if (rh) {
          const c = SvgCanvasComponent.expectedCursorForResizeHandle(rh);
          return `Expected cursor: ${c} (selection resize .selection-resize-${rh})`;
        }
        const sk = hitTarget.closest?.('[data-skew-handle]')?.getAttribute('data-skew-handle');
        if (sk === 'n' || sk === 's' || sk === 'e' || sk === 'w') {
          const c = SvgCanvasComponent.expectedCursorForSkewEdge(sk);
          return `Expected cursor: ${c} (selection skew .selection-skew-${sk})`;
        }
        if (hitTarget.closest?.('[data-rotate-handle]')) {
          return 'Expected cursor: grab (selection rotate; .selection-rotate-handle)';
        }
      }
    }

    if (tool === 'pen' && this.penInsertCopyCursorWouldApplySync(clientX, clientY)) {
      return 'Expected cursor: copy (pen idle valid insert hit; #canvasViewport inline — may apply next rAF)';
    }
    if (vpCur) {
      return `Expected cursor: ${vpCur} (#canvasViewport inline)`;
    }

    if (!overCanvas) {
      return 'Expected cursor: default (pointer outside #canvasViewport)';
    }

    if (tool === 'zoom') {
      return this.altKeyPressed
        ? 'Expected cursor: zoom-out (.canvas-container.zoom-mode-out)'
        : 'Expected cursor: zoom-in (.canvas-container.zoom-mode)';
    }
    if (tool === 'pan') {
      return this.isPanning
        ? 'Expected cursor: grabbing (.canvas-container.pan-dragging)'
        : 'Expected cursor: grab (.canvas-container.pan-mode)';
    }
    if (this.isCreationToolActive()) {
      return 'Expected cursor: crosshair (.canvas-container.creation-mode)';
    }
    if (tool === 'text') {
      return 'Expected cursor: text (.canvas-container.text-mode)';
    }
    if (tool === 'eyedropper') {
      return 'Expected cursor: crosshair (.canvas-container.eyedropper-mode .svg-canvas)';
    }
    if (tool === 'pen') {
      return 'Expected cursor: crosshair (.canvas-container.pen-mode; user SVG uses cursor:inherit)';
    }
    if (this.isSelectorInteractionTool(tool)) {
      return 'Expected cursor: default (selector / node-edit — no handle under pointer)';
    }
    return `Expected cursor: default (${tool})`;
  }

  /**
   * Debug HUD: predicted primary-button effect on the canvas at the last pointer sample.
   * Best-effort mirror of {@link PointerGestureRouter.onCanvasMouseDownPrimary} + pen session rules.
   */
  private refreshPointerIntentDebug(clientX: number, clientY: number): void {
    const tool = this.editorTool.getCurrentTool();
    const vpEl = this.canvasViewport()?.nativeElement;
    const hitTarget =
      typeof document !== 'undefined' && typeof document.elementFromPoint === 'function'
        ? (document.elementFromPoint(clientX, clientY) as Element | null)
        : null;
    const overCanvas = !!(hitTarget && vpEl && typeof vpEl.contains === 'function' && vpEl.contains(hitTarget));

    const lines: string[] = [`tool=${tool}`];
    const publish = (primaryLine: string, detailLines: string[]): void => {
      const expectedCursorLine = this.computeExpectedCursorHint(clientX, clientY, hitTarget, overCanvas);
      const snap: EditorPointerIntentSnapshot = {
        clientX,
        clientY,
        sampledAtMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        expectedCursorLine,
        primaryLine,
        detailLines
      };
      this.pointerIntentDebug.publish(snap);
    };

    if (this.creation.isActive) {
      publish('Creation in progress (mousemove shapes object)', lines.concat('primary click semantics N/A until creation ends'));
      return;
    }
    if (this.pathNodeDragSession) {
      publish('Path node drag in progress', lines.concat(`pathId=${this.pathNodeDragSession.pathId}`));
      return;
    }
    if (this.isPenInsertOnPathDragActive()) {
      publish('Pen insert-on-path drag (mouseup commits)', lines.concat('see pen session'));
      return;
    }
    if (tool === 'pen' && this.isPenToolWithActiveSession()) {
      const pen = this.penTool.describePenPrimaryMouseDownIntent(hitTarget, clientX, clientY, (cx, cy, s) =>
        this.getSnappedPenPoint(cx, cy, s)
      );
      publish(`Pen session active → ${pen.headline}`, lines.concat(pen.details));
      return;
    }
    if (this.isSelectionMarquee) {
      publish('Selection marquee drag', lines);
      return;
    }
    if (this.isZoomMarquee) {
      publish('Zoom marquee drag', lines);
      return;
    }
    if (this.isResizingSelection) {
      publish('Resize drag', lines);
      return;
    }
    if (this.isSkewingSelection) {
      publish('Skew drag', lines);
      return;
    }
    if (this.isRotatingSelection) {
      publish('Rotate drag', lines);
      return;
    }
    if (this.isPanning) {
      publish('Pan drag', lines);
      return;
    }
    if (this.isDraggingShape) {
      publish('Shape drag', lines);
      return;
    }

    lines.push(`overCanvasViewport=${overCanvas}`);
    if (hitTarget) {
      const tid = hitTarget.id ? `#${hitTarget.id}` : '';
      lines.push(`elementFromPoint=${hitTarget.tagName.toLowerCase()}${tid}`);
    } else {
      lines.push('elementFromPoint=null');
    }

    if (!overCanvas) {
      publish(`${tool}: pointer not on canvas (no primary-canvas prediction)`, lines);
      return;
    }

    if (tool === 'zoom') {
      publish('Zoom tool: primary mousedown starts zoom marquee', lines);
      return;
    }
    if (tool === 'pan') {
      publish('Pan tool: primary mousedown starts pan', lines);
      return;
    }
    if (tool === 'pen') {
      const pen = this.penTool.describePenPrimaryMouseDownIntent(hitTarget, clientX, clientY, (cx, cy, s) =>
        this.getSnappedPenPoint(cx, cy, s)
      );
      publish(pen.headline, lines.concat(pen.details));
      return;
    }
    if (this.isCreationToolActive()) {
      if (!this.svgContent() || !this.canvasView.isInitialized()) {
        publish(`${tool}: creation tool but canvas not ready`, lines);
        return;
      }
      publish(`${tool}: primary mousedown may start creation gesture`, lines.concat('see CreationGesture'));
      return;
    }
    if (tool === 'eyedropper') {
      publish('Eyedropper: primary mousedown samples color', lines);
      return;
    }
    if (tool === 'text') {
      publish('Text tool: primary mousedown places / edits text (see text handlers)', lines);
      return;
    }
    if (!this.isSelectorInteractionTool(tool) || !this.svgContent() || !this.canvasView.isInitialized()) {
      publish(`${tool}: primary canvas click not routed here`, lines);
      return;
    }

    if (!hitTarget) {
      publish('Selector: no target', lines);
      return;
    }

    if (this.hasPathNodeEditState()) {
      const anchorEl = hitTarget.closest?.('[data-path-node-anchor-index]') as Element | null;
      const handleEl = hitTarget.closest?.('[data-path-node-handle-index]') as Element | null;
      if (anchorEl) {
        publish('Node-edit: drag anchor', lines.concat(`anchor index attr=${anchorEl.getAttribute('data-path-node-anchor-index')}`));
        return;
      }
      if (handleEl) {
        publish('Node-edit: drag control handle', lines.concat(`handle index attr=${handleEl.getAttribute('data-path-node-handle-index')}`));
        return;
      }
    }

    const resizeEl = hitTarget.closest?.('[data-resize-handle]');
    if (resizeEl) {
      const h = resizeEl.getAttribute('data-resize-handle');
      publish(`Selector: resize (${h ?? '?'})`, lines);
      return;
    }
    const skewEl = hitTarget.closest?.('[data-skew-handle]');
    if (skewEl) {
      const e = skewEl.getAttribute('data-skew-handle');
      publish(`Selector: skew (${e ?? '?'})`, lines);
      return;
    }
    const rotateEl = hitTarget.closest?.('[data-rotate-handle]');
    if (rotateEl) {
      publish('Selector: rotate selection', lines);
      return;
    }

    if (!this.isEditorContentShapeTarget(hitTarget)) {
      publish('Selector: primary mousedown starts selection marquee', lines.concat('missed editable shape'));
      return;
    }

    if (hitTarget.tagName === 'svg' || !hitTarget.id) {
      publish('Selector: click on svg chrome / no id — likely no-op', lines);
      return;
    }

    let effectiveDragId = hitTarget.id;
    if (!this.isShapeSelected(hitTarget.id)) {
      const nearestGroupId = this.getNearestGroupAncestorId(hitTarget.id);
      if (nearestGroupId && this.isShapeSelected(nearestGroupId)) {
        effectiveDragId = nearestGroupId;
        lines.push(`group drill-in: drag effective id=${effectiveDragId}`);
      } else {
        publish('Selector: click on shape but not selected — primary down may no-op (selection policy)', lines);
        return;
      }
    }

    publish(`Selector: drag selected shape(s) from ${effectiveDragId}`, lines.concat('unless shift/ctrl/meta held'));
  }

  private isValidNodeEditSerializedPath(pathData: string): boolean {
    if (!pathData.trim()) return false;
    const reparsed = parsePathD(pathData);
    return reparsed.errors.length === 0 && reparsed.segments.length > 0 && reparsed.segments[0].type === 'M';
  }

  private collectPathNodeAnchors(segments: readonly PathSegment[]): PathNodePoint[] {
    const anchors: PathNodePoint[] = [];
    let current: PathNodePoint | null = null;
    let subpathStart: PathNodePoint | null = null;

    for (const [segmentIndex, segment] of segments.entries()) {
      if (segment.type === 'M') {
        const point = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        };
        anchors.push(point);
        current = point;
        subpathStart = point;
        continue;
      }
      if (segment.type === 'L') {
        const coincidentClose =
          subpathStart !== null &&
          segments[segmentIndex + 1]?.type === 'Z' &&
          penSvgDistanceSq(
            { x: segment.x, y: segment.y },
            { x: subpathStart.x, y: subpathStart.y }
          ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
        if (!coincidentClose) {
          anchors.push({
            x: segment.x,
            y: segment.y,
            segmentIndex,
            moveSegmentIndex: segmentIndex
          });
        }
        current = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
        };
        continue;
      }
      if (segment.type === 'C') {
        const coincidentClose =
          subpathStart !== null &&
          segments[segmentIndex + 1]?.type === 'Z' &&
          penSvgDistanceSq(
            { x: segment.x, y: segment.y },
            { x: subpathStart.x, y: subpathStart.y }
          ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
        if (!coincidentClose) {
          anchors.push({
            x: segment.x,
            y: segment.y,
            segmentIndex,
            moveSegmentIndex: segmentIndex
          });
        }
        current = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
        };
        continue;
      }
      if (segment.type === 'Q') {
        const coincidentClose =
          subpathStart !== null &&
          segments[segmentIndex + 1]?.type === 'Z' &&
          penSvgDistanceSq(
            { x: segment.x, y: segment.y },
            { x: subpathStart.x, y: subpathStart.y }
          ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
        if (!coincidentClose) {
          anchors.push({
            x: segment.x,
            y: segment.y,
            segmentIndex,
            moveSegmentIndex: segmentIndex
          });
        }
        current = {
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
        };
        continue;
      }
      if (segment.type === 'Z' && subpathStart && current) {
        const gapSq = penSvgDistanceSq(
          { x: subpathStart.x, y: subpathStart.y },
          { x: current.x, y: current.y }
        );
        if (gapSq >= PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ) {
          anchors.push({
            x: subpathStart.x,
            y: subpathStart.y,
            segmentIndex,
            moveSegmentIndex: subpathStart.moveSegmentIndex
          });
        }
        current = {
          x: subpathStart.x,
          y: subpathStart.y,
          segmentIndex,
          moveSegmentIndex: subpathStart.moveSegmentIndex
        };
      }
    }

    return anchors;
  }

  private collectPathControlHandles(segments: readonly PathSegment[]): PathNodeControlHandle[] {
    const handles: PathNodeControlHandle[] = [];
    let current: PathNodePoint | null = null;
    let subpathStart: PathNodePoint | null = null;

    for (const [segmentIndex, segment] of segments.entries()) {
      if (segment.type === 'M') {
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        subpathStart = current;
        continue;
      }
      if (segment.type === 'L') {
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'C') {
        if (current) {
          handles.push({
            anchorX: current.x,
            anchorY: current.y,
            controlX: segment.x1,
            controlY: segment.y1,
            segmentIndex,
            controlPoint: 'x1y1',
            vertexMoveSegmentIndex: current.moveSegmentIndex
          });
        }
        handles.push({
          anchorX: segment.x,
          anchorY: segment.y,
          controlX: segment.x2,
          controlY: segment.y2,
          segmentIndex,
          controlPoint: 'x2y2',
          vertexMoveSegmentIndex: segmentIndex
        });
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'Q') {
        if (current) {
          handles.push({
            anchorX: current.x,
            anchorY: current.y,
            controlX: segment.x1,
            controlY: segment.y1,
            segmentIndex,
            controlPoint: 'x1y1',
            vertexMoveSegmentIndex: current.moveSegmentIndex
          });
        }
        current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
        continue;
      }
      if (segment.type === 'Z' && subpathStart) {
        current = {
          x: subpathStart.x,
          y: subpathStart.y,
          segmentIndex,
          moveSegmentIndex: subpathStart.moveSegmentIndex
        };
      }
    }

    return handles;
  }

  private isGroupAClipMaskCarrier(groupId: string): boolean {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const el = svg.findOne(`#${groupId}`)?.node as Element | null;
    if (!el) return false;
    return el.hasAttribute('clip-path') || el.hasAttribute('mask');
  }

  isEditorContentShapeTarget(target: Element): boolean {
    if (isTextToolPreviewNode(target)) return false;
    const tag = target.tagName?.toLowerCase?.() ?? '';
    if (!CONTENT_SHAPE_TAGS.has(tag)) return false;
    const id = target.id;
    if (!id) return false;
    if (typeof target.closest === 'function') {
      const group = target.closest('[data-editor-content-group]');
      return !!group?.contains(target);
    }
    const shape = this.svgManipulation.getSVGInstance()?.findOne(`#${id}`) as SVGElement | undefined;
    const node = shape?.node as Element | undefined;
    if (!node || typeof node.closest !== 'function') return false;
    return !!node.closest('[data-editor-content-group]');
  }

  isSelectorInteractionTool(tool: EditorTool): boolean {
    return tool === 'selector' || tool === 'node-edit-selector';
  }

  /** Tools that keep `pathNodeEditState` on switch and may rebuild it from path selection (with node-edit). */
  private toolKeepsOrBuildsPathNodeTopology(tool: EditorTool): boolean {
    return tool === 'selector' || tool === 'node-edit-selector' || tool === 'pen';
  }

  private isNodeEditSelectorTool(tool: EditorTool): boolean {
    return tool === 'node-edit-selector';
  }

  private isPathElementId(id: string): boolean {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return false;
    const el = svg.findOne(`#${id}`)?.node as Element | null;
    return el?.tagName?.toLowerCase?.() === 'path';
  }

  private tryEyedropperSample(event: MouseEvent): void {
    if (!this.svgContent() || !this.canvasView.isInitialized()) return;
    const el = this.findEyedropperHitElement(event.clientX, event.clientY);
    if (!el) return;
    const kind = event.shiftKey ? 'stroke' : 'fill';
    const color = sampleSolidComputedPaint(el, kind);
    if (!color) return;
    if (kind === 'fill') {
      this.chromeEditorApply.applyFillColor(color);
    } else {
      this.chromeEditorApply.applyStrokeColor(color);
    }
    this.cdr.markForCheck();
  }

  /** Skip selection UI so `elementsFromPoint` reaches document shapes. */
  private isEyedropperUiChrome(el: Element): boolean {
    if (el.hasAttribute('data-resize-handle')) return true;
    if (el.hasAttribute('data-skew-handle')) return true;
    if (el.hasAttribute('data-rotate-handle')) return true;
    if (el.hasAttribute('data-pen-outgoing-handle')) return true;
    if (el.classList.contains('path-node-anchor') || el.classList.contains('path-node-control-handle')) return true;
    return false;
  }

  private findEyedropperHitElement(clientX: number, clientY: number): Element | null {
    const container = this.svgContainer()?.nativeElement;
    if (!container) return null;
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      if (this.isEyedropperUiChrome(node)) continue;
      if (node.closest('svg[data-testid="canvas-selection-overlay-svg"]')) continue;
      if (!container.contains(node)) continue;
      if (!node.closest('[data-editor-content-group]')) continue;
      if (isTextToolPreviewNode(node)) continue;
      return node;
    }
    return null;
  }

  private destroyTextToolPreview(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const preview = svg.findOne(`[${TEXT_TOOL_PREVIEW_DATA_ATTR}]`) as SVGElement | undefined;
    preview?.remove();
    this.textToolPreviewLastPoint = null;
  }

  /**
   * Shows or refreshes the text-tool placement ghost (root SVG, outside content group).
   * Typography matches {@link DrawingStyleDefaultsService}; position follows pointer in user space.
   */
  private syncTextToolPreviewPresentation(): void {
    if (this.editorTool.getCurrentTool() !== 'text' || !this.svgContent()) {
      this.destroyTextToolPreview();
      return;
    }
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;

    let preview = svg.findOne(`[${TEXT_TOOL_PREVIEW_DATA_ATTR}]`) as SVGElement | undefined;
    if (!preview) {
      preview = svg.plain('Text') as SVGElement;
      preview.attr(TEXT_TOOL_PREVIEW_DATA_ATTR, 'true');
    }
    applyTextTypographyFromDrawingDefaults(preview, this.drawingDefaults.defaults(), { previewOpacity: 0.55 });
    const pt = this.textToolPreviewLastPoint;
    if (pt) {
      preview.attr({ x: pt.x, y: pt.y });
      preview.attr('display', null);
    } else {
      preview.attr('display', 'none');
    }
  }

  updateTextToolPreviewFromClient(clientX: number, clientY: number): void {
    if (this.editorTool.getCurrentTool() !== 'text' || !this.svgContent()) return;
    const raw = this.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return;
    this.textToolPreviewLastPoint = raw;
    this.syncTextToolPreviewPresentation();
  }

  recordInsertAnchorFromClient(clientX: number, clientY: number): void {
    if (!this.svgContent()) return;
    if (!this.svgManipulation.getSVGInstance()) return;
    const raw = this.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return;
    this.rasterInsertAnchor.setFromDoc(raw.x, raw.y);
  }
}
