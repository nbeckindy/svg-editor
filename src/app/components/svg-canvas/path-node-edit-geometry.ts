import { penSvgDistanceSq } from '../../models/pen-path';
import type { PathSegment } from '../../models/path-d';

/** Squared distance below which a close-path anchor duplicates the subpath start (user space). */
export const PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ = 1e-6;

export interface PathNodePoint {
  x: number;
  y: number;
  segmentIndex: number;
  moveSegmentIndex: number;
}

export interface PathNodeControlHandle {
  anchorX: number;
  anchorY: number;
  controlX: number;
  controlY: number;
  segmentIndex: number;
  controlPoint: 'x1y1' | 'x2y2';
  vertexMoveSegmentIndex: number;
}

export function collectPathNodeAnchors(segments: readonly PathSegment[]): PathNodePoint[] {
  const anchors: PathNodePoint[] = [];
  let current: PathNodePoint | null = null;
  let subpathStart: PathNodePoint | null = null;

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
        penSvgDistanceSq({ x: segment.x, y: segment.y }, { x: subpathStart.x, y: subpathStart.y }) <
          PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
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
        penSvgDistanceSq({ x: segment.x, y: segment.y }, { x: subpathStart.x, y: subpathStart.y }) <
          PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
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
        penSvgDistanceSq({ x: segment.x, y: segment.y }, { x: subpathStart.x, y: subpathStart.y }) <
          PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ;
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

export function collectPathControlHandles(segments: readonly PathSegment[]): PathNodeControlHandle[] {
  const handles: PathNodeControlHandle[] = [];
  let current: PathNodePoint | null = null;
  let subpathStart: PathNodePoint | null = null;

  for (const [segmentIndex, segment] of segments.entries()) {
    if (segment.type === 'M') {
      current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
      subpathStart = current;
      continue;
    }
    if (segment.type === 'L') {
      current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
      continue;
    }
    if (segment.type === 'C') {
      if (current) {
        handles.push({
          anchorX: current.x,
          anchorY: current.y,
          controlX: segment.x1,
          controlY: segment.y1,
          segmentIndex,
          controlPoint: 'x1y1',
          vertexMoveSegmentIndex: current.moveSegmentIndex
        });
      }
      handles.push({
        anchorX: segment.x,
        anchorY: segment.y,
        controlX: segment.x2,
        controlY: segment.y2,
        segmentIndex,
        controlPoint: 'x2y2',
        vertexMoveSegmentIndex: segmentIndex
      });
      current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
      continue;
    }
    if (segment.type === 'Q') {
      if (current) {
        handles.push({
          anchorX: current.x,
          anchorY: current.y,
          controlX: segment.x1,
          controlY: segment.y1,
          segmentIndex,
          controlPoint: 'x1y1',
          vertexMoveSegmentIndex: current.moveSegmentIndex
        });
      }
      current = { x: segment.x, y: segment.y, segmentIndex, moveSegmentIndex: segmentIndex };
      continue;
    }
    if (segment.type === 'Z' && subpathStart) {
      current = {
        x: subpathStart.x,
        y: subpathStart.y,
        segmentIndex,
        moveSegmentIndex: subpathStart.moveSegmentIndex
      };
    }
  }

  return handles;
}
