import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { GestureContext, Rect, Point } from './gesture-context';
import type { CreatableShapeType, ShapeCreationAttrs } from '../../../services/svg-manipulation.service';
import type { EditorTool } from '../../../services/editor-tool.service';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';

const TOOL_TO_SHAPE: Partial<Record<EditorTool, CreatableShapeType>> = {
  rect: 'rect',
  ellipse: 'ellipse',
  line: 'line'
};

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

  start(
    ctx: GestureContext,
    tool: EditorTool,
    event: MouseEvent
  ): boolean {
    const type = TOOL_TO_SHAPE[tool];
    if (!type) return false;
    if (!ctx.svgManipulation.getSVGInstance()) return false;

    const svgPoint = ctx.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!svgPoint) return false;

    this.isActive = true;
    this.shapeType = type;
    this.startClient = { x: event.clientX, y: event.clientY };
    this.startSvg = svgPoint;
    this.currentSvg = svgPoint;
    this.ghostRect = null;
    return true;
  }

  move(ctx: GestureContext, clientX: number, clientY: number, shiftKey: boolean): void {
    if (!this.isActive || !this.startClient || !this.startSvg) return;

    const raw = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) return;

    const screenDx = Math.abs(clientX - this.startClient.x);
    const screenDy = Math.abs(clientY - this.startClient.y);
    if (screenDx < MARQUEE_MIN_DRAG_PX && screenDy < MARQUEE_MIN_DRAG_PX) {
      this.ghostRect = null;
      this.currentSvg = raw;
      ctx.cdr.detectChanges();
      return;
    }

    this.currentSvg = this.applyConstraint(raw, shiftKey);
    const bbox = this.computeGhostBbox(this.startSvg, this.currentSvg);
    this.ghostRect = ctx.svgBboxToOverlayPixels(bbox);
    ctx.cdr.detectChanges();
  }

  end(
    ctx: GestureContext,
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
    if (screenDx < MARQUEE_MIN_DRAG_PX && screenDy < MARQUEE_MIN_DRAG_PX) {
      this.justEnded = true;
      this.reset();
      ctx.cdr.detectChanges();
      return null;
    }

    const raw = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!raw) {
      this.justEnded = true;
      this.reset();
      ctx.cdr.detectChanges();
      return null;
    }

    const endPt = this.applyConstraint(raw, shiftKey);
    const attrs = this.computeAttrs(this.startSvg, endPt);

    const newId = ctx.svgManipulation.addShape(this.shapeType, attrs);

    if (newId) {
      const svgInstance = ctx.svgManipulation.getSVGInstance();
      const el = svgInstance?.findOne(`#${newId}`) as SvgJsElement | undefined;
      if (el) {
        const props = ctx.svgManipulation.getShapeProperties(el);
        ctx.shapeSelection.selectShapes([props]);
      }
      const shapeBbox = ctx.svgManipulation.getShapeBBox(newId);
      ctx.setLastBbox(shapeBbox);
      ctx.invalidateHighlightCache();
    }

    this.justEnded = true;
    this.reset();
    ctx.cdr.detectChanges();
    return newId;
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  private reset(): void {
    this.isActive = false;
    this.startClient = null;
    this.startSvg = null;
    this.currentSvg = null;
    this.ghostRect = null;
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
    return end;
  }

  /** Bounding box for the ghost outline (all shape types). */
  private computeGhostBbox(start: Point, end: Point): Rect {
    if (this.shapeType === 'line') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      return { x, y, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    }

    let w = Math.abs(end.x - start.x);
    let h = Math.abs(end.y - start.y);
    let x = Math.min(start.x, end.x);
    let y = Math.min(start.y, end.y);

    return { x, y, width: w, height: h };
  }

  /** Convert start+end points into shape-specific creation attributes. */
  private computeAttrs(start: Point, end: Point): ShapeCreationAttrs {
    if (this.shapeType === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);
      return { x, y, width: w, height: h };
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
