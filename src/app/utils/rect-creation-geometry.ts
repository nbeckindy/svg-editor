import type { OrientationPoint } from '../components/orientation-grid/orientation-grid.component';

export interface RectSize {
  width: number;
  height: number;
}

export interface AxisAlignedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/** Clamp linked corner radius to SVG max: half the shorter edge. */
export function clampRectCornerRadius(width: number, height: number, radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
  return Math.min(radius, width / 2, height / 2);
}

/**
 * Place a W×H rect so `orientation` of the rect sits on `anchor` (click point).
 * Default product orientation is top-left.
 */
export function placeRectAtOrientation(
  anchor: Point2,
  size: RectSize,
  orientation: OrientationPoint
): AxisAlignedRect {
  const width = size.width;
  const height = size.height;
  let x = anchor.x;
  let y = anchor.y;

  switch (orientation) {
    case 'top-left':
      break;
    case 'top-center':
      x = anchor.x - width / 2;
      break;
    case 'top-right':
      x = anchor.x - width;
      break;
    case 'middle-left':
      y = anchor.y - height / 2;
      break;
    case 'center':
      x = anchor.x - width / 2;
      y = anchor.y - height / 2;
      break;
    case 'middle-right':
      x = anchor.x - width;
      y = anchor.y - height / 2;
      break;
    case 'bottom-left':
      y = anchor.y - height;
      break;
    case 'bottom-center':
      x = anchor.x - width / 2;
      y = anchor.y - height;
      break;
    case 'bottom-right':
      x = anchor.x - width;
      y = anchor.y - height;
      break;
  }

  return { x, y, width, height };
}
