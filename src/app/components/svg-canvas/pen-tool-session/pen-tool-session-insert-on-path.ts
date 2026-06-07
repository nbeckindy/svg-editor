import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { parsePathD, parsePathDForNodeEditing, pathSegmentsToD, type PathSegment } from '../../../models/path-d';
import { applyPenPathInsert, findPenPathInsertHit, type PenPathInsertHit } from '../../../models/path-pen-insert';
import {
  buildPenInsertDragPreviewD,
  penInsertHitAnchorSvg,
  penInsertMoveSegmentIndexAfterSplit
} from '../../../models/path-pen-insert-drag';
import type { PenToolSessionPorts } from './pen-tool-session-ports';

/** In-progress mousedown→drag→mouseup insert on an existing `<path>` (idle **Pen authoring session**). */
export type PenInsertOnPathDragState = {
  pathId: string;
  originalD: string;
  parsedBefore: PathSegment[];
  hit: PenPathInsertHit;
  insertMoveSegIndex: number;
  splitBaseline: PathSegment[];
  dragStartSvg: { x: number; y: number };
  startClient: { x: number; y: number };
};

export type PenInsertOnPathEvaluateResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      pathId: string;
      oldD: string;
      parsed: PathSegment[];
      hit: PenPathInsertHit;
      split: PathSegment[];
      pt: { x: number; y: number };
    };

/**
 * Read-only insert-on-path eligibility (shared with {@link PenToolSession.tryBeginPenInsertOnPath} for debug HUD).
 */
export function evaluatePenInsertOnPathAt(
  ports: Pick<PenToolSessionPorts, 'getPathDForId' | 'clientToEditorSvgPoint' | 'getPenPathInsertToleranceSvg'>,
  penTarget: Element,
  clientX: number,
  clientY: number
): PenInsertOnPathEvaluateResult {
  if (penTarget.tagName?.toLowerCase() !== 'path' || !penTarget.id) {
    return { ok: false, reason: 'target is not <path id=…>' };
  }
  const pathId = penTarget.id;
  const oldD = ports.getPathDForId(pathId)?.trim() ?? '';
  if (!oldD) return { ok: false, reason: 'empty path d' };
  const parsed = parsePathDForNodeEditing(oldD);
  if (!parsed) return { ok: false, reason: 'path d not parseable for node editing' };
  const pt = ports.clientToEditorSvgPoint(clientX, clientY);
  if (!pt) return { ok: false, reason: 'client→SVG mapping failed' };
  const tol = ports.getPenPathInsertToleranceSvg();
  const maxDistSq = tol * tol;
  const hit = findPenPathInsertHit(parsed, pt.x, pt.y, maxDistSq);
  if (!hit) return { ok: false, reason: `no segment within insert tolerance (~${tol.toFixed(2)} svg u)` };
  const split = applyPenPathInsert(parsed, hit);
  if (!split) return { ok: false, reason: 'applyPenPathInsert rejected' };
  const baselineD = pathSegmentsToD(split);
  if (baselineD === oldD) return { ok: false, reason: 'insert would not change d' };
  const reparsed = parsePathD(baselineD);
  if (reparsed.errors.length > 0 || reparsed.segments.length === 0 || reparsed.segments[0].type !== 'M') {
    return { ok: false, reason: 'split baseline invalid for commit' };
  }
  return { ok: true, pathId, oldD, parsed, hit, split, pt };
}

export function createPenInsertOnPathDragState(
  ev: Extract<PenInsertOnPathEvaluateResult, { ok: true }>,
  event: MouseEvent
): PenInsertOnPathDragState {
  const dragStartSvg = penInsertHitAnchorSvg(ev.parsed, ev.hit) ?? ev.pt;
  return {
    pathId: ev.pathId,
    originalD: ev.oldD,
    parsedBefore: ev.parsed,
    hit: ev.hit,
    insertMoveSegIndex: penInsertMoveSegmentIndexAfterSplit(ev.hit),
    splitBaseline: ev.split.map((s) => ({ ...s })) as PathSegment[],
    dragStartSvg,
    startClient: { x: event.clientX, y: event.clientY }
  };
}

export function computePenInsertOnPathPreviewPathD(
  st: PenInsertOnPathDragState,
  lastClient: { x: number; y: number } | null,
  pointerSvg: { x: number; y: number } | null
): string | null {
  const lc = lastClient ?? st.startClient;
  const screenDist = Math.hypot(lc.x - st.startClient.x, lc.y - st.startClient.y);
  if (screenDist < MARQUEE_MIN_DRAG_PX) {
    return pathSegmentsToD(st.splitBaseline);
  }
  const cur = pointerSvg ?? st.dragStartSvg;
  const base = st.splitBaseline.map((seg) => ({ ...seg })) as PathSegment[];
  return buildPenInsertDragPreviewD(base, st.insertMoveSegIndex, st.dragStartSvg, cur);
}

/**
 * Computes `d` for mouseup: either baseline (short drag) or drag preview.
 */
export function computePenInsertOnPathReleaseD(
  ports: Pick<PenToolSessionPorts, 'clientToEditorSvgPoint'>,
  st: PenInsertOnPathDragState,
  lastClient: { x: number; y: number } | null,
  pointerSvg: { x: number; y: number } | null,
  eventClientX: number,
  eventClientY: number
): string {
  const release = ports.clientToEditorSvgPoint(eventClientX, eventClientY);
  const lc = lastClient ?? st.startClient;
  const screenDist = Math.hypot(lc.x - st.startClient.x, lc.y - st.startClient.y);
  if (screenDist < MARQUEE_MIN_DRAG_PX) {
    return pathSegmentsToD(st.splitBaseline);
  }
  const cur = release ?? pointerSvg ?? st.dragStartSvg;
  const base = st.splitBaseline.map((seg) => ({ ...seg })) as PathSegment[];
  return buildPenInsertDragPreviewD(base, st.insertMoveSegIndex, st.dragStartSvg, cur) ?? pathSegmentsToD(st.splitBaseline);
}

export function restorePenInsertPathVisibility(
  ports: Pick<PenToolSessionPorts, 'svgManipulation'>,
  pathId: string
): void {
  ports.svgManipulation.setShapeVisibility(pathId, true);
}
