import { placementIllustratorStyleCubicControlPoints, dragBendQuadraticControlPoint } from './pen-path';
import { pathSegmentsToD, type PathSegment } from './path-d';
import { applyPenPathInsert, pointBeforeSegmentIndex, type PenPathInsertHit } from './path-pen-insert';

/** Segment index of the drawable segment whose **end** is the inserted anchor (first half of a split curve, or first new `L`). */
export function penInsertMoveSegmentIndexAfterSplit(hit: PenPathInsertHit): number {
  return hit.segmentIndex;
}

/**
 * Hit location in path-local space (split point on the pre-split geometry).
 */
export function penInsertHitAnchorSvg(
  segments: readonly PathSegment[],
  hit: PenPathInsertHit
): { x: number; y: number } | null {
  const after = applyPenPathInsert(segments, hit);
  if (!after) return null;
  const i = hit.segmentIndex;
  const seg = after[i];
  if (!seg) return null;
  if (seg.type === 'L' || seg.type === 'C' || seg.type === 'Q') {
    return { x: seg.x, y: seg.y };
  }
  return null;
}

/**
 * Mutates `segments` (already split at insert) so the inserted anchor follows `dragCurrent`,
 * keeping **C–C**, **Q–Q**, or **L–L** joins smooth at the new point (mirrored handles like pen smooth).
 * For unsupported neighbor pairs, only moves the shared endpoint without retuning handles.
 */
export function adjustSplitSegmentsForPenInsertDrag(
  segments: PathSegment[],
  insertMoveSegIndex: number,
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): void {
  const i = insertMoveSegIndex;
  const segIn = segments[i];
  const segOut = segments[i + 1];
  if (!segIn || !segOut) return;

  const p0 = pointBeforeSegmentIndex(segments, i);
  if (!p0) return;
  const P = { x: dragCurrent.x, y: dragCurrent.y };

  if (segIn.type === 'L' && segOut.type === 'L') {
    const ax = p0.x;
    const ay = p0.y;
    const bx = segOut.x;
    const by = segOut.y;
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 1e-18) {
      (segIn as { x: number; y: number }).x = P.x;
      (segIn as { x: number; y: number }).y = P.y;
      return;
    }
    let t = ((P.x - ax) * abx + (P.y - ay) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * abx;
    const y = ay + t * aby;
    segIn.x = x;
    segIn.y = y;
    return;
  }

  if (segIn.type === 'C' && segOut.type === 'C') {
    const p3right = { x: segOut.x, y: segOut.y };
    const cin = placementIllustratorStyleCubicControlPoints(p0, P, dragStart, dragCurrent);
    segIn.x1 = cin.x1;
    segIn.y1 = cin.y1;
    segIn.x2 = cin.x2;
    segIn.y2 = cin.y2;
    segIn.x = P.x;
    segIn.y = P.y;

    const cout = placementIllustratorStyleCubicControlPoints(P, p3right, dragStart, dragCurrent);
    segOut.x1 = 2 * P.x - cin.x2;
    segOut.y1 = 2 * P.y - cin.y2;
    segOut.x2 = cout.x2;
    segOut.y2 = cout.y2;
    return;
  }

  if (segIn.type === 'Q' && segOut.type === 'Q') {
    const p2 = { x: segOut.x, y: segOut.y };
    const qin = dragBendQuadraticControlPoint(p0, P, dragStart, dragCurrent);
    segIn.x1 = qin.x1;
    segIn.y1 = qin.y1;
    segIn.x = P.x;
    segIn.y = P.y;

    segOut.x1 = 2 * P.x - qin.x1;
    segOut.y1 = 2 * P.y - qin.y1;
    segOut.x = p2.x;
    segOut.y = p2.y;
    return;
  }

  if (segIn.type === 'L' && segOut.type === 'C') {
    segIn.x = P.x;
    segIn.y = P.y;
    const cout = placementIllustratorStyleCubicControlPoints(P, { x: segOut.x, y: segOut.y }, dragStart, dragCurrent);
    segOut.x1 = cout.x1;
    segOut.y1 = cout.y1;
    segOut.x2 = cout.x2;
    segOut.y2 = cout.y2;
    return;
  }

  if (segIn.type === 'C' && segOut.type === 'L') {
    const cin = placementIllustratorStyleCubicControlPoints(p0, P, dragStart, dragCurrent);
    segIn.x1 = cin.x1;
    segIn.y1 = cin.y1;
    segIn.x2 = cin.x2;
    segIn.y2 = cin.y2;
    segIn.x = P.x;
    segIn.y = P.y;
    return;
  }

  if (segIn.type !== 'Z') {
    segIn.x = P.x;
    segIn.y = P.y;
  }
}

export function buildPenInsertDragPreviewD(
  splitSegments: PathSegment[],
  insertMoveSegIndex: number,
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): string | null {
  const work = splitSegments.map((s) => ({ ...s })) as PathSegment[];
  adjustSplitSegmentsForPenInsertDrag(work, insertMoveSegIndex, dragStart, dragCurrent);
  return pathSegmentsToD(work);
}
