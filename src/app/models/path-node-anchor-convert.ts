import { mirrorCornerCubicsFromStraightLL, penSvgDistanceSq } from './pen-path';
import { pointBeforeSegmentIndex } from './path-pen-insert';
import type { PathSegment } from './path-d';

/** Match `PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ` in svg-canvas (squared distance in user space). */
const PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ = 1e-6;

export interface PathNodeAnchorPointModel {
  x: number;
  y: number;
  segmentIndex: number;
  moveSegmentIndex: number;
}

export interface PathNodeConversionLegs {
  incoming: number | null;
  outgoing: number | null;
  vertex: { x: number; y: number };
}

export type PathNodeAnchorConvertModelResult =
  | { ok: true; segments: PathSegment[] }
  /** `feedback` omitted for silent no-op cases (e.g. mirror cubic on an already C–C joint). */
  | { ok: false; feedback?: string };

export type PathNodeMirrorCubicUiState =
  | { kind: 'applicable' }
  | { kind: 'already-cubic-noop' }
  | { kind: 'needs-two-lines' }
  | { kind: 'rejects-quadratic' }
  | { kind: 'invalid' };

/** Same anchor ordering as `SvgCanvasComponent.collectPathNodeAnchors` (node-edit overlays). */
export function collectPathNodeAnchorsForPathNodeConversion(
  segments: readonly PathSegment[]
): PathNodeAnchorPointModel[] {
  const anchors: PathNodeAnchorPointModel[] = [];
  let current: PathNodeAnchorPointModel | null = null;
  let subpathStart: PathNodeAnchorPointModel | null = null;

  for (const [segmentIndex, segment] of segments.entries()) {
    if (segment.type === 'M') {
      const point = {
        x: segment.x,
        y: segment.y,
        segmentIndex,
        moveSegmentIndex: segmentIndex
      };
      anchors.push(point);
      current = point;
      subpathStart = point;
      continue;
    }
    if (segment.type === 'L') {
      const coincidentClose =
        subpathStart !== null &&
        segments[segmentIndex + 1]?.type === 'Z' &&
        penSvgDistanceSq(
          { x: segment.x, y: segment.y },
          { x: subpathStart.x, y: subpathStart.y }
        ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
      if (!coincidentClose) {
        anchors.push({
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        });
      }
      current = {
        x: segment.x,
        y: segment.y,
        segmentIndex,
        moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
      };
      continue;
    }
    if (segment.type === 'C') {
      const coincidentClose =
        subpathStart !== null &&
        segments[segmentIndex + 1]?.type === 'Z' &&
        penSvgDistanceSq(
          { x: segment.x, y: segment.y },
          { x: subpathStart.x, y: subpathStart.y }
        ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
      if (!coincidentClose) {
        anchors.push({
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        });
      }
      current = {
        x: segment.x,
        y: segment.y,
        segmentIndex,
        moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
      };
      continue;
    }
    if (segment.type === 'Q') {
      const coincidentClose =
        subpathStart !== null &&
        segments[segmentIndex + 1]?.type === 'Z' &&
        penSvgDistanceSq(
          { x: segment.x, y: segment.y },
          { x: subpathStart.x, y: subpathStart.y }
        ) < PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
      if (!coincidentClose) {
        anchors.push({
          x: segment.x,
          y: segment.y,
          segmentIndex,
          moveSegmentIndex: segmentIndex
        });
      }
      current = {
        x: segment.x,
        y: segment.y,
        segmentIndex,
        moveSegmentIndex: coincidentClose && subpathStart ? subpathStart.moveSegmentIndex : segmentIndex
      };
      continue;
    }
    if (segment.type === 'Z' && subpathStart && current) {
      const gapSq = penSvgDistanceSq(
        { x: subpathStart.x, y: subpathStart.y },
        { x: current.x, y: current.y }
      );
      if (gapSq >= PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ) {
        anchors.push({
          x: subpathStart.x,
          y: subpathStart.y,
          segmentIndex,
          moveSegmentIndex: subpathStart.moveSegmentIndex
        });
      }
      current = {
        x: subpathStart.x,
        y: subpathStart.y,
        segmentIndex,
        moveSegmentIndex: subpathStart.moveSegmentIndex
      };
    }
  }

  return anchors;
}

function findSubpathStartIndex(segments: readonly PathSegment[], atOrBefore: number): number {
  for (let i = atOrBefore; i >= 0; i--) {
    if (segments[i].type === 'M') return i;
  }
  return 0;
}

function findSubpathEndExclusive(segments: readonly PathSegment[], mIndex: number): number {
  for (let j = mIndex + 1; j < segments.length; j++) {
    if (segments[j].type === 'M') return j;
  }
  return segments.length;
}

function zIndexInSubpath(
  segments: readonly PathSegment[],
  fromInclusive: number,
  toExclusive: number
): number {
  for (let j = fromInclusive; j < toExclusive; j++) {
    if (segments[j].type === 'Z') return j;
  }
  return -1;
}

/**
 * Which drawable segment indices participate at this anchor (M / Z / last-open rules
 * aligned with node-edit overlays).
 */
export function resolvePathNodeConversionLegs(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeConversionLegs | null {
  if (moveSegmentIndex < 0 || moveSegmentIndex >= segments.length) return null;
  const sel = segments[moveSegmentIndex];
  if (!sel || sel.type === 'Z') return null;

  const anchors = collectPathNodeAnchorsForPathNodeConversion(segments);
  const anchorIdx = anchors.findIndex((a) => a.moveSegmentIndex === moveSegmentIndex);
  if (anchorIdx < 0) return null;

  const isLastAnchor = anchorIdx === anchors.length - 1;
  const subM = findSubpathStartIndex(segments, moveSegmentIndex);
  const subEx = findSubpathEndExclusive(segments, subM);
  const zIdx = zIndexInSubpath(segments, subM + 1, subEx);
  const subClosed = zIdx >= 0;

  if (sel.type === 'M') {
    const vertex = { x: sel.x, y: sel.y };
    if (subClosed) {
      if (zIdx <= subM + 1) return null;
      const incoming = zIdx - 1;
      return { incoming, outgoing: null, vertex };
    }
    if (isLastAnchor) {
      return { incoming: null, outgoing: null, vertex };
    }
    const out = moveSegmentIndex + 1;
    if (out >= subEx || segments[out].type === 'Z') return null;
    return { incoming: null, outgoing: out, vertex };
  }

  const vertex = { x: sel.x, y: sel.y };

  if (!subClosed && isLastAnchor) {
    return { incoming: moveSegmentIndex, outgoing: null, vertex };
  }

  const outIdx = moveSegmentIndex + 1;
  const outgoing =
    outIdx < segments.length && segments[outIdx].type !== 'Z' ? outIdx : null;
  return { incoming: moveSegmentIndex, outgoing, vertex };
}

function segmentAtJointUnsupportedForNodeAnchorOps(seg: PathSegment | undefined): boolean {
  if (!seg) return true;
  return seg.type === 'Q' || seg.type === 'T' || seg.type === 'S';
}

function collapseSegmentToLineToEnd(seg: PathSegment): Extract<PathSegment, { type: 'L' }> | null {
  if (seg.type === 'L') {
    return { type: 'L', x: seg.x, y: seg.y };
  }
  if (seg.type === 'C' || seg.type === 'Q') {
    return { type: 'L', x: seg.x, y: seg.y };
  }
  return null;
}

export const PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK =
  'Smooth or quadratic segments at this joint are not supported yet. Edit the path in another tool first.';

export function convertPathAnchorAtMoveSegmentIndexToCorner(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeAnchorConvertModelResult {
  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs) {
    return { ok: false, feedback: 'Unable to adjust that node.' };
  }
  if (legs.incoming === null && legs.outgoing === null) {
    return { ok: false, feedback: 'Nothing to straighten at this node.' };
  }

  const legIndices = [legs.incoming, legs.outgoing].filter((i): i is number => i !== null);
  for (const idx of legIndices) {
    const s = segments[idx];
    if (segmentAtJointUnsupportedForNodeAnchorOps(s)) {
      return { ok: false, feedback: PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK };
    }
  }

  const next = segments.map((s) => ({ ...s }));
  for (const idx of legIndices) {
    const collapsed = collapseSegmentToLineToEnd(next[idx]);
    if (!collapsed) {
      return { ok: false, feedback: 'Unable to straighten that segment.' };
    }
    next[idx] = collapsed;
  }

  return { ok: true, segments: next };
}

export function getMirrorCubicJointUiState(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeMirrorCubicUiState {
  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs) return { kind: 'invalid' };
  if (legs.incoming === null || legs.outgoing === null) {
    return { kind: 'needs-two-lines' };
  }
  const a = segments[legs.incoming];
  const b = segments[legs.outgoing];
  if (!a || !b) return { kind: 'invalid' };
  if (segmentAtJointUnsupportedForNodeAnchorOps(a) || segmentAtJointUnsupportedForNodeAnchorOps(b)) {
    return { kind: 'rejects-quadratic' };
  }
  if (a.type === 'C' && b.type === 'C') {
    return { kind: 'already-cubic-noop' };
  }
  if (a.type === 'L' && b.type === 'L') {
    return { kind: 'applicable' };
  }
  return { kind: 'needs-two-lines' };
}

export function convertPathAnchorAtMoveSegmentIndexToMirrorCubic(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeAnchorConvertModelResult {
  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs) {
    return { ok: false, feedback: 'Unable to adjust that node.' };
  }
  if (legs.incoming === null || legs.outgoing === null) {
    return {
      ok: false,
      feedback: 'Mirror cubic needs two straight edges meeting at this node.'
    };
  }

  const inc = segments[legs.incoming];
  const out = segments[legs.outgoing];
  if (segmentAtJointUnsupportedForNodeAnchorOps(inc) || segmentAtJointUnsupportedForNodeAnchorOps(out)) {
    return { ok: false, feedback: PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK };
  }

  if (inc.type === 'C' && out.type === 'C') {
    return { ok: false };
  }

  if (inc.type !== 'L' || out.type !== 'L') {
    return {
      ok: false,
      feedback: 'Mirror cubic needs two straight line segments at this joint.'
    };
  }

  const p0 = pointBeforeSegmentIndex(segments, legs.incoming);
  if (!p0) {
    return { ok: false, feedback: 'Unable to resolve geometry for mirror cubic.' };
  }

  const V = { x: inc.x, y: inc.y };
  const B = { x: out.x, y: out.y };

  const pair = mirrorCornerCubicsFromStraightLL(p0, V, B);
  if (!pair) {
    return { ok: false, feedback: 'Unable to resolve geometry for mirror cubic.' };
  }

  const next = segments.map((s) => ({ ...s }));

  next[legs.incoming] = {
    type: 'C',
    x1: pair.incoming.x1,
    y1: pair.incoming.y1,
    x2: pair.incoming.x2,
    y2: pair.incoming.y2,
    x: V.x,
    y: V.y
  };
  next[legs.outgoing] = {
    type: 'C',
    x1: pair.outgoing.x1,
    y1: pair.outgoing.y1,
    x2: pair.outgoing.x2,
    y2: pair.outgoing.y2,
    x: B.x,
    y: B.y
  };

  return { ok: true, segments: next };
}
