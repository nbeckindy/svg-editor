import { Matrix, Svg } from '@svgdotjs/svg.js';
import { UnionScaleCommand, UnionScaleFromCenterCommand } from '../../../models/editor-commands';
import { SmartGuideResult } from '../../../services/snap.service';
import {
  computeCenterAnchoredResize,
  computeEdgeAspectLockedResizedUnion,
  computeEdgeNonUniformResizedUnion,
  computeNonUniformCornerResizedUnion,
  computeProportionalResizedUnion,
  isResizeEdge,
  type BBox,
  type ResizeHandle
} from '../../../utils/selection-resize';
import type { GestureRuntimeContext, GhostPreviewFragment, Rect } from './gesture-context';
import { computeGestureVisibilityToggleIds } from './gesture-visibility';
import { GhostSession } from './ghost-session';

const GHOST_SVG_MIN_PX = 1e-6;

export class ResizeGesture {
  isActive = false;
  justEnded = false;

  private handle: ResizeHandle | null = null;
  private unionStart: BBox | null = null;
  private lastUnion: BBox | null = null;
  private snapshot: Map<string, Matrix> = new Map();
  private vectorEffectSnapshot: Map<string, (string | null)[]> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();
  private smartGuides: SmartGuideResult['guides'] = { vertical: [], horizontal: [] };
  private visibilityShapeIds: string[] = [];

  overlayRect: Rect | null = null;

  get unionStartBbox(): BBox | null {
    return this.unionStart;
  }

  start(ctx: GestureRuntimeContext, handle: ResizeHandle, _event: MouseEvent): boolean {
    const selectedIds = ctx.transformDoc.selectedShapeIds();
    if (selectedIds.length === 0) return false;
    const union = ctx.transformDoc.getUnionBBox(selectedIds);
    if (!union) return false;

    this.unionStart = union;
    this.handle = handle;
    this.snapshot = ctx.transformDoc.snapshotSelectionTransforms(selectedIds);
    this.vectorEffectSnapshot = ctx.transformDoc.snapshotVectorEffectsForShapes(selectedIds);

    this.lastUnion = union;
    this.overlayRect = ctx.pointer.svgBboxToOverlayPixels(union);

    const svgInstance = ctx.transformDoc.getSVGInstance();
    if (!svgInstance) {
      return false;
    }
    this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.transformDoc, union, selectedIds);
    if (this.ghostFragments.length === 0) {
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

  move(
    ctx: GestureRuntimeContext,
    clientX: number,
    clientY: number,
    centerAnchored: boolean,
    shiftKey: boolean
  ): void {
    if (!this.isActive || !this.handle || !this.unionStart || this.ghostFragments.length === 0) return;
    const point = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
    if (!point) return;
    const resolved = this.resolveResizedUnion(ctx, point.x, point.y, centerAnchored, shiftKey);
    this.lastUnion = resolved;
    this.overlayRect = ctx.pointer.svgBboxToOverlayPixels(resolved);
    this.updateGhost(resolved);
    ctx.pointer.cdr.detectChanges();
  }

  end(ctx: GestureRuntimeContext, centerAnchored: boolean): void {
    if (!this.isActive || !this.handle || !this.unionStart || !this.lastUnion) return;
    const ids = ctx.transformDoc.selectedShapeIds();
    const ve = this.vectorEffectSnapshot;
    if (centerAnchored) {
      const cmd = new UnionScaleFromCenterCommand(
        ctx.transformDoc.commandSvg(),
        ids,
        this.unionStart,
        this.lastUnion,
        this.snapshot,
        ve
      );
      ctx.transformDoc.pushAndExecute(cmd);
    } else {
      const cmd = new UnionScaleCommand(
        ctx.transformDoc.commandSvg(),
        ids,
        this.unionStart,
        this.lastUnion,
        this.snapshot,
        this.handle,
        ve
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

  private updateGhost(unionAfter: BBox): void {
    if (this.ghostFragments.length === 0) return;

    const uw = Math.max(Math.abs(unionAfter.width), GHOST_SVG_MIN_PX);
    const uh = Math.max(Math.abs(unionAfter.height), GHOST_SVG_MIN_PX);
    const m = new Matrix().translate(-unionAfter.x, -unionAfter.y);
    for (const f of this.ghostFragments) {
      f.nestedSvg.attr({ x: unionAfter.x, y: unionAfter.y, width: uw, height: uh });
      f.nestedSvg.viewbox(0, 0, Math.abs(unionAfter.width), Math.abs(unionAfter.height));
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
    this.vectorEffectSnapshot = new Map();
    this.ghostFragments = [];
    this.smartGuides = { vertical: [], horizontal: [] };
    this.visibilityShapeIds = [];
  }

  get activeGuides(): SmartGuideResult['guides'] {
    return this.smartGuides;
  }

  private computeRawUnion(svgX: number, svgY: number, centerAnchored: boolean, shiftKey: boolean): BBox {
    if (!this.unionStart || !this.handle) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const p = { x: svgX, y: svgY };
    if (centerAnchored) {
      return computeCenterAnchoredResize(this.unionStart, p);
    }
    if (isResizeEdge(this.handle)) {
      if (shiftKey) {
        return computeEdgeAspectLockedResizedUnion(this.unionStart, this.handle, p);
      }
      return computeEdgeNonUniformResizedUnion(this.unionStart, this.handle, p);
    }
    if (shiftKey) {
      return computeProportionalResizedUnion(this.unionStart, this.handle, p);
    }
    return computeNonUniformCornerResizedUnion(this.unionStart, this.handle, p);
  }

  private resolveResizedUnion(
    ctx: GestureRuntimeContext,
    svgX: number,
    svgY: number,
    centerAnchored: boolean,
    shiftKey: boolean
  ): BBox {
    if (!this.unionStart || !this.handle) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    const resizedUnion = this.computeRawUnion(svgX, svgY, centerAnchored, shiftKey);
    if (ctx.snap.isSnapTemporarilyDisabled() || !ctx.snap.snap.shapeEnabled()) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return resizedUnion;
    }
    const rawDelta = {
      x: resizedUnion.x - this.unionStart.x,
      y: resizedUnion.y - this.unionStart.y
    };
    const guideResult = ctx.snap.snap.snapDeltaToSmartGuides(
      this.unionStart,
      rawDelta,
      ctx.snap.getSmartGuideCandidates(),
      { selectedShapeIds: ctx.transformDoc.selectedShapeIds() }
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
