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

  move(ctx: GestureContext, clientX: number, clientY: number): void {
    if (
      !this.isActive ||
      this.ghostFragments.length === 0 ||
      !this.unionStart ||
      !this.pivotDoc ||
      !this.lastPointerSvg
    ) return;

    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    const d = rotationDeltaFromPointerMoveRad(this.pivotDoc, this.lastPointerSvg, point);
    this.accumulatedRad += d;
    this.lastPointerSvg = point;
    this.updateGhost();
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
    this.snapshot = new Map();
    this.ghostFragments = [];
  }
}
