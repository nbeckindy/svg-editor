export type PathNodeLineOverlay = { x1: number; y1: number; x2: number; y2: number };

export type PathNodePointOverlay = { cx: number; cy: number };

export type PathNodeInsertAffordanceOverlay = {
  lines: PathNodeLineOverlay[];
  knobs: PathNodePointOverlay[];
  plantedAnchor: PathNodePointOverlay;
};

export type PathNodeSessionOverlay = {
  anchors: PathNodePointOverlay[];
  handles: Array<PathNodeLineOverlay & PathNodePointOverlay>;
};

export type PathSelectionOutlineOverlay = { pathId: string; d: string };

export type PathNodeAnchorOverlay = PathNodePointOverlay & {
  selected: boolean;
  pathId: string;
  anchorIndex: number;
};

export type PathNodeControlHandleOverlay = PathNodeLineOverlay &
  PathNodePointOverlay & {
    pathId: string;
    handleIndex: number;
  };
