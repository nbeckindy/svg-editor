import { SVG, Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import {
  EditorCommand,
  CompositeCommand,
  TranslateCommand
} from '../../../models/editor-commands';
import { SmartGuideResult } from '../../../services/snap.service';
import type { GestureRuntimeContext, GhostPreviewFragment, Rect, Point } from './gesture-context';
import { computeGestureVisibilityToggleIds } from './gesture-visibility';
import { GhostSession } from './ghost-session';

export class DragGesture {
  private static readonly AXIS_CONSTRAINT_THRESHOLD = 4;

  isActive = false;
  justEnded = false;

  private shapeIds: string[] = [];
  /** Elements toggled for drag preview hide/show (often one ancestor `<g>`, not every leaf). */
  private visibilityShapeIds: string[] = [];
  private startSvg: Point | null = null;
  private startBbox: Rect | null = null;
  private snapAnchor: Point | null = null;
  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();
  private lastSnappedDelta: Point = { x: 0, y: 0 };
  private hasPreviewDelta = false;
  private smartGuides: SmartGuideResult['guides'] = { vertical: [], horizontal: [] };

  overlayRect: Rect | null = null;

  start(
    ctx: GestureRuntimeContext,
    selectedIds: string[],
    effectiveDragId: string,
    point: Point,
    event: MouseEvent
  ): boolean {
    const svgInstance = ctx.transformDoc.svgManipulation.getSVGInstance();
    if (!svgInstance) return false;

    this.visibilityShapeIds = computeGestureVisibilityToggleIds(
      svgInstance,
      selectedIds,
      effectiveDragId
    );

    try {
      if (selectedIds.length === 1) {
        const bbox = ctx.transformDoc.svgManipulation.getShapeBBox(effectiveDragId);
        if (!bbox) {
          this.visibilityShapeIds = [];
          return false;
        }
        this.startBbox = bbox;
        const effectiveEl = svgInstance.findOne(`#${effectiveDragId}`) as SvgJsElement | undefined;
        const effectiveNode = effectiveEl?.node as Element | undefined;
        const target = event.target as Element;
        const shapeScreenRect =
          effectiveNode && typeof effectiveNode.getBoundingClientRect === 'function'
            ? effectiveNode.getBoundingClientRect()
            : target.getBoundingClientRect();
        this.createSingleGhost(ctx, effectiveDragId, bbox, shapeScreenRect);
      } else {
        const unionBbox = ctx.transformDoc.svgManipulation.getUnionBBox(selectedIds);
        if (!unionBbox) {
          this.visibilityShapeIds = [];
          return false;
        }
        this.startBbox = unionBbox;
        this.overlayRect = ctx.pointer.svgBboxToOverlayPixels(unionBbox);
        this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.transformDoc.svgManipulation, unionBbox, selectedIds);
        ctx.pointer.cdr.detectChanges();
      }

      if (this.ghostFragments.length === 0) {
        this.visibilityShapeIds = [];
        return false;
      }
    } catch (e: unknown) {
      this.visibilityShapeIds = [];
      throw e instanceof Error ? e : new Error(String(e));
    }

    for (const id of this.visibilityShapeIds) {
      ctx.transformDoc.svgManipulation.setShapeVisibility(id, false);
    }

    this.isActive = true;
    this.shapeIds = selectedIds;
    this.startSvg = { x: point.x, y: point.y };
    this.snapshot = ctx.transformDoc.svgManipulation.snapshotSelectionTransforms(selectedIds);
    this.snapAnchor = this.startBbox
      ? { x: this.startBbox.x, y: this.startBbox.y }
      : this.startSvg;
    return true;
  }

  move(ctx: GestureRuntimeContext, clientX: number, clientY: number, constrainAxis = false): void {
    if (!this.isActive || this.ghostFragments.length === 0 || !this.startSvg || !this.startBbox) return;
    const currentSvg = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
    if (!currentSvg) return;
    const { dx, dy } = this.resolveSnappedDelta(ctx, currentSvg.x, currentSvg.y, constrainAxis);
    this.lastSnappedDelta = { x: dx, y: dy };
    this.hasPreviewDelta = true;
    const rawDelta = {
      x: dx,
      y: dy
    };
    const currentBbox: Rect = {
      x: this.startBbox.x + rawDelta.x,
      y: this.startBbox.y + rawDelta.y,
      width: this.startBbox.width,
      height: this.startBbox.height
    };
    this.overlayRect = ctx.pointer.svgBboxToOverlayPixels(currentBbox);
    if (this.ghostFragments.length > 0 && this.startBbox) {
      const m = new Matrix().translate(dx, dy);
      for (const f of this.ghostFragments) {
        (f.outerGroup as Svg).matrix(m);
      }
    }
  }

  end(ctx: GestureRuntimeContext, clientX: number, clientY: number, constrainAxis = false): void {
    if (!this.isActive || this.shapeIds.length === 0 || !this.startSvg) return;
    let dx = 0;
    let dy = 0;
    if (this.hasPreviewDelta) {
      dx = this.lastSnappedDelta.x;
      dy = this.lastSnappedDelta.y;
    } else {
      const point = ctx.pointer.clientToEditorSvgPoint(clientX, clientY);
      if (point) {
        const delta = this.resolveSnappedDelta(ctx, point.x, point.y, constrainAxis);
        dx = delta.dx;
        dy = delta.dy;
      }
    }
    const dragCmds: EditorCommand[] = this.shapeIds.map(
      (id) => new TranslateCommand(ctx.transformDoc.svgManipulation, id, dx, dy, this.snapshot)
    );
    ctx.transformDoc.editorHistory.pushAndExecute(
      dragCmds.length === 1 ? dragCmds[0] : new CompositeCommand(dragCmds, 'Move shapes')
    );
    for (const shapeId of this.visibilityShapeIds) {
      ctx.transformDoc.svgManipulation.setShapeVisibility(shapeId, true);
    }
    this.ghost.removeFragments(this.ghostFragments);
    this.justEnded = true;

    const selectedIds = ctx.transformDoc.shapeSelection.getSelectedShapes().map((s) => s.id);
    const unionBbox = ctx.transformDoc.svgManipulation.getUnionBBox(selectedIds);
    ctx.pointer.setLastBbox(unionBbox);
    ctx.pointer.invalidateHighlightCache();

    this.reset();
    ctx.pointer.cdr.detectChanges();
  }

  cancel(ctx: GestureRuntimeContext): void {
    if (!this.isActive) return;
    for (const shapeId of this.visibilityShapeIds) {
      ctx.transformDoc.svgManipulation.setShapeVisibility(shapeId, true);
    }
    this.ghost.removeFragments(this.ghostFragments);
    ctx.pointer.invalidateHighlightCache();
    this.reset();
    ctx.pointer.cdr.detectChanges();
  }

  private restoreDragVisibility(ctx: GestureRuntimeContext): void {
    for (const id of this.visibilityShapeIds) {
      ctx.transformDoc.svgManipulation.setShapeVisibility(id, true);
    }
    this.visibilityShapeIds = [];
  }

  private reset(): void {
    this.overlayRect = null;
    this.isActive = false;
    this.shapeIds = [];
    this.visibilityShapeIds = [];
    this.startSvg = null;
    this.startBbox = null;
    this.snapAnchor = null;
    this.snapshot = new Map();
    this.ghostFragments = [];
    this.lastSnappedDelta = { x: 0, y: 0 };
    this.hasPreviewDelta = false;
    this.smartGuides = { vertical: [], horizontal: [] };
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  private createSingleGhost(
    ctx: GestureRuntimeContext,
    shapeId: string,
    bbox: Rect,
    shapeScreenRect: DOMRect
  ): void {
    const svgInstance = ctx.transformDoc.svgManipulation.getSVGInstance();
    if (!svgInstance) return;
    const rootSvg = svgInstance.node as SVGSVGElement;
    const built = this.ghost.buildShapeSubtree(shapeId, svgInstance, rootSvg);
    if (!built) return;
    const contentGroupEl = this.ghost.getContentGroupEl(svgInstance);
    const shapeNode = svgInstance.findOne(`#${shapeId}`)?.node as Element | undefined;
    if (!contentGroupEl || !shapeNode) return;

    this.ghost.installDefs(rootSvg, built.urlRefs);
    if (built.urlRefs.size > 0) {
      this.ghost.rewriteUrlRefs(built.subtree, built.urlRefs);
    }

    const frag = this.ghost.mountFragment(svgInstance, contentGroupEl, shapeNode, bbox, built.subtree);
    this.ghostFragments = [frag];

    const overlayContainer = ctx.pointer.highlightOverlayContainer()?.nativeElement;
    this.overlayRect = overlayContainer
      ? {
          x: shapeScreenRect.left - overlayContainer.getBoundingClientRect().left,
          y: shapeScreenRect.top - overlayContainer.getBoundingClientRect().top,
          width: shapeScreenRect.width,
          height: shapeScreenRect.height
        }
      : ctx.pointer.svgBboxToOverlayPixels(bbox);
    ctx.pointer.cdr.detectChanges();
  }

  get activeGuides(): SmartGuideResult['guides'] {
    return this.smartGuides;
  }

  private resolveSnappedDelta(
    ctx: GestureRuntimeContext,
    svgX: number,
    svgY: number,
    constrainAxis: boolean
  ): { dx: number; dy: number } {
    if (!this.startSvg || !this.startBbox) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return { dx: 0, dy: 0 };
    }
    const rawDelta = {
      x: svgX - this.startSvg.x,
      y: svgY - this.startSvg.y
    };
    const axisConstrained = this.applyAxisConstraint(rawDelta, constrainAxis);
    const snappingDisabled = ctx.snap.isSnapTemporarilyDisabled();
    if (snappingDisabled) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return { dx: axisConstrained.x, dy: axisConstrained.y };
    }
    const gridSnappedDelta = this.snapAnchor
      ? ctx.snap.snap.snapDelta(this.startSvg, axisConstrained, { anchor: this.snapAnchor })
      : axisConstrained;
    if (!ctx.snap.snap.shapeEnabled()) {
      this.smartGuides = { vertical: [], horizontal: [] };
      return { dx: gridSnappedDelta.x, dy: gridSnappedDelta.y };
    }
    const guideResult = ctx.snap.snap.snapDeltaToSmartGuides(
      this.startBbox,
      gridSnappedDelta,
      ctx.snap.getSmartGuideCandidates(),
      { selectedShapeIds: this.shapeIds }
    );
    this.smartGuides = guideResult.guides;
    return { dx: guideResult.delta.x, dy: guideResult.delta.y };
  }

  private applyAxisConstraint(rawDelta: Point, constrainAxis: boolean): Point {
    if (!constrainAxis) return rawDelta;
    const dominantDelta = Math.max(Math.abs(rawDelta.x), Math.abs(rawDelta.y));
    if (dominantDelta < DragGesture.AXIS_CONSTRAINT_THRESHOLD) return rawDelta;
    if (Math.abs(rawDelta.x) >= Math.abs(rawDelta.y)) return { x: rawDelta.x, y: 0 };
    return { x: 0, y: rawDelta.y };
  }
}
