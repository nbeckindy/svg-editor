import { mirrorCornerCubicsFromStraightLL, penSvgDistanceSq, symmetricCubicControlPoints } from './pen-path';
import { pointBeforeSegmentIndex } from './path-pen-insert';
import type { PathSegment } from './path-d';

/** Match `PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ` in svg-canvas (squared distance in user space). */
const PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ = 1e-6;

/** Squared distance threshold: handle considered “at” the anchor (corner-like). */
export const PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ = 1e-6;

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
      const out = subM + 1;
      if (out >= zIdx || segments[out].type === 'Z') return null;
      return { incoming, outgoing: out, vertex };
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

/** Drawable segment end point (`M` / `L` / `C` / `Q` / `S` / `T`); not valid for `Z`. */
function pathSegmentEndXY(seg: PathSegment): { x: number; y: number } {
  switch (seg.type) {
    case 'M':
    case 'L':
      return { x: seg.x, y: seg.y };
    case 'C':
    case 'Q':
    case 'S':
    case 'T':
      return { x: seg.x, y: seg.y };
    case 'Z':
      throw new Error('pathSegmentEndXY: Z has no end point');
    default: {
      const _exhaustive: never = seg;
      return _exhaustive;
    }
  }
}

/** Incoming leg is “straight into” `V` (line, or cubic with second control at `V`). */
export function isPathNodeIncomingCornerLikeAtVertex(
  seg: PathSegment,
  V: { x: number; y: number }
): boolean {
  if (seg.type === 'L') return true;
  if (seg.type === 'C') {
    return penSvgDistanceSq({ x: seg.x2, y: seg.y2 }, V) < PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
  }
  return false;
}

/** Outgoing leg is “straight out of” `V` (line, or cubic with first control at `V`). */
export function isPathNodeOutgoingCornerLikeAtVertex(
  seg: PathSegment,
  V: { x: number; y: number }
): boolean {
  if (seg.type === 'L') return true;
  if (seg.type === 'C') {
    return penSvgDistanceSq({ x: seg.x1, y: seg.y1 }, V) < PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
  }
  return false;
}

/**
 * True when every leg at this anchor is already corner-like (L or C with handle collapsed onto `V`).
 * Used to disable “Corner anchor” and to treat the node as a corner for mirror-cubic eligibility.
 */
export function isPathNodeCornerAnchorAlreadyApplied(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): boolean {
  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs) return false;
  const V = legs.vertex;
  if (legs.incoming !== null) {
    const s = segments[legs.incoming];
    if (segmentAtJointUnsupportedForNodeAnchorOps(s)) return false;
    if (!isPathNodeIncomingCornerLikeAtVertex(s, V)) return false;
  }
  if (legs.outgoing !== null) {
    const s = segments[legs.outgoing];
    if (segmentAtJointUnsupportedForNodeAnchorOps(s)) return false;
    if (!isPathNodeOutgoingCornerLikeAtVertex(s, V)) return false;
  }
  return true;
}

const PATH_ANCHOR_VERTEX_MATCH_EPS_SQ = 1e-8;

function findMoveSegmentIndexForAnchorPoint(
  segments: readonly PathSegment[],
  pt: { x: number; y: number }
): number | null {
  for (const a of collectPathNodeAnchorsForPathNodeConversion(segments)) {
    if (penSvgDistanceSq({ x: a.x, y: a.y }, pt) < PATH_ANCHOR_VERTEX_MATCH_EPS_SQ) {
      return a.moveSegmentIndex;
    }
  }
  return null;
}

/**
 * After mirror at `V`, if the previous / next anchors **were** corner-like before this edit,
 * pin their joint-side handles onto those vertices so adjacent corners stay visually sharp.
 * Uses `prevSegments` for corner detection because geometry at `V` may change leg shape in `next`.
 */
function snapAdjacentCornerHandlesAtVertices(
  prevSegments: readonly PathSegment[],
  next: PathSegment[],
  legs: PathNodeConversionLegs
): void {
  const incIdx = legs.incoming;
  const outIdx = legs.outgoing;
  if (incIdx === null || outIdx === null) return;

  const p0 = pointBeforeSegmentIndex(next, incIdx);
  if (p0) {
    const idxP0 = findMoveSegmentIndexForAnchorPoint(prevSegments, p0);
    if (idxP0 !== null && isPathNodeCornerAnchorAlreadyApplied(prevSegments, idxP0)) {
      const s = next[incIdx];
      if (s.type === 'C') {
        next[incIdx] = { ...s, x1: p0.x, y1: p0.y };
      }
    }
  }

  const outSeg = next[outIdx];
  const B = pathSegmentEndXY(outSeg);
  const idxB = findMoveSegmentIndexForAnchorPoint(prevSegments, B);
  if (idxB !== null && isPathNodeCornerAnchorAlreadyApplied(prevSegments, idxB)) {
    const s = next[outIdx];
    if (s.type === 'C') {
      next[outIdx] = { ...s, x2: B.x, y2: B.y };
    }
  }
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

  const V = legs.vertex;
  const next = segments.map((s) => ({ ...s }));
  let changed = false;

  /**
   * Corner at `V` on a cubic: collapse the handle **at** `V` onto the vertex (same as an `L` end),
   * without changing segment type or the far control.
   */
  if (legs.incoming !== null) {
    const seg = next[legs.incoming];
    if (seg.type === 'C') {
      next[legs.incoming] = { ...seg, x2: V.x, y2: V.y };
      changed = true;
    }
  }

  if (legs.outgoing !== null) {
    const seg = next[legs.outgoing];
    if (seg.type === 'C') {
      next[legs.outgoing] = { ...seg, x1: V.x, y1: V.y };
      changed = true;
    }
  }

  if (!changed) {
    return { ok: true, segments: next };
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
  const V = legs.vertex;
  const incOff =
    a.type === 'C' &&
    penSvgDistanceSq({ x: a.x2, y: a.y2 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
  const outOff =
    b.type === 'C' &&
    penSvgDistanceSq({ x: b.x1, y: b.y1 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;

  if (a.type === 'C' && b.type === 'C') {
    if (incOff && outOff) {
      return { kind: 'already-cubic-noop' };
    }
    return { kind: 'applicable' };
  }

  const incStraight = a.type === 'L' || (a.type === 'C' && !incOff);
  const outStraight = b.type === 'L' || (b.type === 'C' && !outOff);
  if (incStraight && outStraight) {
    return { kind: 'applicable' };
  }
  return { kind: 'needs-two-lines' };
}

export type PathNodeIndependentHandlesUiState =
  | { kind: 'link-only' }
  | { kind: 'promote-from-corner' }
  | { kind: 'needs-cubic-joint' }
  | { kind: 'rejects-quadratic' }
  | { kind: 'invalid' };

export function isIndependentHandlesJointActionable(
  state: PathNodeIndependentHandlesUiState
): boolean {
  return state.kind === 'link-only' || state.kind === 'promote-from-corner';
}

/**
 * Eligibility for **Independent handles** (unlink opposite-handle drag at `V`).
 * `link-only`: C–C with handles already off the vertex (metadata only).
 * `promote-from-corner`: corner-like joint — place joint-side handles on chord thirds, then link.
 */
export function getIndependentHandlesJointUiState(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeIndependentHandlesUiState {
  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs) return { kind: 'invalid' };
  if (legs.incoming === null || legs.outgoing === null) {
    return { kind: 'needs-cubic-joint' };
  }
  const inc = segments[legs.incoming];
  const out = segments[legs.outgoing];
  if (!inc || !out) return { kind: 'invalid' };
  if (segmentAtJointUnsupportedForNodeAnchorOps(inc) || segmentAtJointUnsupportedForNodeAnchorOps(out)) {
    return { kind: 'rejects-quadratic' };
  }
  if (inc.type !== 'C' && inc.type !== 'L') return { kind: 'needs-cubic-joint' };
  if (out.type !== 'C' && out.type !== 'L') return { kind: 'needs-cubic-joint' };

  const V = legs.vertex;
  if (inc.type === 'C' && out.type === 'C') {
    const incOff = penSvgDistanceSq({ x: inc.x2, y: inc.y2 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
    const outOff = penSvgDistanceSq({ x: out.x1, y: out.y1 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
    if (incOff && outOff) {
      return { kind: 'link-only' };
    }
    return { kind: 'promote-from-corner' };
  }

  if (isPathNodeCornerAnchorAlreadyApplied(segments, moveSegmentIndex)) {
    return { kind: 'promote-from-corner' };
  }

  return { kind: 'needs-cubic-joint' };
}

/**
 * Place joint-side cubic handles on chord **one-third** points (per leg, not mirrored through `V`)
 * and/or promote `L`→`C` for independent-handle drags. No-op geometry when {@link getIndependentHandlesJointUiState}
 * is `link-only`.
 */
export function convertPathAnchorAtMoveSegmentIndexToIndependentHandles(
  segments: readonly PathSegment[],
  moveSegmentIndex: number
): PathNodeAnchorConvertModelResult {
  const state = getIndependentHandlesJointUiState(segments, moveSegmentIndex);
  if (state.kind === 'link-only') {
    return { ok: true, segments: segments.map((s) => ({ ...s })) };
  }
  if (state.kind !== 'promote-from-corner') {
    return {
      ok: false,
      feedback:
        state.kind === 'rejects-quadratic'
          ? PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK
          : 'Independent handles are not available at this node.'
    };
  }

  const legs = resolvePathNodeConversionLegs(segments, moveSegmentIndex);
  if (!legs || legs.incoming === null || legs.outgoing === null) {
    return { ok: false, feedback: 'Unable to adjust that node.' };
  }

  const incIdx = legs.incoming;
  const outIdx = legs.outgoing;
  const incBefore = segments[incIdx];
  const outBefore = segments[outIdx];
  const V = legs.vertex;
  const p0 = pointBeforeSegmentIndex(segments, incIdx);
  if (!p0) {
    return { ok: false, feedback: 'Unable to resolve geometry for independent handles.' };
  }
  const B = pathSegmentEndXY(outBefore);
  const next = segments.map((s) => ({ ...s }));

  if (incIdx === outIdx) {
    if (incBefore.type !== 'C') {
      return { ok: false, feedback: 'Unable to adjust that node.' };
    }
    const symIn = symmetricCubicControlPoints(p0, V);
    const symOut = symmetricCubicControlPoints(V, B);
    next[incIdx] = {
      ...incBefore,
      x2: symIn.x2,
      y2: symIn.y2,
      x1: symOut.x1,
      y1: symOut.y1
    };
    return { ok: true, segments: next };
  }

  if (incBefore.type === 'L') {
    const sym = symmetricCubicControlPoints(p0, V);
    next[incIdx] = { type: 'C', x1: sym.x1, y1: sym.y1, x2: sym.x2, y2: sym.y2, x: V.x, y: V.y };
  } else if (incBefore.type === 'C') {
    const sym = symmetricCubicControlPoints(p0, V);
    next[incIdx] = { ...incBefore, x2: sym.x2, y2: sym.y2 };
  }

  if (outBefore.type === 'L') {
    const sym = symmetricCubicControlPoints(V, B);
    next[outIdx] = { type: 'C', x1: sym.x1, y1: sym.y1, x2: sym.x2, y2: sym.y2, x: B.x, y: B.y };
  } else if (outBefore.type === 'C') {
    const sym = symmetricCubicControlPoints(V, B);
    next[outIdx] = { ...outBefore, x1: sym.x1, y1: sym.y1 };
  }

  pinFarHandlesWhenLineBecameCubic(next, legs, incBefore, outBefore);
  return { ok: true, segments: next };
}

/**
 * When mirror promotes `L`→`C`, the non-`V` endpoint of that leg should keep a **corner** look:
 * collapse the far control onto that anchor (`x1` at start of incoming, `x2` at end of outgoing).
 */
function pinFarHandlesWhenLineBecameCubic(
  next: PathSegment[],
  legs: PathNodeConversionLegs,
  incBefore: PathSegment,
  outBefore: PathSegment
): void {
  const incIdx = legs.incoming;
  const outIdx = legs.outgoing;
  if (incIdx === null || outIdx === null) return;

  if (incBefore.type === 'L') {
    const p0pt = pointBeforeSegmentIndex(next, incIdx);
    const s = next[incIdx];
    if (p0pt && s.type === 'C') {
      next[incIdx] = { ...s, x1: p0pt.x, y1: p0pt.y };
    }
  }
  if (outBefore.type === 'L') {
    const s = next[outIdx];
    if (s.type === 'C') {
      const end = pathSegmentEndXY(outBefore);
      next[outIdx] = { ...s, x2: end.x, y2: end.y };
    }
  }
}

/**
 * From independent joint handles at `V`, derive **180°-mirrored** cubic controls on the angle
 * bisector of the two tangent directions, with arm length the average of the two independent arm lengths.
 */
export function mirrorCubicJointControlsFromIndependentHandlesAtVertex(
  V: { x: number; y: number },
  incomingHandle: { x: number; y: number },
  outgoingHandle: { x: number; y: number }
): { incomingX2: number; incomingY2: number; outgoingX1: number; outgoingY1: number } {
  const dInX = V.x - incomingHandle.x;
  const dInY = V.y - incomingHandle.y;
  const dOutX = outgoingHandle.x - V.x;
  const dOutY = outgoingHandle.y - V.y;
  const lenIn = Math.hypot(dInX, dInY);
  const lenOut = Math.hypot(dOutX, dOutY);

  if (lenIn < 1e-9 && lenOut < 1e-9) {
    return { incomingX2: V.x, incomingY2: V.y, outgoingX1: V.x, outgoingY1: V.y };
  }

  let tX = 0;
  let tY = 0;
  if (lenIn >= 1e-9) {
    tX += dInX / lenIn;
    tY += dInY / lenIn;
  }
  if (lenOut >= 1e-9) {
    tX += dOutX / lenOut;
    tY += dOutY / lenOut;
  }
  const tLen = Math.hypot(tX, tY);
  const h = (lenIn + lenOut) / 2;

  if (tLen < 1e-9) {
    const uX = lenIn >= 1e-9 ? dInX / lenIn : dOutX / lenOut;
    const uY = lenIn >= 1e-9 ? dInY / lenIn : dOutY / lenOut;
    const x2 = V.x - h * uX;
    const y2 = V.y - h * uY;
    return { incomingX2: x2, incomingY2: y2, outgoingX1: 2 * V.x - x2, outgoingY1: 2 * V.y - y2 };
  }

  const x2 = V.x - (h * tX) / tLen;
  const y2 = V.y - (h * tY) / tLen;
  return { incomingX2: x2, incomingY2: y2, outgoingX1: 2 * V.x - x2, outgoingY1: 2 * V.y - y2 };
}

function applyMirroredJointFromIndependentHandles(
  next: PathSegment[],
  legs: PathNodeConversionLegs,
  incBefore: PathSegment,
  outBefore: PathSegment
): boolean {
  const incIdx = legs.incoming;
  const outIdx = legs.outgoing;
  if (incIdx === null || outIdx === null) return false;
  const V = legs.vertex;

  if (incIdx === outIdx && incBefore.type === 'C') {
    const joint = mirrorCubicJointControlsFromIndependentHandlesAtVertex(
      V,
      { x: incBefore.x2, y: incBefore.y2 },
      { x: incBefore.x1, y: incBefore.y1 }
    );
    next[incIdx] = {
      ...incBefore,
      x2: joint.incomingX2,
      y2: joint.incomingY2,
      x1: joint.outgoingX1,
      y1: joint.outgoingY1
    };
    return true;
  }

  if (incBefore.type !== 'C' || outBefore.type !== 'C') return false;
  const joint = mirrorCubicJointControlsFromIndependentHandlesAtVertex(
    V,
    { x: incBefore.x2, y: incBefore.y2 },
    { x: outBefore.x1, y: outBefore.y1 }
  );
  next[incIdx] = { ...incBefore, x2: joint.incomingX2, y2: joint.incomingY2 };
  next[outIdx] = { ...outBefore, x1: joint.outgoingX1, y1: joint.outgoingY1 };
  return true;
}

export function convertPathAnchorAtMoveSegmentIndexToMirrorCubic(
  segments: readonly PathSegment[],
  moveSegmentIndex: number,
  options?: { fromIndependent?: boolean }
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

  const V = legs.vertex;
  const incOff =
    inc.type === 'C' &&
    penSvgDistanceSq({ x: inc.x2, y: inc.y2 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;
  const outOff =
    out.type === 'C' &&
    penSvgDistanceSq({ x: out.x1, y: out.y1 }, V) >= PATH_NODE_CORNER_HANDLE_AT_VERTEX_EPS_SQ;

  if (inc.type === 'C' && out.type === 'C') {
    if (incOff && outOff) {
      if (options?.fromIndependent) {
        const next = segments.map((s) => ({ ...s }));
        if (!applyMirroredJointFromIndependentHandles(next, legs, inc, out)) {
          return { ok: false, feedback: 'Unable to apply mirror cubic at this node.' };
        }
        return { ok: true, segments: next };
      }
      return { ok: false };
    }
  } else {
    const incStraight = inc.type === 'L' || (inc.type === 'C' && !incOff);
    const outStraight = out.type === 'L' || (out.type === 'C' && !outOff);
    if (!incStraight || !outStraight) {
      return {
        ok: false,
        feedback: 'Mirror cubic needs two straight edges meeting at this node.'
      };
    }
  }

  const p0 = pointBeforeSegmentIndex(segments, legs.incoming);
  if (!p0) {
    return { ok: false, feedback: 'Unable to resolve geometry for mirror cubic.' };
  }

  const Vpt = V;
  const B = pathSegmentEndXY(out);

  const next = segments.map((s) => ({ ...s }));

  /** Always use {@link mirrorCornerCubicsFromStraightLL} so joint controls satisfy C1 mirror at `V`. */
  const pair = mirrorCornerCubicsFromStraightLL(p0, Vpt, B);
  if (!pair) {
    return { ok: false, feedback: 'Unable to resolve geometry for mirror cubic.' };
  }

  if (inc.type === 'L') {
    next[legs.incoming] = {
      type: 'C',
      x1: pair.incoming.x1,
      y1: pair.incoming.y1,
      x2: pair.incoming.x2,
      y2: pair.incoming.y2,
      x: Vpt.x,
      y: Vpt.y
    };
  } else {
    const c = inc as Extract<PathSegment, { type: 'C' }>;
    next[legs.incoming] = {
      ...c,
      x2: pair.incoming.x2,
      y2: pair.incoming.y2
    };
  }

  if (out.type === 'L') {
    next[legs.outgoing] = {
      type: 'C',
      x1: pair.outgoing.x1,
      y1: pair.outgoing.y1,
      x2: pair.outgoing.x2,
      y2: pair.outgoing.y2,
      x: B.x,
      y: B.y
    };
  } else {
    const c = out as Extract<PathSegment, { type: 'C' }>;
    next[legs.outgoing] = {
      ...c,
      x1: pair.outgoing.x1,
      y1: pair.outgoing.y1
    };
  }

  pinFarHandlesWhenLineBecameCubic(next, legs, inc, out);

  snapAdjacentCornerHandlesAtVertices(segments, next, legs);

  return { ok: true, segments: next };
}
