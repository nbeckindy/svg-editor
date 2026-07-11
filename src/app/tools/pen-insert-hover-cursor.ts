import { parsePathDForNodeEditing } from '../models/path-d';
import { findPenPathInsertHit } from '../models/path-pen-insert';

export interface PenInsertHoverCursorDeps {
  getViewportElement: () => HTMLElement | null | undefined;
  isPenToolActive: () => boolean;
  isPenInsertOnPathDragActive: () => boolean;
  canTryPenInsertNodeOnPath: () => boolean;
  clientToEditorSvgPoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  isEditorContentShapeTarget: (target: Element) => boolean;
  getPathD: (pathId: string) => string | null | undefined;
  getPenPathInsertToleranceSvg: () => number;
  updateIdlePenHoverClient: (clientX: number, clientY: number) => void;
}

function clearHostCursor(el: HTMLElement | null | undefined): void {
  if (el?.style?.cursor) {
    el.style.removeProperty('cursor');
  }
}

/** Applies or clears the pen idle insert `copy` cursor on `#canvasViewport`. */
export function applyPenInsertHoverCursorFromClient(
  deps: PenInsertHoverCursorDeps,
  clientX: number,
  clientY: number
): void {
  const el = deps.getViewportElement();
  if (!el) return;
  if (!deps.isPenToolActive()) {
    clearHostCursor(el);
    return;
  }
  if (deps.isPenInsertOnPathDragActive()) {
    el.style.cursor = 'copy';
    return;
  }
  if (!deps.canTryPenInsertNodeOnPath()) {
    clearHostCursor(el);
    return;
  }
  const under =
    typeof document !== 'undefined' ? (document.elementFromPoint(clientX, clientY) as Element | null) : null;
  const pathHit = under?.closest?.('path') as SVGPathElement | null;
  if (!pathHit?.id || !deps.isEditorContentShapeTarget(pathHit)) {
    clearHostCursor(el);
    return;
  }
  const pt = deps.clientToEditorSvgPoint(clientX, clientY);
  if (!pt) {
    clearHostCursor(el);
    return;
  }
  const rawD = deps.getPathD(pathHit.id);
  if (typeof rawD !== 'string' || !rawD.trim()) {
    clearHostCursor(el);
    return;
  }
  const parsed = parsePathDForNodeEditing(rawD);
  if (!parsed) {
    clearHostCursor(el);
    return;
  }
  const tol = deps.getPenPathInsertToleranceSvg();
  const hit = findPenPathInsertHit(parsed, pt.x, pt.y, tol * tol);
  if (!hit) {
    clearHostCursor(el);
    return;
  }
  el.style.cursor = 'copy';
}

/** Same conditions as {@link applyPenInsertHoverCursorFromClient} `copy` branch, without mutating DOM. */
export function penInsertCopyCursorWouldApplySync(
  deps: PenInsertHoverCursorDeps,
  clientX: number,
  clientY: number
): boolean {
  if (!deps.isPenToolActive()) return false;
  if (deps.isPenInsertOnPathDragActive()) return true;
  if (!deps.canTryPenInsertNodeOnPath()) return false;
  const under =
    typeof document !== 'undefined' ? (document.elementFromPoint(clientX, clientY) as Element | null) : null;
  const pathHit = under?.closest?.('path') as SVGPathElement | null;
  if (!pathHit?.id || !deps.isEditorContentShapeTarget(pathHit)) return false;
  const pt = deps.clientToEditorSvgPoint(clientX, clientY);
  if (!pt) return false;
  const rawD = deps.getPathD(pathHit.id);
  if (typeof rawD !== 'string' || !rawD.trim()) return false;
  const parsed = parsePathDForNodeEditing(rawD);
  if (!parsed) return false;
  const tol = deps.getPenPathInsertToleranceSvg();
  return findPenPathInsertHit(parsed, pt.x, pt.y, tol * tol) !== null;
}

/** RAF-coalesced pen idle insert hover cursor + pen session hover client update. */
export class PenInsertHoverCursorScheduler {
  private raf = 0;
  private pending: { x: number; y: number } | null = null;

  constructor(private readonly getDeps: () => PenInsertHoverCursorDeps) {}

  schedule(clientX: number, clientY: number): void {
    this.pending = { x: clientX, y: clientY };
    if (this.raf !== 0) return;
    this.raf = window.requestAnimationFrame(() => {
      this.raf = 0;
      const p = this.pending;
      this.pending = null;
      if (!p) return;
      const deps = this.getDeps();
      deps.updateIdlePenHoverClient(p.x, p.y);
      applyPenInsertHoverCursorFromClient(deps, p.x, p.y);
    });
  }

  cancel(): void {
    if (this.raf !== 0) {
      window.cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.pending = null;
    clearHostCursor(this.getDeps().getViewportElement());
  }

  wouldApplyCopyCursorSync(clientX: number, clientY: number): boolean {
    return penInsertCopyCursorWouldApplySync(this.getDeps(), clientX, clientY);
  }
}
