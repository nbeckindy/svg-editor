import { collectPathNodeAnchorsForPathNodeConversion } from './path-node-anchor-convert';
import { penSvgDistanceSq } from './pen-path';
import type { PathSegment } from './path-d';

/**
 * Per-anchor “independent handles” for node-edit cubic drags: persisted on `<path>` because `d`
 * cannot encode whether opposite handles should stay unlinked.
 */
export const EDITOR_PATH_NODE_HANDLE_LINK_ATTR = 'data-editor-path-node-handle-link';

const STABLE_ANCHOR_MATCH_EPS_SQ = 1e-4;

/** Map move-segment index → independent at that vertex (omit key = symmetric / linked drag). */
export type PathNodeHandleLinkMap = Map<number, 'independent'>;

export function parsePathNodeHandleLinkMap(raw: string | null | undefined): PathNodeHandleLinkMap {
  const out: PathNodeHandleLinkMap = new Map();
  if (!raw || !raw.trim()) return out;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0) continue;
      if (v === 'independent') {
        out.set(idx, 'independent');
      }
    }
  } catch {
    /* ignore invalid JSON */
  }
  return out;
}

export function serializePathNodeHandleLinkMap(map: PathNodeHandleLinkMap): string | null {
  if (map.size === 0) return null;
  const obj: Record<string, 'independent'> = {};
  const keys = [...map.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    if (map.get(k) === 'independent') {
      obj[String(k)] = 'independent';
    }
  }
  return Object.keys(obj).length === 0 ? null : JSON.stringify(obj);
}

/**
 * After removing the segment at `removedSegmentIndex`, remap keys in `map` for the new segment list.
 * Drops the key equal to `removedSegmentIndex`; decrements keys strictly greater than it.
 */
export function remapPathNodeHandleLinkMapAfterSegmentRemoval(
  map: PathNodeHandleLinkMap,
  removedSegmentIndex: number
): PathNodeHandleLinkMap {
  const next: PathNodeHandleLinkMap = new Map();
  for (const [k, v] of map) {
    if (k === removedSegmentIndex) continue;
    if (k > removedSegmentIndex) {
      next.set(k - 1, v);
    } else {
      next.set(k, v);
    }
  }
  return next;
}

/**
 * After inserting one segment at `insertIndex` (new segment occupies that index; former tail shifts +1).
 */
export function remapPathNodeHandleLinkMapAfterSegmentInsert(
  map: PathNodeHandleLinkMap,
  insertIndex: number
): PathNodeHandleLinkMap {
  const next: PathNodeHandleLinkMap = new Map();
  for (const [k, v] of map) {
    if (k >= insertIndex) {
      next.set(k + 1, v);
    } else {
      next.set(k, v);
    }
  }
  return next;
}

/**
 * After `d` changes (delete node, pen insert, etc.), re-key independent flags by matching anchor
 * positions between old and new segment lists. Entries whose vertex disappears are dropped.
 */
export function remapPathNodeHandleLinkMapByStableAnchors(
  oldSegments: readonly PathSegment[],
  newSegments: readonly PathSegment[],
  map: PathNodeHandleLinkMap
): PathNodeHandleLinkMap {
  if (map.size === 0) return new Map();
  const oldAnchors = collectPathNodeAnchorsForPathNodeConversion(oldSegments);
  const newAnchors = collectPathNodeAnchorsForPathNodeConversion(newSegments);
  const next: PathNodeHandleLinkMap = new Map();

  for (const [oldMoveIdx, mode] of map) {
    if (mode !== 'independent') continue;
    const oldA = oldAnchors.find((a) => a.moveSegmentIndex === oldMoveIdx);
    if (!oldA) continue;
    let best: { mi: number; d: number } | null = null;
    for (const na of newAnchors) {
      const d = penSvgDistanceSq({ x: na.x, y: na.y }, { x: oldA.x, y: oldA.y });
      if (d < STABLE_ANCHOR_MATCH_EPS_SQ && (!best || d < best.d)) {
        best = { mi: na.moveSegmentIndex, d };
      }
    }
    if (best) {
      next.set(best.mi, 'independent');
    }
  }
  return next;
}
