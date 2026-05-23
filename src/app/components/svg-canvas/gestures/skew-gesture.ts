import { Matrix } from '@svgdotjs/svg.js';
import { SkewCommand } from '../../../models/editor-commands';
import type { BBox } from '../../../utils/selection-resize';
import {
  edgeToSkewAxis,
  isSkewCommitNoop,
  skewAngleDegFromPointer,
  skewGhostWorldToUnionMatrix,
  unionSkewPivot,
  type SkewEdge
} from '../../../utils/selection-skew';
import type { GestureRuntimeContext, GhostPreviewFragment, Point, Rect } from './gesture-context';
import { computeGestureVisibilityToggleIds } from './gesture-visibility';
import { GhostSession } from './ghost-session';

export class SkewGesture {
  isActive = false;
  justEnded = false;

  private edge: SkewEdge | null = null;
  private unionStart: BBox | null = null;
  private pivotDoc: Point | null = null;
  private startPointerSvg: Point | null = null;
  private currentAngleDeg = 0;
  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();
  private visibilityShapeIds: string[] = [];

  overlayRect: Rect | null = null;

  start(ctx: GestureRuntimeContext, edge: SkewEdge, event: MouseEvent): boolean {
    const selectedIds = ctx.transformDoc.selectedShapeIds();
    if (selectedIds.length === 0) return false;
    const union = ctx.transformDoc.getUnionBBox(selectedIds);
    if (!union) return false;

    const p0 = ctx.pointer.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!p0) return false;

    this.edge = edge;
    this.unionStart = union;
    this.pivotDoc = unionSkewPivot(union);
    this.startPointerSvg = p0;
    this.currentAngleDeg = 0;
    this.snapshot = ctx.transformDoc.snapshotSelectionTransforms(selectedIds);

    this.overlayRect = ctx.pointer.svgBboxToOverlayPixels(union);

    const svgInstance = ctx.transformDoc.getSVGInstance();
    if (!svgInstance) {
      this.reset();
      return false;
    }

    this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.transformDoc.svgManipulation, union, selectedIds);
    if (this.ghostFragments.length === 0) {
      this.reset();
      return false;
    }

    const ordered = ctx.transformDoc.getShapeIdsInDomOrder(selectedIds);
    const primary = ordered[0] ?? selectedIds[0];
    this.visibilityShapeIds = computeGestureVisibilityToggleIds(svgInstance, selectedIds, primary);
    for (const id of this.visibilityShapeIds) {
      ctx.transformDoc.setShapeVisibility(id, false);
    }

    this.isActive = true;
    ctx.pointer.cdr.detectChanges();
    return true;
  }

  move(ctx: GestureRuntimeContext, clientX: number, clientY: number): void {
    if (!this.isActive || !this.edge || !this.unionStart || !this.startPointerSvg || this.ghostFragments.length === 0) {
      return;
    }
    const point = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    this.currentAngleDeg = skewAngleDegFromPointer(this.edge, this.unionStart, this.startPointerSvg, point);
    this.updateGhost();
    ctx.pointer.cdr.detectChanges();
  }

  end(ctx: GestureRuntimeContext): void {
    if (!this.isActive || !this.edge || !this.unionStart || !this.pivotDoc) return;
    const ids = ctx.transformDoc.selectedShapeIds();
    const axis = edgeToSkewAxis(this.edge);

    if (!isSkewCommitNoop(this.currentAngleDeg)) {
      const cmd = new SkewCommand(
        ctx.transformDoc.svgManipulation,
        ids,
        axis,
        this.currentAngleDeg,
        this.pivotDoc,
        this.snapshot
      );
      ctx.transformDoc.pushAndExecute(cmd);
    }

    for (const id of this.visibilityShapeIds) {
      ctx.transformDoc.setShapeVisibility(id, true);
    }

    this.ghost.removeFragments(this.ghostFragments);
    this.justEnded = true;

    const unionBbox = ctx.transformDoc.getUnionBBox(ids);
    ctx.pointer.setLastBbox(unionBbox);
    ctx.pointer.invalidateHighlightCache();

    this.reset();
    ctx.pointer.cdr.detectChanges();
  }

  cancel(ctx: GestureRuntimeContext): void {
    if (!this.isActive) return;
    for (const id of this.visibilityShapeIds) {
      ctx.transformDoc.setShapeVisibility(id, true);
    }
    this.ghost.removeFragments(this.ghostFragments);
    ctx.pointer.invalidateHighlightCache();
    this.reset();
    ctx.pointer.cdr.detectChanges();
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  private updateGhost(): void {
    if (!this.unionStart || !this.pivotDoc || this.ghostFragments.length === 0 || !this.edge) return;
    const axis = edgeToSkewAxis(this.edge);
    const T = skewGhostWorldToUnionMatrix(this.unionStart, this.pivotDoc, this.currentAngleDeg, axis);
    for (const f of this.ghostFragments) {
      f.worldToUnion.matrix(T);
    }
  }

  private reset(): void {
    this.isActive = false;
    this.edge = null;
    this.unionStart = null;
    this.pivotDoc = null;
    this.startPointerSvg = null;
    this.currentAngleDeg = 0;
    this.snapshot = new Map();
    this.ghostFragments = [];
    this.overlayRect = null;
    this.visibilityShapeIds = [];
  }
}
