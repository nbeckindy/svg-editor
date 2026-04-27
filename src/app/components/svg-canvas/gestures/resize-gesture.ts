import { Matrix, Svg } from '@svgdotjs/svg.js';
import { UnionScaleCommand } from '../../../models/editor-commands';
import { SmartGuideResult } from '../../../services/snap.service';
import {
  computeCenterAnchoredResize,
  computeProportionalResizedUnion,
  type BBox,
  type ResizeCorner
} from '../../../utils/selection-resize';
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
  private smartGuides: SmartGuideResult['guides'] = { vertical: [], horizontal: [] };

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

  move(ctx: GestureContext, clientX: number, clientY: number, centerAnchored = false): void {
    if (!this.isActive || !this.handle || !this.unionStart || this.ghostFragments.length === 0) return;
    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    const resolved = this.resolveResizedUnion(ctx, point.x, point.y, centerAnchored);
    this.lastUnion = resolved;
    this.overlayRect = ctx.svgBboxToOverlayPixels(resolved);
    this.updateGhost(resolved);
    ctx.cdr.detectChanges();
  }

  end(ctx: GestureContext, centerAnchored = false): void {
    if (!this.isActive || !this.handle || !this.unionStart || !this.lastUnion) return;
    const ids = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (centerAnchored) {
      ctx.svgManipulation.applyUnionScaleFromCenter(ids, this.unionStart, this.lastUnion, this.snapshot);
    } else {
      const cmd = new UnionScaleCommand(
        ctx.svgManipulation, ids,
        this.unionStart, this.lastUnion,
        this.snapshot, this.handle
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
    this.smartGuides = { vertical: [], horizontal: [] };
  }

  get activeGuides(): SmartGuideResult['guides'] {
    return this.smartGuides;
  }

  private resolveResizedUnion(
    ctx: GestureContext,
    svgX: number,
    svgY: number,
    centerAnchored: boolean
  ): BBox {
    if (!this.unionStart || !this.handle) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const resizedUnion = centerAnchored
      ? computeCenterAnchoredResize(this.unionStart, { x: svgX, y: svgY })
      : computeProportionalResizedUnion(this.unionStart, this.handle, { x: svgX, y: svgY });
    if (ctx.isSnapTemporarilyDisabled() || !ctx.snap.shapeEnabled()) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return resizedUnion;
    }
    const rawDelta = {
      x: resizedUnion.x - this.unionStart.x,
      y: resizedUnion.y - this.unionStart.y
    };
    const guideResult = ctx.snap.snapDeltaToSmartGuides(
      this.unionStart,
      rawDelta,
      ctx.getSmartGuideCandidates(),
      { selectedShapeIds: ctx.shapeSelection.getSelectedShapes().map((shape) => shape.id) }
    );
    this.smartGuides = guideResult.guides;
    return {
      x: this.unionStart.x + guideResult.delta.x,
      y: this.unionStart.y + guideResult.delta.y,
      width: resizedUnion.width,
      height: resizedUnion.height
    };
  }
}
