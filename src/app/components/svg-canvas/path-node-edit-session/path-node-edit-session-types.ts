import type { PathSegment } from '../../../models/path-d';

export {
  PATH_SUBPATH_CLOSE_ANCHOR_COINCIDENT_EPS_SQ,
  type PathNodeControlHandle,
  type PathNodePoint
} from '../path-node-edit-geometry';

export const PATH_NODE_EDIT_FEEDBACK_DURATION_MS = 1400;

export interface PathNodeEditPathState {
  pathId: string;
  anchors: import('../path-node-edit-geometry').PathNodePoint[];
  controlHandles: import('../path-node-edit-geometry').PathNodeControlHandle[];
}

export interface PathNodeSelectionState {
  pathId: string;
  moveSegmentIndex: number;
}

export interface PathNodeEditState {
  paths: PathNodeEditPathState[];
  activePathId: string | null;
}

export interface PathNodeEditStateBuildResult {
  state: PathNodeEditPathState | null;
  reason: string | null;
}

export interface PathNodeDragSession {
  pathId: string;
  oldD: string;
  segments: PathSegment[];
  target:
    | { kind: 'anchor'; index: number }
    | { kind: 'control'; index: number };
}
