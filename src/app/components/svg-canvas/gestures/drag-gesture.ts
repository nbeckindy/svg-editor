import { SVG, Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import {
  EditorCommand,
  CompositeCommand,
  TranslateCommand
} from '../../../models/editor-commands';
import type { GestureContext, GhostPreviewFragment, Rect, Point } from './gesture-context';
import { GhostSession } from './ghost-session';

export class DragGesture {
  isActive = false;
  justEnded = false;

  private shapeIds: string[] = [];
  private startSvg: Point | null = null;
  private startBbox: Rect | null = null;
  private snapshot: Map<string, Matrix> = new Map();
  private ghostFragments: GhostPreviewFragment[] = [];
  private ghost = new GhostSession();

  overlayRect: Rect | null = null;

  start(
    ctx: GestureContext,
    selectedIds: string[],
    effectiveDragId: string,
    point: Point,
    event: MouseEvent
  ): boolean {
    const svgInstance = ctx.svgManipulation.getSVGInstance();
    if (!svgInstance) return false;

    for (const id of selectedIds) {
      ctx.svgManipulation.setShapeVisibility(id, false);
    }

    if (selectedIds.length === 1) {
      const bbox = ctx.svgManipulation.getShapeBBox(effectiveDragId);
      if (!bbox) {
        for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
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
      const unionBbox = ctx.svgManipulation.getUnionBBox(selectedIds);
      if (!unionBbox) {
        for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
        return false;
      }
      this.startBbox = unionBbox;
      this.overlayRect = ctx.svgBboxToOverlayPixels(unionBbox);
      this.ghostFragments = this.ghost.buildFragmentsForUnion(ctx.svgManipulation, unionBbox, selectedIds);
      ctx.cdr.detectChanges();
    }

    if (this.ghostFragments.length === 0) {
      for (const id of selectedIds) ctx.svgManipulation.setShapeVisibility(id, true);
      return false;
    }

    this.isActive = true;
    this.shapeIds = selectedIds;
    this.startSvg = { x: point.x, y: point.y };
    this.snapshot = ctx.svgManipulation.snapshotSelectionTransforms(selectedIds);
    return true;
  }

  move(ctx: GestureContext, clientX: number, clientY: number): void {
    if (!this.isActive || this.ghostFragments.length === 0 || !this.startSvg || !this.startBbox) return;
    const currentSvg = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (!currentSvg) return;
    const dx = currentSvg.x - this.startSvg.x;
    const dy = currentSvg.y - this.startSvg.y;
    const currentBbox: Rect = {
      x: this.startBbox.x + dx,
      y: this.startBbox.y + dy,
      width: this.startBbox.width,
      height: this.startBbox.height
    };
    this.overlayRect = ctx.svgBboxToOverlayPixels(currentBbox);
    if (this.ghostFragments.length > 0 && this.startBbox) {
      const m = new Matrix().translate(dx, dy);
      for (const f of this.ghostFragments) {
        (f.outerGroup as Svg).matrix(m);
      }
    }
  }

  end(ctx: GestureContext, clientX: number, clientY: number): void {
    if (!this.isActive || this.shapeIds.length === 0 || !this.startSvg) return;
    let dx = 0;
    let dy = 0;
    const point = ctx.clientToEditorSvgPoint(clientX, clientY);
    if (point) {
      dx = point.x - this.startSvg.x;
      dy = point.y - this.startSvg.y;
    }
    const dragCmds: EditorCommand[] = this.shapeIds.map(
      (id) => new TranslateCommand(ctx.svgManipulation, id, dx, dy, this.snapshot)
    );
    ctx.editorHistory.pushAndExecute(
      dragCmds.length === 1 ? dragCmds[0] : new CompositeCommand(dragCmds, 'Move shapes')
    );
    for (const shapeId of this.shapeIds) {
      ctx.svgManipulation.setShapeVisibility(shapeId, true);
    }
    this.ghost.removeFragments(this.ghostFragments);
    this.justEnded = true;

    const selectedIds = ctx.shapeSelection.getSelectedShapes().map((s) => s.id);
    const unionBbox = ctx.svgManipulation.getUnionBBox(selectedIds);
    ctx.setLastBbox(unionBbox);
    ctx.invalidateHighlightCache();

    this.reset();
    ctx.cdr.detectChanges();
  }

  private reset(): void {
    this.overlayRect = null;
    this.isActive = false;
    this.shapeIds = [];
    this.startSvg = null;
    this.startBbox = null;
    this.snapshot = new Map();
    this.ghostFragments = [];
  }

  consumeJustEnded(): boolean {
    if (this.justEnded) {
      this.justEnded = false;
      return true;
    }
    return false;
  }

  private createSingleGhost(
    ctx: GestureContext,
    shapeId: string,
    bbox: Rect,
    shapeScreenRect: DOMRect
  ): void {
    const svgInstance = ctx.svgManipulation.getSVGInstance();
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

    const overlayContainer = ctx.highlightOverlayContainer()?.nativeElement;
    this.overlayRect = overlayContainer
      ? {
          x: shapeScreenRect.left - overlayContainer.getBoundingClientRect().left,
          y: shapeScreenRect.top - overlayContainer.getBoundingClientRect().top,
          width: shapeScreenRect.width,
          height: shapeScreenRect.height
        }
      : ctx.svgBboxToOverlayPixels(bbox);
    ctx.cdr.detectChanges();
  }
}
