import { Injectable, signal } from '@angular/core';

export interface SnapPoint {
  x: number;
  y: number;
}

export interface SnapDeltaOptions {
  anchor?: SnapPoint;
}

export type SnapAxis = 'x' | 'y';
export type BBoxAnchor = 'min' | 'center' | 'max';

export interface SnapBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapCandidateShape {
  id: string;
  bbox: SnapBBox;
}

export interface SmartGuideMatch {
  axis: SnapAxis;
  movingAnchor: BBoxAnchor;
  candidateAnchor: BBoxAnchor;
  candidateId: string;
  guidePosition: number;
  offset: number;
}

export interface SmartGuideOptions {
  tolerance?: number;
  selectedShapeIds?: readonly string[];
}

export interface SmartGuideResult {
  delta: SnapPoint;
  guides: {
    vertical: number[];
    horizontal: number[];
  };
  matches: SmartGuideMatch[];
}

@Injectable({
  providedIn: 'root'
})
export class SnapService {
  readonly enabled = signal<boolean>(true);
  readonly gridSize = signal<number>(10);
  readonly snapTolerance = signal<number>(5);

  setEnabled(enabled: boolean): void {
    this.enabled.set(enabled);
  }

  setGridSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0) return;
    this.gridSize.set(size);
  }

  setSnapTolerance(tolerance: number): void {
    if (!Number.isFinite(tolerance) || tolerance < 0) return;
    this.snapTolerance.set(tolerance);
  }

  snapToGrid(point: SnapPoint): SnapPoint {
    return snapPointToGrid(point, this.gridSize(), this.enabled());
  }

  snapDelta(startPoint: SnapPoint, rawDelta: SnapPoint, options?: SnapDeltaOptions): SnapPoint {
    return computeSnappedDelta(startPoint, rawDelta, this.gridSize(), this.enabled(), options);
  }

  snapDeltaToSmartGuides(
    startBBox: SnapBBox,
    rawDelta: SnapPoint,
    candidateShapes: readonly SnapCandidateShape[],
    options?: SmartGuideOptions
  ): SmartGuideResult {
    return computeSmartGuideSnap(
      startBBox,
      rawDelta,
      candidateShapes,
      this.enabled(),
      {
        tolerance: options?.tolerance ?? this.snapTolerance(),
        selectedShapeIds: options?.selectedShapeIds
      }
    );
  }
}

export function snapPointToGrid(point: SnapPoint, gridSize: number, enabled: boolean): SnapPoint {
  if (!enabled) return { x: point.x, y: point.y };
  const size = sanitizeGridSize(gridSize);
  if (size === null) return { x: point.x, y: point.y };
  return {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size
  };
}

export function computeSnappedDelta(
  startPoint: SnapPoint,
  rawDelta: SnapPoint,
  gridSize: number,
  enabled: boolean,
  options?: SnapDeltaOptions
): SnapPoint {
  if (!enabled) return { x: rawDelta.x, y: rawDelta.y };
  const size = sanitizeGridSize(gridSize);
  if (size === null) return { x: rawDelta.x, y: rawDelta.y };

  const anchor = options?.anchor ?? startPoint;
  const target = {
    x: anchor.x + rawDelta.x,
    y: anchor.y + rawDelta.y
  };
  const snappedTarget = snapPointToGrid(target, size, true);
  return {
    x: snappedTarget.x - anchor.x,
    y: snappedTarget.y - anchor.y
  };
}

function sanitizeGridSize(gridSize: number): number | null {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return null;
  return gridSize;
}

export function computeSmartGuideSnap(
  startBBox: SnapBBox,
  rawDelta: SnapPoint,
  candidateShapes: readonly SnapCandidateShape[],
  enabled: boolean,
  options?: SmartGuideOptions
): SmartGuideResult {
  if (!enabled || candidateShapes.length === 0) {
    return emptySmartGuideResult(rawDelta);
  }

  const tolerance = sanitizeTolerance(options?.tolerance ?? 5);
  const selectedIds = new Set(options?.selectedShapeIds ?? []);
  const candidates = candidateShapes.filter((shape) => !selectedIds.has(shape.id));
  if (candidates.length === 0) {
    return emptySmartGuideResult(rawDelta);
  }

  const movingBBox = {
    x: startBBox.x + rawDelta.x,
    y: startBBox.y + rawDelta.y,
    width: startBBox.width,
    height: startBBox.height
  };

  const xResolution = resolveBestAxisMatches('x', movingBBox, candidates, tolerance);
  const yResolution = resolveBestAxisMatches('y', movingBBox, candidates, tolerance);

  return {
    delta: {
      x: rawDelta.x + xResolution.offset,
      y: rawDelta.y + yResolution.offset
    },
    guides: {
      vertical: xResolution.guides,
      horizontal: yResolution.guides
    },
    matches: [...xResolution.matches, ...yResolution.matches]
  };
}

function resolveBestAxisMatches(
  axis: SnapAxis,
  movingBBox: SnapBBox,
  candidates: readonly SnapCandidateShape[],
  tolerance: number
): { offset: number; guides: number[]; matches: SmartGuideMatch[] } {
  const possibleMatches: SmartGuideMatch[] = [];
  const movingAnchors = axisAnchors(movingBBox, axis);

  for (const candidate of candidates) {
    const candidateAnchors = axisAnchors(candidate.bbox, axis);
    for (const anchor of ['min', 'center', 'max'] as const) {
      const offset = candidateAnchors[anchor] - movingAnchors[anchor];
      if (Math.abs(offset) > tolerance) continue;
      possibleMatches.push({
        axis,
        movingAnchor: anchor,
        candidateAnchor: anchor,
        candidateId: candidate.id,
        guidePosition: candidateAnchors[anchor],
        offset
      });
    }
  }

  if (possibleMatches.length === 0) {
    return { offset: 0, guides: [], matches: [] };
  }

  let bestOffset = possibleMatches[0].offset;
  let bestDistance = Math.abs(bestOffset);
  for (const match of possibleMatches) {
    const distance = Math.abs(match.offset);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestOffset = match.offset;
    }
  }

  const matches = possibleMatches.filter((match) => nearlyEqual(match.offset, bestOffset));
  const guides = [...new Set(matches.map((match) => match.guidePosition))];
  guides.sort((a, b) => a - b);
  return { offset: bestOffset, guides, matches };
}

function axisAnchors(bbox: SnapBBox, axis: SnapAxis): Record<BBoxAnchor, number> {
  if (axis === 'x') {
    return {
      min: bbox.x,
      center: bbox.x + bbox.width / 2,
      max: bbox.x + bbox.width
    };
  }
  return {
    min: bbox.y,
    center: bbox.y + bbox.height / 2,
    max: bbox.y + bbox.height
  };
}

function sanitizeTolerance(tolerance: number): number {
  if (!Number.isFinite(tolerance) || tolerance < 0) return 5;
  return tolerance;
}

function emptySmartGuideResult(rawDelta: SnapPoint): SmartGuideResult {
  return {
    delta: { x: rawDelta.x, y: rawDelta.y },
    guides: { vertical: [], horizontal: [] },
    matches: []
  };
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
