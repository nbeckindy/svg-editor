import { parsePathD, pathSegmentsToD, type PathSegment } from './path-d';

const DEFAULT_MIN_T = 0.02;
const DEFAULT_MAX_T = 0.98;
const QUADRATIC_SEARCH_STEPS = 80;
const CUBIC_SEARCH_STEPS = 96;

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

function closestPointOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number
): { x: number; y: number; t: number; distSq: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-18) {
    return { x: ax, y: ay, t: 0, distSq: distSq(ax, ay, px, py) };
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * abx;
  const y = ay + t * aby;
  return { x, y, t, distSq: distSq(x, y, px, py) };
}

function cubicPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
  };
}

function closestPointOnCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  px: number,
  py: number
): { t: number; x: number; y: number; distSq: number } {
  let bestT = 0;
  let bestD = Infinity;
  let bestX = x0;
  let bestY = y0;
  const steps = CUBIC_SEARCH_STEPS;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = cubicPoint(x0, y0, x1, y1, x2, y2, x3, y3, t);
    const d = distSq(p.x, p.y, px, py);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestX = p.x;
      bestY = p.y;
    }
  }
  const delta = 1 / (steps * 8);
  for (let r = 0; r < 6; r++) {
    const tL = Math.max(0, bestT - delta);
    const tR = Math.min(1, bestT + delta);
    const pL = cubicPoint(x0, y0, x1, y1, x2, y2, x3, y3, tL);
    const pR = cubicPoint(x0, y0, x1, y1, x2, y2, x3, y3, tR);
    const dL = distSq(pL.x, pL.y, px, py);
    const dR = distSq(pR.x, pR.y, px, py);
    if (dL < bestD) {
      bestD = dL;
      bestT = tL;
      bestX = pL.x;
      bestY = pL.y;
    }
    if (dR < bestD) {
      bestD = dR;
      bestT = tR;
      bestX = pR.x;
      bestY = pR.y;
    }
  }
  return { t: bestT, x: bestX, y: bestY, distSq: bestD };
}

function quadraticPoint(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * x1 + t * t * x2,
    y: u * u * y0 + 2 * u * t * y1 + t * t * y2
  };
}

function closestPointOnQuadratic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number
): { t: number; x: number; y: number; distSq: number } {
  let bestT = 0;
  let bestD = Infinity;
  let bestX = x0;
  let bestY = y0;
  const steps = QUADRATIC_SEARCH_STEPS;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = quadraticPoint(x0, y0, x1, y1, x2, y2, t);
    const d = distSq(p.x, p.y, px, py);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestX = p.x;
      bestY = p.y;
    }
  }
  const delta = 1 / (steps * 8);
  for (let r = 0; r < 6; r++) {
    const tL = Math.max(0, bestT - delta);
    const tR = Math.min(1, bestT + delta);
    const pL = quadraticPoint(x0, y0, x1, y1, x2, y2, tL);
    const pR = quadraticPoint(x0, y0, x1, y1, x2, y2, tR);
    const dL = distSq(pL.x, pL.y, px, py);
    const dR = distSq(pR.x, pR.y, px, py);
    if (dL < bestD) {
      bestD = dL;
      bestT = tL;
      bestX = pL.x;
      bestY = pL.y;
    }
    if (dR < bestD) {
      bestD = dR;
      bestT = tR;
      bestX = pR.x;
      bestY = pR.y;
    }
  }
  return { t: bestT, x: bestX, y: bestY, distSq: bestD };
}

export type PenPathInsertHit =
  | { kind: 'L'; segmentIndex: number; x: number; y: number }
  | { kind: 'Q'; segmentIndex: number; t: number }
  | { kind: 'C'; segmentIndex: number; t: number }
  | { kind: 'Z'; segmentIndex: number; x: number; y: number };

export function findPenPathInsertHit(
  segments: readonly PathSegment[],
  px: number,
  py: number,
  maxDistSq: number,
  minT = DEFAULT_MIN_T,
  maxT = DEFAULT_MAX_T
): PenPathInsertHit | null {
  let cx = 0;
  let cy = 0;
  let subpathStart = { x: 0, y: 0 };
  let hasSubpath = false;
  let bestHit: PenPathInsertHit | null = null;
  let bestDistSq = Infinity;

  const consider = (hit: PenPathInsertHit, distSq: number, t: number) => {
    if (t < minT || t > maxT) return;
    if (distSq > maxDistSq) return;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestHit = hit;
    }
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'M') {
      subpathStart = { x: seg.x, y: seg.y };
      cx = seg.x;
      cy = seg.y;
      hasSubpath = true;
      continue;
    }
    if (!hasSubpath) continue;

    if (seg.type === 'L') {
      const cp = closestPointOnSegment(cx, cy, seg.x, seg.y, px, py);
      consider({ kind: 'L', segmentIndex: i, x: cp.x, y: cp.y }, cp.distSq, cp.t);
      cx = seg.x;
      cy = seg.y;
    } else if (seg.type === 'Q') {
      const cp = closestPointOnQuadratic(cx, cy, seg.x1, seg.y1, seg.x, seg.y, px, py);
      consider({ kind: 'Q', segmentIndex: i, t: cp.t }, cp.distSq, cp.t);
      cx = seg.x;
      cy = seg.y;
    } else if (seg.type === 'C') {
      const cp = closestPointOnCubic(cx, cy, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y, px, py);
      consider({ kind: 'C', segmentIndex: i, t: cp.t }, cp.distSq, cp.t);
      cx = seg.x;
      cy = seg.y;
    } else if (seg.type === 'Z') {
      const cp = closestPointOnSegment(cx, cy, subpathStart.x, subpathStart.y, px, py);
      consider({ kind: 'Z', segmentIndex: i, x: cp.x, y: cp.y }, cp.distSq, cp.t);
      cx = subpathStart.x;
      cy = subpathStart.y;
    }
  }

  return bestHit;
}

function splitCubicAtT(
  sx: number,
  sy: number,
  seg: Extract<PathSegment, { type: 'C' }>,
  t: number
): [PathSegment, PathSegment] {
  const p0 = { x: sx, y: sy };
  const p1 = { x: seg.x1, y: seg.y1 };
  const p2 = { x: seg.x2, y: seg.y2 };
  const p3 = { x: seg.x, y: seg.y };
  const l01 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
  const l12 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  const l23 = { x: p2.x + t * (p3.x - p2.x), y: p2.y + t * (p3.y - p2.y) };
  const l012 = { x: l01.x + t * (l12.x - l01.x), y: l01.y + t * (l12.y - l01.y) };
  const l123 = { x: l12.x + t * (l23.x - l12.x), y: l12.y + t * (l23.y - l12.y) };
  const l0123 = { x: l012.x + t * (l123.x - l012.x), y: l012.y + t * (l123.y - l012.y) };
  const first: PathSegment = {
    type: 'C',
    x1: l01.x,
    y1: l01.y,
    x2: l012.x,
    y2: l012.y,
    x: l0123.x,
    y: l0123.y
  };
  const second: PathSegment = {
    type: 'C',
    x1: l123.x,
    y1: l123.y,
    x2: l23.x,
    y2: l23.y,
    x: p3.x,
    y: p3.y
  };
  return [first, second];
}

function splitQuadraticAtT(
  sx: number,
  sy: number,
  seg: Extract<PathSegment, { type: 'Q' }>,
  t: number
): [PathSegment, PathSegment] {
  const p0 = { x: sx, y: sy };
  const p1 = { x: seg.x1, y: seg.y1 };
  const p2 = { x: seg.x, y: seg.y };
  const l01 = { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
  const l12 = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  const l012 = { x: l01.x + t * (l12.x - l01.x), y: l01.y + t * (l12.y - l01.y) };
  const first: PathSegment = {
    type: 'Q',
    x1: l01.x,
    y1: l01.y,
    x: l012.x,
    y: l012.y
  };
  const second: PathSegment = {
    type: 'Q',
    x1: l12.x,
    y1: l12.y,
    x: p2.x,
    y: p2.y
  };
  return [first, second];
}

function pointBeforeSegmentIndex(
  segments: readonly PathSegment[],
  index: number
): { x: number; y: number } | null {
  let cx = 0;
  let cy = 0;
  let subpathStart = { x: 0, y: 0 };
  let hasSubpath = false;

  for (let j = 0; j < index; j++) {
    const s = segments[j];
    if (s.type === 'M') {
      subpathStart = { x: s.x, y: s.y };
      cx = s.x;
      cy = s.y;
      hasSubpath = true;
    } else if (s.type === 'L') {
      cx = s.x;
      cy = s.y;
    } else if (s.type === 'C') {
      cx = s.x;
      cy = s.y;
    } else if (s.type === 'Q') {
      cx = s.x;
      cy = s.y;
    } else if (s.type === 'Z') {
      cx = subpathStart.x;
      cy = subpathStart.y;
    }
  }

  return hasSubpath ? { x: cx, y: cy } : null;
}

export function applyPenPathInsert(segments: readonly PathSegment[], hit: PenPathInsertHit): PathSegment[] | null {
  const next = segments.map((s) => ({ ...s }));
  if (hit.kind === 'L') {
    const i = hit.segmentIndex;
    const seg = next[i];
    if (!seg || seg.type !== 'L') return null;
    const endX = seg.x;
    const endY = seg.y;
    next.splice(i, 1, { type: 'L', x: hit.x, y: hit.y }, { type: 'L', x: endX, y: endY });
    return next;
  }
  if (hit.kind === 'Z') {
    const i = hit.segmentIndex;
    if (!next[i] || next[i].type !== 'Z') return null;
    next.splice(i, 0, { type: 'L', x: hit.x, y: hit.y });
    return next;
  }
  if (hit.kind === 'Q') {
    const i = hit.segmentIndex;
    const seg = next[i];
    if (!seg || seg.type !== 'Q') return null;
    const start = pointBeforeSegmentIndex(segments, i);
    if (!start) return null;
    const [q1, q2] = splitQuadraticAtT(start.x, start.y, seg, hit.t);
    next.splice(i, 1, q1, q2);
    return next;
  }
  if (hit.kind === 'C') {
    const i = hit.segmentIndex;
    const seg = next[i];
    if (!seg || seg.type !== 'C') return null;
    const start = pointBeforeSegmentIndex(segments, i);
    if (!start) return null;
    const [c1, c2] = splitCubicAtT(start.x, start.y, seg, hit.t);
    next.splice(i, 1, c1, c2);
    return next;
  }
  return null;
}

/**
 * If click point is within tolerance of a drawable segment, returns new segment list; otherwise null.
 */
export function insertPenNodeOnParsedPath(
  segments: readonly PathSegment[],
  px: number,
  py: number,
  maxDistSq: number
): PathSegment[] | null {
  const hit = findPenPathInsertHit(segments, px, py, maxDistSq);
  if (!hit) return null;
  const next = applyPenPathInsert(segments, hit);
  if (!next) return null;
  const d = pathSegmentsToD(next);
  const reparsed = parsePathD(d);
  if (reparsed.errors.length > 0) return null;
  return next;
}
