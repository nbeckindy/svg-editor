import type { PathSegment } from '../../../models/path-d';
import type { PathNodeControlHandle, PathNodePoint } from '../path-node-edit-geometry';

/** Path parse + overlay mapping for pen session path-node chrome. */
export interface PenToolSessionPathNodeOverlayPort {
  parsePathDataForNodeEditing(pathData: string): PathSegment[] | null;
  collectPathNodeAnchors(segments: readonly PathSegment[]): PathNodePoint[];
  collectPathControlHandles(segments: readonly PathSegment[]): PathNodeControlHandle[];
  pathNodeLocalPointToOverlay(pathId: string, lx: number, ly: number): { x: number; y: number };
  penRootUserPointToOverlay(rx: number, ry: number): { x: number; y: number };
  getPenPostInsertAnchorPathId(): string | null;
  isPathInNodeEditState(pathId: string): boolean;
}
