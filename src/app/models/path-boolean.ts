import { union as martinezUnion, type Geometry, type MultiPolygon, type Ring } from 'martinez-polygon-clipping';
import { parsePathDForNodeEditing, type PathSegment } from './path-d';

export const BOOLEAN_FLATTEN_TOLERANCE = 0.25;

export type BooleanOp = 'union' | 'subtract' | 'intersect';

export type FlatPoint = { x: number; y: number };

export type FlattenedRing = FlatPoint[];

export type FlattenedPolygon = FlattenedRing[];

export interface PathBooleanGeometryPort {
  getPathElement(pathId: string): Element | null;
  getPathD(pathId: string): string | null;
  mapPathLocalToRootUser(pathId: string, lx: number, ly: number): { x: number; y: number };
  mapRootUserToPathLocal(pathId: string, rx: number, ry: number): { x: number; y: number } | null;
}

const STYLE_ATTRS = [
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'vector-effect',
  'paint-order'
] as const;

function formatCoord(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

function distPointToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-24) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function cubicFlatEnough(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint,
  p3: FlatPoint,
  tolerance: number
): boolean {
  const tolSq = tolerance * tolerance;
  return (
    distPointToSegmentSq(p1.x, p1.y, p0.x, p0.y, p3.x, p3.y) <= tolSq &&
    distPointToSegmentSq(p2.x, p2.y, p0.x, p0.y, p3.x, p3.y) <= tolSq
  );
}

function quadraticFlatEnough(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint,
  tolerance: number
): boolean {
  const tolSq = tolerance * tolerance;
  return distPointToSegmentSq(p1.x, p1.y, p0.x, p0.y, p2.x, p2.y) <= tolSq;
}

function subdivideCubic(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint,
  p3: FlatPoint
): [FlatPoint, FlatPoint, FlatPoint, FlatPoint, FlatPoint, FlatPoint, FlatPoint] {
  const m01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const m12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const m23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const m012 = { x: (m01.x + m12.x) / 2, y: (m01.y + m12.y) / 2 };
  const m123 = { x: (m12.x + m23.x) / 2, y: (m12.y + m23.y) / 2 };
  const mid = { x: (m012.x + m123.x) / 2, y: (m012.y + m123.y) / 2 };
  return [p0, m01, m012, mid, m123, m23, p3];
}

function subdivideQuadratic(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint
): [FlatPoint, FlatPoint, FlatPoint, FlatPoint, FlatPoint] {
  const m01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const m12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const mid = { x: (m01.x + m12.x) / 2, y: (m01.y + m12.y) / 2 };
  return [p0, m01, mid, m12, p2];
}

export function flattenCubicToPoints(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint,
  p3: FlatPoint,
  tolerance: number,
  out: FlatPoint[]
): void {
  if (cubicFlatEnough(p0, p1, p2, p3, tolerance)) {
    out.push(p3);
    return;
  }
  const [a0, a1, a2, a3, b0, b1, b2] = subdivideCubic(p0, p1, p2, p3);
  flattenCubicToPoints(a0, a1, a2, a3, tolerance, out);
  flattenCubicToPoints(a3, b0, b1, b2, tolerance, out);
}

export function flattenQuadraticToPoints(
  p0: FlatPoint,
  p1: FlatPoint,
  p2: FlatPoint,
  tolerance: number,
  out: FlatPoint[]
): void {
  if (quadraticFlatEnough(p0, p1, p2, tolerance)) {
    out.push(p2);
    return;
  }
  const [a0, a1, mid, b1, b2] = subdivideQuadratic(p0, p1, p2);
  flattenQuadraticToPoints(a0, a1, mid, tolerance, out);
  flattenQuadraticToPoints(mid, b1, b2, tolerance, out);
}

export function splitPathIntoSubpaths(segments: PathSegment[]): PathSegment[][] {
  const subpaths: PathSegment[][] = [];
  let current: PathSegment[] = [];
  for (const seg of segments) {
    if (seg.type === 'M') {
      if (current.length > 0) subpaths.push(current);
      current = [seg];
      continue;
    }
    current.push(seg);
    if (seg.type === 'Z') {
      subpaths.push(current);
      current = [];
    }
  }
  if (current.length > 0) subpaths.push(current);
  return subpaths;
}

export function subpathIsClosed(subpath: PathSegment[]): boolean {
  return subpath.some((s) => s.type === 'Z');
}

/** True when path parses for node editing and every subpath closes with `Z`. */
export function pathHasClosedSubpaths(pathData: string): boolean {
  const segments = parsePathDForNodeEditing(pathData);
  if (!segments) return false;
  const subpaths = splitPathIntoSubpaths(segments);
  if (subpaths.length === 0) return false;
  return subpaths.every(subpathIsClosed);
}

export function flattenSubpathToRing(
  subpath: PathSegment[],
  pathId: string,
  port: PathBooleanGeometryPort,
  tolerance = BOOLEAN_FLATTEN_TOLERANCE
): FlattenedRing | null {
  if (!subpathIsClosed(subpath)) return null;
  const ring: FlatPoint[] = [];
  let cx = 0;
  let cy = 0;

  const mapLocal = (lx: number, ly: number): FlatPoint => {
    const mapped = port.mapPathLocalToRootUser(pathId, lx, ly);
    return { x: mapped.x, y: mapped.y };
  };

  for (const seg of subpath) {
    switch (seg.type) {
      case 'M': {
        const p = mapLocal(seg.x, seg.y);
        cx = p.x;
        cy = p.y;
        ring.push(p);
        break;
      }
      case 'L': {
        const p = mapLocal(seg.x, seg.y);
        cx = p.x;
        cy = p.y;
        ring.push(p);
        break;
      }
      case 'C': {
        const p0 = { x: cx, y: cy };
        const p1 = mapLocal(seg.x1, seg.y1);
        const p2 = mapLocal(seg.x2, seg.y2);
        const p3 = mapLocal(seg.x, seg.y);
        flattenCubicToPoints(p0, p1, p2, p3, tolerance, ring);
        cx = p3.x;
        cy = p3.y;
        break;
      }
      case 'Q': {
        const p0 = { x: cx, y: cy };
        const p1 = mapLocal(seg.x1, seg.y1);
        const p2 = mapLocal(seg.x, seg.y);
        flattenQuadraticToPoints(p0, p1, p2, tolerance, ring);
        cx = p2.x;
        cy = p2.y;
        break;
      }
      case 'Z':
        break;
      default:
        break;
    }
  }

  if (ring.length < 3) return null;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (Math.hypot(first.x - last.x, first.y - last.y) > tolerance) {
    ring.push({ ...first });
  }
  return ring;
}

function ringToMartinez(ring: FlattenedRing): Ring {
  return ring.map((p) => [p.x, p.y] as [number, number]);
}

export function flattenedRingsToGeometry(rings: FlattenedRing[]): Geometry | null {
  const valid = rings.filter((r) => r.length >= 3);
  if (valid.length === 0) return null;
  const polygons = valid.map((ring) => [ringToMartinez(ring)]);
  if (polygons.length === 1) return polygons[0]!;
  return polygons as MultiPolygon;
}

function arrayNestingDepth(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length === 0) return 1;
  return 1 + arrayNestingDepth(value[0]);
}

export function geometryToPolygons(geometry: Geometry): Ring[][] {
  if (!geometry.length) return [];
  if (arrayNestingDepth(geometry) >= 4) {
    return geometry as MultiPolygon;
  }
  return [geometry as Ring[]];
}

export function geometryToRings(geometry: Geometry): FlattenedRing[] {
  const rings: FlattenedRing[] = [];
  for (const polygon of geometryToPolygons(geometry)) {
    for (const ring of polygon) {
      if (ring.length >= 3) {
        rings.push(ring.map(([x, y]) => ({ x, y })));
      }
    }
  }
  return rings;
}

export function ringsToPathD(rings: FlattenedRing[]): string {
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    const first = ring[0]!;
    parts.push('M', formatCoord(first.x), formatCoord(first.y));
    for (let i = 1; i < ring.length; i++) {
      const p = ring[i]!;
      parts.push('L', formatCoord(p.x), formatCoord(p.y));
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

export function geometryHasHoles(geometry: Geometry): boolean {
  const polygons = geometryToPolygons(geometry);
  if (polygons.length > 1) return true;
  return polygons.some((polygon) => polygon.length > 1);
}

export function foldMartinezUnion(geometries: Geometry[]): Geometry | null {
  let acc: Geometry | null = null;
  for (const geom of geometries) {
    if (!acc) {
      acc = geom;
      continue;
    }
    const next = martinezUnion(acc, geom);
    if (!next) return null;
    acc = next;
  }
  return acc;
}

export function sortPathIdsByDocumentOrder(pathIds: string[], port: PathBooleanGeometryPort): string[] {
  const nodes = pathIds
    .map((id) => ({ id, node: port.getPathElement(id) }))
    .filter((entry): entry is { id: string; node: Element } => entry.node !== null);

  nodes.sort((a, b) => {
    const pos = a.node.compareDocumentPosition(b.node);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  return nodes.map((n) => n.id);
}

export function operandPathToGeometry(
  pathId: string,
  port: PathBooleanGeometryPort
): Geometry | null {
  const d = port.getPathD(pathId);
  if (!d || !pathHasClosedSubpaths(d)) return null;
  const segments = parsePathDForNodeEditing(d);
  if (!segments) return null;
  const rings: FlattenedRing[] = [];
  for (const subpath of splitPathIntoSubpaths(segments)) {
    const ring = flattenSubpathToRing(subpath, pathId, port);
    if (ring) rings.push(ring);
  }
  return flattenedRingsToGeometry(rings);
}

export function unionPathGeometries(pathIds: string[], port: PathBooleanGeometryPort): FlattenedRing[] | null {
  const sorted = sortPathIdsByDocumentOrder(pathIds, port);
  const geometries: Geometry[] = [];
  for (const id of sorted) {
    const geom = operandPathToGeometry(id, port);
    if (geom) geometries.push(geom);
  }
  if (geometries.length === 0) return null;
  const result = foldMartinezUnion(geometries);
  if (!result) return null;
  const rings = geometryToRings(result);
  return rings.length > 0 ? rings : null;
}

/** Root-user rings → local `d` for a new identity-transform path in the content group. */
export function rootUserRingsToLocalPathD(rings: FlattenedRing[]): string {
  return ringsToPathD(rings);
}

export function copyPresentationAttrsFromElement(source: Element, target: Element): void {
  for (const attr of STYLE_ATTRS) {
    if (source.hasAttribute(attr)) {
      target.setAttribute(attr, source.getAttribute(attr)!);
    } else {
      target.removeAttribute(attr);
    }
  }
}

export function buildUnionResultPathMarkup(
  resultId: string,
  localD: string,
  styleSource: Element,
  hasHoles: boolean
): string {
  const svgNs = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('id', resultId);
  path.setAttribute('d', localD);
  copyPresentationAttrsFromElement(styleSource, path);
  path.setAttribute('fill-rule', hasHoles ? 'evenodd' : 'nonzero');
  path.removeAttribute('transform');
  return path.outerHTML;
}

export function allocateShapeId(usedIds: ReadonlySet<string>): string {
  let newId: string;
  do {
    newId = `shape-${Math.random().toString(36).substr(2, 9)}`;
  } while (usedIds.has(newId));
  return newId;
}
