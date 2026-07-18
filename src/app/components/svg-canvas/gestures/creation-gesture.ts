import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { GestureRuntimeContext, Rect, Point } from './gesture-context';
import type { CreatableShapeType, ShapeCreationAttrs } from '../../../services/svg-manipulation.service';
import type { EditorTool } from '../../../services/editor-tool.service';
import { AddShapeCommand } from '../../../models/editor-commands';
import type { SmartGuideResult } from '../../../services/snap.service';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import type { RectCreationDefaultsSnapshot } from '../../../services/rect-creation-defaults.service';
import {
  clampRectCornerRadius,
  placeRectAtOrientation
} from '../../../utils/rect-creation-geometry';

const TOOL_TO_SHAPE: Partial<Record<EditorTool, CreatableShapeType>> = {
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line'
};

export type RectCreationDefaultsProvider = () => RectCreationDefaultsSnapshot;

/**
 * 8-way angle snap for line tool when Shift is held.
 * Snaps to the nearest multiple of 45 degrees.
 */
function snapToEightWay(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return { ...end };
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  return {
    x: start.x + len * Math.cos(snapped),
    y: start.y + len * Math.sin(snapped)
  };
}

export class CreationGesture {
  isActive = false;
  justEnded = false;

  private startClient: Point | null = null;
  private startSvg: Point | null = null;
  private currentSvg: Point | null = null;
  private shapeType: CreatableShapeType = 'rect';

  ghostRect: Rect | null = null;
  /** Corner radius in overlay pixels for rect ghost (rx = ry). */
  ghostCornerRadiusOverlay: number | null = null;
  /** Expose the current shape type for template rendering. */
  get activeShapeType(): CreatableShapeType { return this.shapeType; }
  /** For line ghost: start point in SVG user space. */
  ghostLineStart: Point | null = null;
  /** For line ghost: end point in SVG user space. */
  ghostLineEnd: Point | null = null;

  constructor(private readonly getRectDefaults?: RectCreationDefaultsProvider) {}

  start(
    ctx: GestureRuntimeContext,
    tool: EditorTool,
    event: MouseEvent
  ): boolean {
    const type = TOOL_TO_SHAPE[tool];
    if (!type) return false;
    if (!ctx.doc.svgManipulation.getSVGInstance()) return false;

    const svgPoint = ctx.pointer.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!svgPoint) return false;

    this.isActive = true;
    this.shapeType = type;
    this.startClient = { x: event.clientX, y: event.clientY };
    this.startSvg = svgPoint;
    this.currentSvg = svgPoint;
    this.ghostRect = null;
    this.ghostCornerRadiusOverlay = null;
    this.ghostLineStart = null;
    this.ghostLineEnd = null;
    return true;
  }

  move(ctx: GestureRuntimeContext, clientX: number, clientY: number, shiftKey: boolean): void {
    if (!this.isActive || !this.startClient || !this.startSvg) return;

    const raw = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return;

    const screenDx = Math.abs(clientX - this.startClient.x);
    const screenDy = Math.abs(clientY - this.startClient.y);
    if (screenDx < MARQUEE_MIN_DRAG_PX && screenDy < MARQUEE_MIN_DRAG_PX) {
      this.currentSvg = raw;
      this.ghostRect = null;
      this.ghostCornerRadiusOverlay = null;
      ctx.pointer.cdr.detectChanges();
      return;
    }

    const constrained = this.applyConstraint(raw, shiftKey);
    this.currentSvg = this.applySnap(ctx, this.startSvg, constrained, shiftKey);
    const bbox = this.computeGhostBbox(this.startSvg, this.currentSvg);
    this.ghostRect = ctx.pointer.svgBboxToOverlayPixels(bbox);
    this.ghostCornerRadiusOverlay =
      this.shapeType === 'rect' ? this.overlayCornerFromUserBbox(bbox, this.ghostRect) : null;
    if (this.shapeType === 'line') {
      this.ghostLineStart = this.startSvg;
      this.ghostLineEnd = this.currentSvg;
    } else {
      this.ghostLineStart = null;
      this.ghostLineEnd = null;
    }
    ctx.pointer.cdr.detectChanges();
  }

  end(
    ctx: GestureRuntimeContext,
    clientX: number,
    clientY: number,
    shiftKey: boolean
  ): string | null {
    if (!this.isActive || !this.startClient || !this.startSvg) {
      this.reset();
      return null;
    }

    const screenDx = Math.abs(clientX - this.startClient.x);
    const screenDy = Math.abs(clientY - this.startClient.y);
    const belowThreshold = screenDx < MARQUEE_MIN_DRAG_PX && screenDy < MARQUEE_MIN_DRAG_PX;

    if (belowThreshold) {
      if (this.shapeType === 'rect') {
        return this.commitRectClickPlace(ctx, this.startSvg);
      }
      this.justEnded = true;
      this.reset();
      ctx.pointer.cdr.detectChanges();
      return null;
    }

    const raw = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) {
      this.justEnded = true;
      this.reset();
      ctx.pointer.cdr.detectChanges();
      return null;
    }

    const constrained = this.applyConstraint(raw, shiftKey);
    const endPt = this.applySnap(ctx, this.startSvg, constrained, shiftKey);
    const attrs = this.computeAttrs(this.startSvg, endPt);

    return this.commitShape(ctx, attrs);
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  /** Abandon in-progress creation without committing a shape (e.g. tool deactivate). */
  abort(): void {
    this.reset();
  }

  private commitRectClickPlace(ctx: GestureRuntimeContext, anchor: Point): string | null {
    const defaults = this.getRectDefaults?.();
    const width = defaults?.width ?? 100;
    const height = defaults?.height ?? 100;
    const orientation = defaults?.orientation ?? 'top-left';
    const corner = clampRectCornerRadius(width, height, defaults?.cornerRadius ?? 0);
    const placed = placeRectAtOrientation(anchor, { width, height }, orientation);
    const attrs: ShapeCreationAttrs = {
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      ...(corner > 0 ? { rx: corner, ry: corner } : {})
    };
    return this.commitShape(ctx, attrs);
  }

  private commitShape(ctx: GestureRuntimeContext, attrs: ShapeCreationAttrs): string | null {
    const newId = ctx.doc.svgManipulation.addShape(this.shapeType, attrs);

    if (newId) {
      const svgInstance = ctx.doc.svgManipulation.getSVGInstance();
      const el = svgInstance?.findOne(`#${newId}`) as SvgJsElement | undefined;
      if (el) {
        const props = ctx.doc.svgManipulation.getShapeProperties(el);
        ctx.doc.shapeSelection.selectShapes([props]);
      }

      const cmd = new AddShapeCommand(ctx.doc.svgManipulation, newId, ctx.doc.shapeSelection);
      ctx.doc.editorHistory.pushAndExecute(cmd);

      const shapeBbox = ctx.doc.svgManipulation.getShapeBBox(newId);
      ctx.pointer.setLastBbox(shapeBbox);
      ctx.pointer.invalidateHighlightCache();
    }

    this.justEnded = true;
    this.reset();
    ctx.pointer.cdr.detectChanges();
    return newId;
  }

  private overlayCornerFromUserBbox(userBbox: Rect, overlayBbox: Rect): number | null {
    const defaults = this.getRectDefaults?.();
    const corner = clampRectCornerRadius(
      userBbox.width,
      userBbox.height,
      defaults?.cornerRadius ?? 0
    );
    if (corner <= 0 || userBbox.width <= 0) return null;
    return corner * (overlayBbox.width / userBbox.width);
  }

  private reset(): void {
    this.isActive = false;
    this.startClient = null;
    this.startSvg = null;
    this.currentSvg = null;
    this.ghostRect = null;
    this.ghostCornerRadiusOverlay = null;
    this.ghostLineStart = null;
    this.ghostLineEnd = null;
  }

  /**
   * Apply constraint modifiers based on shape type and Shift key:
   * - rect/ellipse + Shift: constrain to square/circle
   * - line + Shift: snap to nearest 45-degree angle
   */
  private applyConstraint(end: Point, shiftKey: boolean): Point {
    if (!shiftKey || !this.startSvg) return end;
    if (this.shapeType === 'line') {
      return snapToEightWay(this.startSvg, end);
    }
    const dx = end.x - this.startSvg.x;
    const dy = end.y - this.startSvg.y;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      x: this.startSvg.x + Math.sign(dx) * side,
      y: this.startSvg.y + Math.sign(dy) * side
    };
  }

  private applySnap(ctx: GestureRuntimeContext, start: Point, end: Point, shiftKey: boolean): Point {
    // Shift constraints intentionally win over snapping.
    if (shiftKey || ctx.snap.isSnapTemporarilyDisabled()) return end;

    const gridSnapped = ctx.snap.snap.snapToGrid(end);
    if (!ctx.snap.snap.shapeEnabled()) return gridSnapped;

    const startBBox = this.computeGhostBbox(start, gridSnapped);
    const guideResult: SmartGuideResult = ctx.snap.snap.snapDeltaToSmartGuides(
      startBBox,
      { x: 0, y: 0 },
      ctx.snap.getSmartGuideCandidates()
    );
    return {
      x: gridSnapped.x + guideResult.delta.x,
      y: gridSnapped.y + guideResult.delta.y
    };
  }

  /** Bounding box for the ghost outline (all shape types). */
  private computeGhostBbox(start: Point, end: Point): Rect {
    if (this.shapeType === 'line') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    }

    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);

    return { x, y, width: w, height: h };
  }

  /** Convert start+end points into shape-specific creation attributes. */
  private computeAttrs(start: Point, end: Point): ShapeCreationAttrs {
    if (this.shapeType === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      const defaults = this.getRectDefaults?.();
      const corner = clampRectCornerRadius(w, h, defaults?.cornerRadius ?? 0);
      return {
        x,
        y,
        width: w,
        height: h,
        ...(corner > 0 ? { rx: corner, ry: corner } : {})
      };
    }
    if (this.shapeType === 'ellipse') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      const rx = w / 2;
      const ry = h / 2;
      return { cx: x + rx, cy: y + ry, rx, ry };
    }
    // line: use actual endpoints
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }
}
