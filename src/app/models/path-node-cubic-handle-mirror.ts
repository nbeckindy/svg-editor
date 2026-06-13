import type { PathSegment } from './path-d';

/** Which cubic Bézier control is being dragged in node-edit mode. */
export type PathNodeCubicDragControl = 'x1y1' | 'x2y2';

function reflectAcrossAnchor(ax: number, ay: number, px: number, py: number): { x: number; y: number } {
  return { x: 2 * ax - px, y: 2 * ay - py };
}

/** Index of the `M` that starts the subpath containing `segmentIndex`. */
export function findMovetoIndexForSegment(
  segments: readonly PathSegment[],
  segmentIndex: number
): number {
  for (let i = segmentIndex; i >= 0; i--) {
    if (segments[i].type === 'M') return i;
  }
  return 0;
}

/**
 * If the subpath that starts at `mIndex` is closed with `Z`, returns that `Z`'s index; otherwise `null`.
 */
export function findCloseZIndexAfterM(
  segments: readonly PathSegment[],
  mIndex: number
): number | null {
  for (let k = mIndex + 1; k < segments.length; k++) {
    const t = segments[k].type;
    if (t === 'M') return null;
    if (t === 'Z') return k;
  }
  return null;
}

function firstCubicIndexInRange(
  segments: readonly PathSegment[],
  fromExclusive: number,
  untilExclusive: number
): number {
  const hi = Math.min(untilExclusive, segments.length);
  for (let i = fromExclusive + 1; i < hi; i++) {
    if (segments[i].type === 'C') return i;
  }
  return -1;
}

function lastCubicIndexInRange(
  segments: readonly PathSegment[],
  fromExclusive: number,
  untilExclusive: number
): number {
  const lo = fromExclusive + 1;
  for (let i = untilExclusive - 1; i >= lo; i--) {
    if (segments[i].type === 'C') return i;
  }
  return -1;
}

/**
 * Symmetric smooth (mirrored) cubic control drag for path node-edit: updates the dragged `C`
 * control and, when the joint is **C–C** (including across `Z` on a closed subpath), the opposite
 * handle so both controls stay reflections through the shared anchor.
 *
 * Mutates `segments` in place. **C–C only:** if the neighbor segment is not `C`, only the dragged
 * control changes. Does not mirror a handle onto the same segment (single `C` closed loop).
 * Across `Z`, mirroring from the closing cubic’s incoming handle to the “first” cubic only runs when
 * the moveto is immediately followed by a `C`; if an `L` (or other non-`C`) sits between `M` and
 * the first `C`, the first `C`’s `x1`/`y1` are anchored at the next vertex, not at `M`, so mirroring
 * there would move the wrong joint.
 *
 * @returns `true` when a mirrored opposite handle was written, else `false`.
 */
export function applySymmetricCubicControlDragInPlace(
  segments: PathSegment[],
  segmentIndex: number,
  controlPoint: PathNodeCubicDragControl,
  x: number,
  y: number
): boolean {
  const seg = segments[segmentIndex];
  if (!seg || seg.type !== 'C') return false;

  if (controlPoint === 'x1y1') {
    seg.x1 = x;
    seg.y1 = y;

    if (segmentIndex > 0) {
      const prev = segments[segmentIndex - 1];
      if (prev.type === 'C') {
        const ax = prev.x;
        const ay = prev.y;
        const r = reflectAcrossAnchor(ax, ay, x, y);
        prev.x2 = r.x;
        prev.y2 = r.y;
        return true;
      }
      if (prev.type === 'M') {
        const mIndex = segmentIndex - 1;
        const zIndex = findCloseZIndexAfterM(segments, mIndex);
        if (zIndex === null) return false;

        const lastC = lastCubicIndexInRange(segments, mIndex, zIndex);
        if (lastC < 0 || lastC === segmentIndex) return false;

        const lastSeg = segments[lastC];
        if (lastSeg.type !== 'C') return false;

        const ax = prev.x;
        const ay = prev.y;
        const r = reflectAcrossAnchor(ax, ay, x, y);
        lastSeg.x2 = r.x;
        lastSeg.y2 = r.y;
        return true;
      }
    }
    return false;
  }

  // x2y2 — incoming handle toward segment end
  seg.x2 = x;
  seg.y2 = y;

  const next = segments[segmentIndex + 1];
  if (next?.type === 'C') {
    const ax = seg.x;
    const ay = seg.y;
    const r = reflectAcrossAnchor(ax, ay, x, y);
    next.x1 = r.x;
    next.y1 = r.y;
    return true;
  }

  if (next?.type === 'Z') {
    const mIndex = findMovetoIndexForSegment(segments, segmentIndex);
    const zIndex = findCloseZIndexAfterM(segments, mIndex);
    if (zIndex === null) return false;

    const firstIdxAfterM = mIndex + 1;
    if (firstIdxAfterM >= zIndex || segments[firstIdxAfterM]?.type !== 'C') {
      return false;
    }

    const firstC = firstCubicIndexInRange(segments, mIndex, zIndex);
    if (firstC < 0 || firstC === segmentIndex) return false;

    const first = segments[firstC];
    if (first.type !== 'C') return false;

    const ax = seg.x;
    const ay = seg.y;
    const r = reflectAcrossAnchor(ax, ay, x, y);
    first.x1 = r.x;
    first.y1 = r.y;
    return true;
  }

  return false;
}
