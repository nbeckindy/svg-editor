import { placementIllustratorStyleCubicControlPoints } from './pen-path';
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
 * Mutates `segments` (already split at insert) while keeping the inserted **anchor** fixed at
 * `dragStart` (the planted hit point). `dragCurrent` only reshapes **handles at the inserted
 * vertex** (incoming `x2/y2` and mirrored outgoing `x1/y1` for **C–C**, etc.). Controls that belong
 * to the **previous** and **next** anchors (`segIn.x1y1` toward `p0`, `segOut.x2y2` toward the
 * far end) stay exactly as produced by the split so neighbor tangents do not move. **Q–Q** keeps
 * the split controls (a single `Q` control cannot be bent off-drag without changing both ends).
 * **L–L** keeps the split geometry (no handles to bend). Mixed **L–C** / **C–L** only adjust the
 * cubic handle(s) at `V`.
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
  /** Planted insert vertex — never slides with the pointer. */
  const V = { x: dragStart.x, y: dragStart.y };

  if (segIn.type === 'L' && segOut.type === 'L') {
    // Split already placed the corner on the segment; lines have no handles to drag.
    segIn.x = V.x;
    segIn.y = V.y;
    return;
  }

  if (segIn.type === 'C' && segOut.type === 'C') {
    const cin = placementIllustratorStyleCubicControlPoints(p0, V, V, dragCurrent);
    // Keep split handles at p0 and at the far anchor; only bend toward V (incoming x2y2).
    segIn.x2 = cin.x2;
    segIn.y2 = cin.y2;
    segIn.x = V.x;
    segIn.y = V.y;

    // Mirrored outgoing handle at V (same tangent as incoming end).
    segOut.x1 = 2 * V.x - cin.x2;
    segOut.y1 = 2 * V.y - cin.y2;
    return;
  }

  if (segIn.type === 'Q' && segOut.type === 'Q') {
    // One control per `Q` moves the whole subcurve; preserving neighbor angles means keeping split.
    segIn.x = V.x;
    segIn.y = V.y;
    return;
  }

  if (segIn.type === 'L' && segOut.type === 'C') {
    segIn.x = V.x;
    segIn.y = V.y;
    const p3right = { x: segOut.x, y: segOut.y };
    const cout = placementIllustratorStyleCubicControlPoints(V, p3right, V, dragCurrent);
    segOut.x1 = cout.x1;
    segOut.y1 = cout.y1;
    return;
  }

  if (segIn.type === 'C' && segOut.type === 'L') {
    const cin = placementIllustratorStyleCubicControlPoints(p0, V, V, dragCurrent);
    segIn.x2 = cin.x2;
    segIn.y2 = cin.y2;
    segIn.x = V.x;
    segIn.y = V.y;
    return;
  }

  if (segIn.type !== 'Z') {
    segIn.x = V.x;
    segIn.y = V.y;
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
