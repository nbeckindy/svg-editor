import { Matrix, Svg } from '@svgdotjs/svg.js';
import { UnionScaleCommand } from '../../../models/editor-commands';
import { computeProportionalResizedUnion, type BBox, type ResizeCorner } from '../../../utils/selection-resize';
import type { GestureContext, GhostPreviewFragment, Rect } from './gesture-context';
import { GhostSession } from './ghost-session';

const GHOST_SVG_MIN_PX = 1e-6;

export class ResizeGesture {
  isActive = false;
  justEnded = false;

  private handle: ResizeCorner | null = null;
  private unionStart: BBox | null = null;
  private lastUnion: BBox | null = null;
  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();

  overlayRect: Rect | null = null;

  get unionStartBbox(): BBox | null {
    return this.unionStart;
  }

  start(ctx: GestureContext, corner: ResizeCorner, event: MouseEvent): boolean {
    const selectedIds = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (selectedIds.length === 0) return false;
    const union = ctx.svgManipulation.getUnionBBox(selectedIds);
    if (!union) return false;

    this.unionStart = union;
    this.handle = corner;
    this.snapshot = ctx.svgManipulation.snapshotSelectionTransforms(selectedIds);

    for (const id of selectedIds) {
      ctx.svgManipulation.setShapeVisibility(id, false);
    }

    this.lastUnion = union;
    this.overlayRect = ctx.svgBboxToOverlayPixels(union);

    const svgInstance = ctx.svgManipulation.getSVGInstance();
    if (svgInstance) {
      this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.svgManipulation, union, selectedIds);
    }

    this.isActive = true;
    ctx.cdr.detectChanges();
    return true;
  }

  move(ctx: GestureContext, clientX: number, clientY: number): void {
    if (!this.isActive || !this.handle || !this.unionStart || this.ghostFragments.length === 0) return;
    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    const unionAfter = computeProportionalResizedUnion(this.unionStart, this.handle, point);
    this.lastUnion = unionAfter;
    this.overlayRect = ctx.svgBboxToOverlayPixels(unionAfter);
    this.updateGhost(unionAfter);
    ctx.cdr.detectChanges();
  }

  end(ctx: GestureContext): void {
    if (!this.isActive || !this.handle || !this.unionStart || !this.lastUnion) return;
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    const cmd = new UnionScaleCommand(
      ctx.svgManipulation, ids,
      this.unionStart, this.lastUnion,
      this.snapshot, this.handle
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

  private updateGhost(unionAfter: BBox): void {
    if (this.ghostFragments.length === 0) return;

    const uw = Math.max(unionAfter.width, GHOST_SVG_MIN_PX);
    const uh = Math.max(unionAfter.height, GHOST_SVG_MIN_PX);
    const m = new Matrix().translate(-unionAfter.x, -unionAfter.y);
    for (const f of this.ghostFragments) {
      f.nestedSvg.attr({ x: unionAfter.x, y: unionAfter.y, width: uw, height: uh });
      f.nestedSvg.viewbox(0, 0, unionAfter.width, unionAfter.height);
      (f.nestedSvg as Svg).size(uw, uh);
      f.worldToUnion.matrix(m);
    }
  }

  private reset(): void {
    this.overlayRect = null;
    this.isActive = false;
    this.handle = null;
    this.unionStart = null;
    this.lastUnion = null;
    this.snapshot = new Map();
    this.ghostFragments = [];
  }
}
