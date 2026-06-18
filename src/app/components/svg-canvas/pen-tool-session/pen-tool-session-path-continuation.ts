import { rootSvgUserPointToScreenPoint } from '../../../utils/svg-screen-user';
import {
  lastCommittedVertex,
  penPathSegmentsAreValid,
  penSvgDistanceSq,
  type PenPathSegment
} from '../../../models/pen-path';
import { parsePathDForNodeEditing } from '../../../models/path-d';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { PEN_SINGLE_CLICK_CLOSE_RADIUS_PX } from './pen-tool-session-constants';
import type { PenOpenPathFinishJoinHit } from './pen-tool-session-finish';

export type PenOpenDrawableForJoin = { segments: PenPathSegment[]; d: string };

export function penSvgUserPointToApproxClient(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  userX: number,
  userY: number
): { x: number; y: number } | null {
  const mainSvg = ports.getMainSvgElement();
  if (!mainSvg) return null;
  const scr = rootSvgUserPointToScreenPoint(mainSvg, userX, userY);
  if (scr) return scr;
  const vb = ports.parseOverlayViewBox();
  const r = mainSvg.getBoundingClientRect();
  if (!vb || r.width <= 0 || r.height <= 0) return null;
  return {
    x: r.left + ((userX - vb.vbMinX) / vb.vbW) * r.width,
    y: r.top + ((userY - vb.vbMinY) / vb.vbH) * r.height
  };
}

/** Viewport-pixel tolerance match for pen join / single-click-close (never true if mapping fails). */
export function penClientPxWithinJoinToleranceVsSvgPoint(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  clientX: number,
  clientY: number,
  svgX: number,
  svgY: number,
  tolPx = PEN_SINGLE_CLICK_CLOSE_RADIUS_PX
): boolean {
  const c = penSvgUserPointToApproxClient(ports, svgX, svgY);
  if (!c) return false;
  const dx = clientX - c.x;
  const dy = clientY - c.y;
  return dx * dx + dy * dy <= tolPx * tolPx;
}

/** Squared distance in viewport pixels between two root-SVG-user points (`null` if mapping fails). */
export function penScreenDistanceSq(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number | null {
  const ma = penSvgUserPointToApproxClient(ports, ax, ay);
  const mb = penSvgUserPointToApproxClient(ports, bx, by);
  if (!ma || !mb) return null;
  const dx = ma.x - mb.x;
  const dy = ma.y - mb.y;
  return dx * dx + dy * dy;
}

/** Pen: join hit test (~{@link PEN_SINGLE_CLICK_CLOSE_RADIUS_PX} viewport px). Returns false if mapping fails so we never merge accidentally. */
export function penEndpointsWithinJoinTolerance(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  const d = penScreenDistanceSq(ports, ax, ay, bx, by);
  if (d === null) return false;
  const r = PEN_SINGLE_CLICK_CLOSE_RADIUS_PX;
  return d <= r * r;
}

/** Parse `<path>` `d`; must be **open** and pen-compatible drawable segments */
export function openPenDrawableForJoin(
  ports: Pick<PenToolSessionPorts, 'svgManipulation'>,
  pathId: string
): PenOpenDrawableForJoin | null {
  const svg = ports.svgManipulation.getSVGInstance();
  if (!svg) return null;
  const node = svg.findOne(`#${pathId}`)?.node as SVGPathElement | null;
  const rawD = node?.getAttribute('d');
  if (!rawD?.trim()) return null;
  const parsed = parsePathDForNodeEditing(rawD);
  if (!parsed || parsed.some((s) => s.type === 'Z')) return null;
  const drawable = parsed as PenPathSegment[];
  if (!penPathSegmentsAreValid(drawable)) return null;
  return { segments: drawable, d: rawD };
}

export function combinePenContinuationSegments(
  primary: readonly PenPathSegment[],
  continuation: readonly PenPathSegment[]
): PenPathSegment[] | null {
  if (!penPathSegmentsAreValid(primary) || continuation.length < 2 || continuation[0].type !== 'M') {
    return null;
  }
  return [...primary, ...continuation.slice(1)];
}

/** True when continuing from an open path head; close-at-tail uses frozen existing geometry + `Z`. */
export function isPrependContinuationCloseAtFrozenTail(
  rewrite: PenContinuingPathRewrite | null
): boolean {
  return rewrite?.stitch === 'prependBeforeExisting' && !!rewrite.existingSegments?.length;
}

function drawableEndVerticesAfterMoveto(stroke: readonly PenPathSegment[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const seg of stroke.slice(1)) {
    if (seg.type === 'M') continue;
    out.push({ x: seg.x, y: seg.y });
  }
  return out;
}

/** New closing vertices that are not already on the frozen forward open path (incl. tail). */
function filterNewClosingVerticesNotOnForward(
  forward: readonly PenPathSegment[],
  newVerts: readonly { x: number; y: number }[]
): { x: number; y: number }[] {
  const onForward = drawableEndVerticesAfterMoveto(forward);
  const tail = lastCommittedVertex(forward);
  return newVerts.filter((v) => {
    if (tail && penSvgDistanceSq(v, tail) < 1e-8) return false;
    return !onForward.some((fv) => penSvgDistanceSq(fv, v) < 1e-8);
  });
}

function appendLineVertices(
  segments: readonly PenPathSegment[],
  verts: readonly { x: number; y: number }[]
): PenPathSegment[] {
  let result = segments.map((s) => ({ ...s })) as PenPathSegment[];
  for (const v of verts) {
    const cur = lastCommittedVertex(result);
    if (cur && penSvgDistanceSq(cur, v) < 1e-8) continue;
    result.push({ type: 'L', x: v.x, y: v.y });
  }
  return result;
}

function appendDrawableSegments(
  segments: readonly PenPathSegment[],
  toAppend: readonly PenPathSegment[]
): PenPathSegment[] {
  let result = segments.map((s) => ({ ...s })) as PenPathSegment[];
  for (const seg of toAppend) {
    if (seg.type === 'M') continue;
    const end = lastCommittedVertex([seg]);
    const cur = lastCommittedVertex(result);
    if (end && cur && penSvgDistanceSq(cur, end) < 1e-8) continue;
    result.push({ ...seg } as PenPathSegment);
  }
  return result;
}

/**
 * Merge a prepend stroke with frozen existing geometry for **open finish** (no `Z`).
 * Re-anchors `M` at the last vertex drawn from the original head, then walks back through
 * earlier new vertices, then continues forward along the frozen open path from its head.
 */
export function combinePrependContinuationForOpen(
  newStroke: readonly PenPathSegment[],
  existing: readonly PenPathSegment[]
): PenPathSegment[] | null {
  if (existing.length < 1 || existing[0].type !== 'M') return null;
  if (newStroke.length === 0 || newStroke[0].type !== 'M') return null;

  if (newStroke.length === 1) {
    return existing.map((s) => ({ ...s })) as PenPathSegment[];
  }

  if (!penPathSegmentsAreValid(newStroke)) return null;

  const newVerts = drawableEndVerticesAfterMoveto(newStroke);
  if (newVerts.length === 0) {
    return existing.map((s) => ({ ...s })) as PenPathSegment[];
  }

  const reversed = [...newVerts].reverse();
  const head = { x: existing[0].x, y: existing[0].y };
  const body = existing.slice(1);

  let result: PenPathSegment[] = [{ type: 'M', x: reversed[0].x, y: reversed[0].y }];
  result = appendLineVertices(result, reversed.slice(1));
  result = appendLineVertices(result, [head]);
  return appendDrawableSegments(result, body);
}

/**
 * Merge a prepend stroke with frozen existing geometry for **close at tail**.
 * Keeps the original open path forward (head→tail), then appends new vertices drawn from `M`
 * as the closing leg from the tail (reversed draw order — last placed from `M` is first from tail).
 * `Z` seals head↔tail.
 */
export function combinePrependContinuationForClose(
  newStroke: readonly PenPathSegment[],
  existing: readonly PenPathSegment[]
): PenPathSegment[] | null {
  if (existing.length < 2 || existing[0].type !== 'M') return null;
  if (newStroke.length === 0 || newStroke[0].type !== 'M') return null;

  const forward = existing.map((s) => ({ ...s })) as PenPathSegment[];

  if (newStroke.length === 1) {
    return forward;
  }

  const closingVerts = filterNewClosingVerticesNotOnForward(
    forward,
    [...drawableEndVerticesAfterMoveto(newStroke)].reverse()
  );
  if (closingVerts.length > 0 && !penPathSegmentsAreValid(newStroke)) return null;

  return appendLineVertices(forward, closingVerts);
}

export type PenContinuingPathRewrite = {
  pathId: string;
  originalD: string;
  stitch: 'appendToExistingTail' | 'prependBeforeExisting';
  /** Present when {@link PenContinuingPathRewrite.stitch} is `prependBeforeExisting`. */
  existingSegments?: readonly PenPathSegment[];
};

export function penPrependContinuationCloseTargetMv(
  rewrite: PenContinuingPathRewrite | null
): { x: number; y: number } | null {
  if (rewrite?.stitch !== 'prependBeforeExisting' || !rewrite.existingSegments?.length) {
    return null;
  }
  return lastCommittedVertex(rewrite.existingSegments);
}

/** Screen-space close ring target: prepend tail, otherwise session `M`. */
export function penSessionCloseTargetMv(
  rewrite: PenContinuingPathRewrite | null,
  sessionSegments: readonly PenPathSegment[]
): { x: number; y: number } | null {
  const prependTail = penPrependContinuationCloseTargetMv(rewrite);
  if (prependTail) return prependTail;
  const m = sessionSegments[0];
  return m?.type === 'M' ? { x: m.x, y: m.y } : null;
}

export type PenOpenPathEndpointRole = 'head' | 'tail';

export type PenOpenPathPickupHit = {
  pathId: string;
  originalD: string;
  segments: PenPathSegment[];
  endpoint: { x: number; y: number };
  stitch: 'appendToExistingTail' | 'prependBeforeExisting';
};

export type PenOpenPathEndpointHoverHit = {
  pathId: string;
  endpoint: { x: number; y: number };
  role: PenOpenPathEndpointRole;
};

function penClientDistanceSqToSvgPoint(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  clientX: number,
  clientY: number,
  svgX: number,
  svgY: number
): number | null {
  const c = penSvgUserPointToApproxClient(ports, svgX, svgY);
  if (!c) return null;
  const dx = clientX - c.x;
  const dy = clientY - c.y;
  return dx * dx + dy * dy;
}

function resolvePenOpenPathEndpointPickup(
  ports: Pick<PenToolSessionPorts, 'getMainSvgElement' | 'parseOverlayViewBox'>,
  clientX: number,
  clientY: number,
  segments: readonly PenPathSegment[]
): { endpoint: { x: number; y: number }; stitch: 'appendToExistingTail' | 'prependBeforeExisting' } | null {
  const fv = segments[0];
  if (fv?.type !== 'M') return null;
  const head = { x: fv.x, y: fv.y };
  const tail = lastCommittedVertex(segments);
  if (!tail) return null;

  const headWithin = penClientPxWithinJoinToleranceVsSvgPoint(ports, clientX, clientY, head.x, head.y);
  const tailWithin = penClientPxWithinJoinToleranceVsSvgPoint(ports, clientX, clientY, tail.x, tail.y);
  if (!headWithin && !tailWithin) return null;

  if (headWithin && tailWithin) {
    const headDistSq = penClientDistanceSqToSvgPoint(ports, clientX, clientY, head.x, head.y);
    const tailDistSq = penClientDistanceSqToSvgPoint(ports, clientX, clientY, tail.x, tail.y);
    if (headDistSq === null || tailDistSq === null) return null;
    if (headDistSq <= tailDistSq) {
      return { endpoint: head, stitch: 'prependBeforeExisting' };
    }
    return { endpoint: tail, stitch: 'appendToExistingTail' };
  }
  if (tailWithin) {
    return { endpoint: tail, stitch: 'appendToExistingTail' };
  }
  return { endpoint: head, stitch: 'prependBeforeExisting' };
}

/**
 * Idle pen session: hit-test open paths by layer stack (top-first) for head/tail pickup within join tolerance.
 */
export function findPenOpenPathPickupAtEvent(
  ports: Pick<PenToolSessionPorts, 'svgManipulation' | 'getMainSvgElement' | 'parseOverlayViewBox'>,
  event: Pick<MouseEvent, 'clientX' | 'clientY'>
): PenOpenPathPickupHit | null {
  const svg = ports.svgManipulation.getSVGInstance();
  if (!svg) return null;

  const items = [...ports.svgManipulation.getLayerStackItems()].reverse();
  for (const item of items) {
    if (item.type !== 'path') continue;
    const open = openPenDrawableForJoin(ports, item.id);
    if (!open) continue;
    const resolved = resolvePenOpenPathEndpointPickup(ports, event.clientX, event.clientY, open.segments);
    if (!resolved) continue;
    return {
      pathId: item.id,
      originalD: open.d,
      segments: open.segments,
      endpoint: resolved.endpoint,
      stitch: resolved.stitch
    };
  }
  return null;
}

/** Idle pen tool: hover ring target for continuing an open path at head or tail. */
export function findPenOpenPathEndpointHoverAtClient(
  ports: Pick<PenToolSessionPorts, 'svgManipulation' | 'getMainSvgElement' | 'parseOverlayViewBox'>,
  clientX: number,
  clientY: number
): PenOpenPathEndpointHoverHit | null {
  const svg = ports.svgManipulation.getSVGInstance();
  if (!svg) return null;

  const items = [...ports.svgManipulation.getLayerStackItems()].reverse();
  for (const item of items) {
    if (item.type !== 'path') continue;
    const open = openPenDrawableForJoin(ports, item.id);
    if (!open) continue;
    const resolved = resolvePenOpenPathEndpointPickup(ports, clientX, clientY, open.segments);
    if (!resolved) continue;
    return {
      pathId: item.id,
      endpoint: resolved.endpoint,
      role: resolved.stitch === 'prependBeforeExisting' ? 'head' : 'tail'
    };
  }
  return null;
}

export function findPenOpenPathFinishJoin(
  ports: Pick<PenToolSessionPorts, 'svgManipulation' | 'getMainSvgElement' | 'parseOverlayViewBox'>,
  finishingSegs: readonly PenPathSegment[]
): PenOpenPathFinishJoinHit {
  if (!penPathSegmentsAreValid(finishingSegs)) return null;
  const drawnEnd = lastCommittedVertex(finishingSegs);
  if (!drawnEnd) return null;

  const items = [...ports.svgManipulation.getLayerStackItems()].reverse();
  for (const item of items) {
    if (item.type !== 'path') continue;
    const open = openPenDrawableForJoin(ports, item.id);
    if (!open) continue;
    const existing = open.segments;
    const fv = existing[0];
    if (fv.type !== 'M') continue;
    const lv = lastCommittedVertex(existing);
    if (!lv) continue;

    if (penEndpointsWithinJoinTolerance(ports, drawnEnd.x, drawnEnd.y, lv.x, lv.y)) {
      return {
        pathId: item.id,
        originalD: open.d,
        existing,
        stitch: 'appendToExistingTail'
      };
    }
    if (penEndpointsWithinJoinTolerance(ports, drawnEnd.x, drawnEnd.y, fv.x, fv.y)) {
      return {
        pathId: item.id,
        originalD: open.d,
        existing,
        stitch: 'prependBeforeExisting'
      };
    }
  }
  return null;
}
