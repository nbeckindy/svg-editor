import { pathSegmentsToD, type PathSegment } from './path-d';

export type PathSelectionOutlinePointMapper = (
  pathId: string,
  lx: number,
  ly: number
) => { x: number; y: number };

/** Map path-local segment coordinates into overlay (screen-aligned) space. */
export function mapPathSegmentsToOverlaySpace(
  pathId: string,
  segments: readonly PathSegment[],
  mapPoint: PathSelectionOutlinePointMapper
): PathSegment[] {
  const map = (lx: number, ly: number) => mapPoint(pathId, lx, ly);
  return segments.map((segment) => {
    if (segment.type === 'Z') return { type: 'Z' as const };
    if (segment.type === 'M' || segment.type === 'L' || segment.type === 'T') {
      const p = map(segment.x, segment.y);
      return { ...segment, x: p.x, y: p.y };
    }
    if (segment.type === 'Q') {
      const c = map(segment.x1, segment.y1);
      const p = map(segment.x, segment.y);
      return { type: 'Q', x1: c.x, y1: c.y, x: p.x, y: p.y };
    }
    if (segment.type === 'C') {
      const c1 = map(segment.x1, segment.y1);
      const c2 = map(segment.x2, segment.y2);
      const p = map(segment.x, segment.y);
      return { type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: p.x, y: p.y };
    }
    if (segment.type === 'S') {
      const c2 = map(segment.x2, segment.y2);
      const p = map(segment.x, segment.y);
      return { type: 'S', x2: c2.x, y2: c2.y, x: p.x, y: p.y };
    }
    return segment;
  });
}

export function buildPathSelectionOutlineOverlayD(
  pathId: string,
  segments: readonly PathSegment[],
  mapPoint: PathSelectionOutlinePointMapper
): string {
  return pathSegmentsToD(mapPathSegmentsToOverlaySpace(pathId, segments, mapPoint));
}
