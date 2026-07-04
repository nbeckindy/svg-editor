import type { Element as SvgJsElement } from '@svgdotjs/svg.js';

/** Snapshot to undo {@link SvgClipPathPort.makeClipPathFromSelection}. */
export interface MakeClipPathUndoSnapshot {
  clipShapeMarkup: string;
  clipShapeParentId: string | null;
  clipShapeFormerIndex: number;
  contentPlacement: Array<{ elementId: string; parentId: string | null; formerIndex: number }>;
}

/** Snapshot to undo {@link SvgClipPathPort.releaseClipPathForSelection}. */
export interface ReleaseClipPathUndoSnapshot {
  carrierGroupId: string;
  carrierParentId: string | null;
  carrierFormerIndex: number;
  clipPathDefId: string;
  clipPathChildMarkup: string;
  childIds: string[];
  /** Canvas shape id after clip geometry was restored on release (removed again on undo). */
  restoredClipShapeId: string | null;
}

export interface MakeClipPathResult {
  carrierGroupId: string;
  clipPathDefId: string;
  clipGeometryId: string;
  contentIds: string[];
  undo: MakeClipPathUndoSnapshot;
}

export interface ReleaseClipPathResult {
  freedChildIds: string[];
  restoredClipShapeId: string | null;
  undo: ReleaseClipPathUndoSnapshot;
}

export interface SvgClipPathPort {
  makeClipPathFromSelection(contentIds: string[], clipShapeId: string): MakeClipPathResult | null;
  undoMakeClipPath(
    snapshot: MakeClipPathUndoSnapshot,
    carrierGroupId: string,
    clipPathDefId: string
  ): void;
  releaseClipPathForSelection(shapeIds: string[]): ReleaseClipPathResult | null;
  undoReleaseClipPath(snapshot: ReleaseClipPathUndoSnapshot): string | null;
  findClipCarrierForShape(shapeId: string): string | null;
  /** When `shape` is clipped content, returns the `<clipPath>` child id (assigns one if missing). */
  resolveClipGeometryIdForContentShape(shape: SvgJsElement): string | null;
  /** Resolve clip carrier from clipped content or from clip-path geometry in defs. */
  resolveClipCarrierForShapeId(shapeId: string): Element | null;
  canMakeClipPath(shapeIds: string[]): boolean;
  canReleaseClipPath(shapeIds: string[]): boolean;
}
