import { Matrix } from '@svgdotjs/svg.js';
import { UnionRotateCommand } from '../../../models/editor-commands';
import {
  unionRotationPivot,
  rotationDeltaFromPointerMoveRad,
  radiansToDegrees,
  rotateGhostWorldToUnionMatrix
} from '../../../utils/selection-rotate';
import type { BBox } from '../../../utils/selection-resize';
import type { GestureContext, GhostPreviewFragment, Point } from './gesture-context';
import { computeGestureVisibilityToggleIds } from './gesture-visibility';
import { GhostSession } from './ghost-session';

/** Hotspot (px) for the 32×32 rotate cursor artwork. */
const ROTATE_CURSOR_HOTSPOT = 16;

/**
 * CSS `cursor` value for the rotation gesture: inline SVG with native `grab` fallback (TUX-7).
 * Browsers use `grab` when the custom cursor cannot be decoded or loaded.
 */
export function buildRotateGestureCursorCss(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    '<path d="M16 6a10 10 0 1 1-9.2 6.2" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M8 10 5 5l6-1" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  const href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return `url("${href}") ${ROTATE_CURSOR_HOTSPOT} ${ROTATE_CURSOR_HOTSPOT}, grab`;
}

export class RotateGesture {
  isActive = false;
  justEnded = false;

  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();
  private lastPointerSvg: Point | null = null;
  private startPointerRad: number | null = null;
  /** Prior `document.body.style.cursor` while rotate cursor is applied; null when not pushed. */
  private savedBodyCursor: string | null = null;

  unionStart: BBox | null = null;
  pivotDoc: Point | null = null;
  accumulatedRad = 0;
  /** Same ids passed to {@link computeGestureVisibilityToggleIds} after ghost build; restored on end/cancel. */
  private visibilityShapeIds: string[] = [];

  start(ctx: GestureContext, event: MouseEvent): boolean {
    const selectedIds = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (selectedIds.length === 0) return false;
    const union = ctx.svgManipulation.getUnionBBox(selectedIds);
    if (!union) return false;

    const unionCenterPivot = unionRotationPivot(union);
    const geomPivot = ctx.svgManipulation.getSelectionRotationPivot(selectedIds);
    const pivot = geomPivot ?? unionCenterPivot;

    this.unionStart = union;
    this.pivotDoc = pivot;
    this.accumulatedRad = 0;
    this.snapshot = ctx.svgManipulation.snapshotSelectionTransforms(selectedIds);

    const p0 = ctx.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!p0) {
      this.reset();
      return false;
    }
    this.lastPointerSvg = p0;
    this.startPointerRad = this.pointerAngleRad(p0);

    const svgInstance = ctx.svgManipulation.getSVGInstance();
    if (!svgInstance) {
      this.reset();
      return false;
    }

    this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.svgManipulation, union, selectedIds);
    if (this.ghostFragments.length === 0) {
      this.reset();
      return false;
    }

    const ordered = ctx.svgManipulation.getShapeIdsInDomOrder(selectedIds);
    const primary = ordered[0] ?? selectedIds[0];
    this.visibilityShapeIds = computeGestureVisibilityToggleIds(svgInstance, selectedIds, primary);
    for (const id of this.visibilityShapeIds) {
      ctx.svgManipulation.setShapeVisibility(id, false);
    }

    this.pushRotateCursor();
    this.isActive = true;
    ctx.cdr.detectChanges();
    return true;
  }

  move(ctx: GestureContext, clientX: number, clientY: number, snapToStep = false): void {
    if (
      !this.isActive ||
      this.ghostFragments.length === 0 ||
      !this.unionStart ||
      !this.pivotDoc ||
      !this.lastPointerSvg
    ) return;

    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    let nextAccumulated = this.accumulatedRad + rotationDeltaFromPointerMoveRad(this.pivotDoc, this.lastPointerSvg, point);
    if (snapToStep && this.startPointerRad !== null) {
      const absolute = this.startPointerRad + nextAccumulated;
      const step = (15 * Math.PI) / 180;
      const snappedAbsolute = Math.round(absolute / step) * step;
      nextAccumulated = snappedAbsolute - this.startPointerRad;
    }
    this.accumulatedRad = nextAccumulated;
    this.lastPointerSvg = point;
    this.updateGhost();
    ctx.cdr.detectChanges();
  }

  cancel(ctx: GestureContext): void {
    if (!this.isActive) return;
    for (const id of this.visibilityShapeIds) {
      ctx.svgManipulation.setShapeVisibility(id, true);
    }
    this.ghost.removeFragments(this.ghostFragments);
    ctx.invalidateHighlightCache();
    this.reset();
    ctx.cdr.detectChanges();
  }

  end(ctx: GestureContext): void {
    if (!this.isActive || !this.unionStart || !this.pivotDoc) return;
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    const cmd = new UnionRotateCommand(
      ctx.svgManipulation, ids,
      this.pivotDoc, radiansToDegrees(this.accumulatedRad),
      this.snapshot
    );
    ctx.editorHistory.pushAndExecute(cmd);

    for (const id of this.visibilityShapeIds) {
      ctx.svgManipulation.setShapeVisibility(id, true);
    }

    this.ghost.removeFragments(this.ghostFragments);
    this.justEnded = true;

    const unionBbox = ctx.svgManipulation.getUnionBBox(ids);
    ctx.setLastBbox(unionBbox);
    ctx.invalidateHighlightCache();

    this.reset();
    ctx.cdr.detectChanges();
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  private updateGhost(): void {
    if (!this.unionStart || this.ghostFragments.length === 0 || !this.pivotDoc) return;
    const T = rotateGhostWorldToUnionMatrix(this.unionStart, this.pivotDoc, this.accumulatedRad);
    for (const f of this.ghostFragments) {
      f.worldToUnion.matrix(T);
    }
  }

  private reset(): void {
    this.popRotateCursor();
    this.isActive = false;
    this.unionStart = null;
    this.pivotDoc = null;
    this.accumulatedRad = 0;
    this.lastPointerSvg = null;
    this.startPointerRad = null;
    this.snapshot = new Map();
    this.ghostFragments = [];
    this.visibilityShapeIds = [];
  }

  private pointerAngleRad(pointer: Point): number | null {
    if (!this.pivotDoc) return null;
    const dx = pointer.x - this.pivotDoc.x;
    const dy = pointer.y - this.pivotDoc.y;
    if (Math.hypot(dx, dy) <= 1e-6) return null;
    return Math.atan2(dy, dx);
  }

  private pushRotateCursor(): void {
    if (this.savedBodyCursor !== null) return;
    this.savedBodyCursor = document.body.style.cursor;
    document.body.style.cursor = buildRotateGestureCursorCss();
  }

  private popRotateCursor(): void {
    if (this.savedBodyCursor === null) return;
    document.body.style.cursor = this.savedBodyCursor;
    this.savedBodyCursor = null;
  }
}
