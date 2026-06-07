import { rootSvgUserPointToScreenPoint } from '../../../utils/svg-screen-user';
import {
  lastCommittedVertex,
  penPathSegmentsAreValid,
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

export type PenOpenPathPickupHit = {
  pathId: string;
  originalD: string;
  segments: PenPathSegment[];
  tail: { x: number; y: number };
};

/**
 * Idle pen session: hit-test open paths by layer stack (top-first) for tail pickup within join tolerance.
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
    const tail = lastCommittedVertex(open.segments);
    if (!tail) continue;
    if (!penClientPxWithinJoinToleranceVsSvgPoint(ports, event.clientX, event.clientY, tail.x, tail.y)) {
      continue;
    }
    return { pathId: item.id, originalD: open.d, segments: open.segments, tail };
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
