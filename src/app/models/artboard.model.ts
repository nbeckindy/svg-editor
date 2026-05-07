export interface ArtboardModel {
  width: number;
  height: number;
  minX: number;
  minY: number;
  backgroundColor: string;
}

export const DEFAULT_ARTBOARD: Readonly<ArtboardModel> = {
  width: 800,
  height: 600,
  minX: 0,
  minY: 0,
  backgroundColor: '#ffffff'
};

/** Corner, edge, or center that stays fixed in user space when artboard width/height change. */
export type ArtboardResizeAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const DEFAULT_ARTBOARD_RESIZE_ANCHOR: ArtboardResizeAnchor = 'top-left';

const ANCHOR_FRACTIONS: Record<ArtboardResizeAnchor, { fx: number; fy: number }> = {
  'top-left': { fx: 0, fy: 0 },
  'top-center': { fx: 0.5, fy: 0 },
  'top-right': { fx: 1, fy: 0 },
  'middle-left': { fx: 0, fy: 0.5 },
  center: { fx: 0.5, fy: 0.5 },
  'middle-right': { fx: 1, fy: 0.5 },
  'bottom-left': { fx: 0, fy: 1 },
  'bottom-center': { fx: 0.5, fy: 1 },
  'bottom-right': { fx: 1, fy: 1 }
};

/** New artboard origin (viewBox min-x/min-y) so the anchor point stays fixed after resize. */
export function computeArtboardOriginForResize(
  prev: Pick<ArtboardModel, 'minX' | 'minY' | 'width' | 'height'>,
  newWidth: number,
  newHeight: number,
  anchor: ArtboardResizeAnchor
): { minX: number; minY: number } {
  const { fx, fy } = ANCHOR_FRACTIONS[anchor];
  return {
    minX: prev.minX + fx * (prev.width - newWidth),
    minY: prev.minY + fy * (prev.height - newHeight)
  };
}
