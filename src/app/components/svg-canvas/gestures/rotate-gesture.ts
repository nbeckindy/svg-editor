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
import { GhostSession } from './ghost-session';

export class RotateGesture {
  isActive = false;
  justEnded = false;

  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();
  private lastPointerSvg: Point | null = null;
  private startPointerRad: number | null = null;

  unionStart: BBox | null = null;
  pivotDoc: Point | null = null;
  accumulatedRad = 0;

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

    for (const id of selectedIds) {
      ctx.svgManipulation.setShapeVisibility(id, false);
    }

    const p0 = ctx.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!p0) {
      for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
      this.reset();
      return false;
    }
    this.lastPointerSvg = p0;
    this.startPointerRad = this.pointerAngleRad(p0);

    const svgInstance = ctx.svgManipulation.getSVGInstance();
    if (!svgInstance) {
      for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
      this.reset();
      return false;
    }

    this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.svgManipulation, union, selectedIds);
    if (this.ghostFragments.length === 0) {
      for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
      this.reset();
      return false;
    }

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
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    for (const id of ids) {
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

    for (const id of ids) {
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
    this.isActive = false;
    this.unionStart = null;
    this.pivotDoc = null;
    this.accumulatedRad = 0;
    this.lastPointerSvg = null;
    this.startPointerRad = null;
    this.snapshot = new Map();
    this.ghostFragments = [];
  }

  private pointerAngleRad(pointer: Point): number | null {
    if (!this.pivotDoc) return null;
    const dx = pointer.x - this.pivotDoc.x;
    const dy = pointer.y - this.pivotDoc.y;
    if (Math.hypot(dx, dy) <= 1e-6) return null;
    return Math.atan2(dy, dx);
  }
}
