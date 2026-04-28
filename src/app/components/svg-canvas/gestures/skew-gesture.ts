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
import type { GestureContext, GhostPreviewFragment, Point, Rect } from './gesture-context';
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

  overlayRect: Rect | null = null;

  start(ctx: GestureContext, edge: SkewEdge, event: MouseEvent): boolean {
    const selectedIds = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (selectedIds.length === 0) return false;
    const union = ctx.svgManipulation.getUnionBBox(selectedIds);
    if (!union) return false;

    const p0 = ctx.clientToEditorSvgPoint(event.clientX, event.clientY);
    if (!p0) return false;

    this.edge = edge;
    this.unionStart = union;
    this.pivotDoc = unionSkewPivot(union);
    this.startPointerSvg = p0;
    this.currentAngleDeg = 0;
    this.snapshot = ctx.svgManipulation.snapshotSelectionTransforms(selectedIds);

    for (const id of selectedIds) {
      ctx.svgManipulation.setShapeVisibility(id, false);
    }

    this.overlayRect = ctx.svgBboxToOverlayPixels(union);

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
    if (!this.isActive || !this.edge || !this.unionStart || !this.startPointerSvg || this.ghostFragments.length === 0) {
      return;
    }
    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    this.currentAngleDeg = skewAngleDegFromPointer(this.edge, this.unionStart, this.startPointerSvg, point);
    this.updateGhost();
    ctx.cdr.detectChanges();
  }

  end(ctx: GestureContext): void {
    if (!this.isActive || !this.edge || !this.unionStart || !this.pivotDoc) return;
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    const axis = edgeToSkewAxis(this.edge);

    if (!isSkewCommitNoop(this.currentAngleDeg)) {
      const cmd = new SkewCommand(
        ctx.svgManipulation,
        ids,
        axis,
        this.currentAngleDeg,
        this.pivotDoc,
        this.snapshot
      );
      ctx.editorHistory.pushAndExecute(cmd);
    }

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
  }
}
