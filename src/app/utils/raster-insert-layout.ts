/**
 * Placement math for raster `<image>` insert (see docs/adr/0001-raster-image-href-and-export.md).
 * Intrinsic pixel dimensions map 1:1 to root user units, then uniform scale-down to fit viewBox.
 */

export function parseRootViewBox(
  viewBox: string | null | undefined
): { minX: number; minY: number; width: number; height: number } | null {
  if (viewBox == null || viewBox.trim() === '') return null;
  const parts = viewBox.trim().split(/\s+/).map(Number);
  if (parts.length < 4) return null;
  const [minX, minY, width, height] = parts;
  if (![minX, minY, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { minX, minY, width, height };
}

export interface RasterInsertLayoutInput {
  /** Root SVG `viewBox` string, e.g. `"0 0 800 600"`. */
  viewBox: string | null | undefined;
  /** Decoded intrinsic width in pixels (1 user unit per pixel before clamp). */
  intrinsicWidthPx: number;
  intrinsicHeightPx: number;
  /** Anchor in root user space (image center will align here). */
  anchorX: number;
  anchorY: number;
}

export interface RasterInsertLayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns `<image>` `x`/`y` (top-left) and `width`/`height` in root user space.
 */
export function computeRasterInsertLayout(input: RasterInsertLayoutInput): RasterInsertLayoutResult {
  let w = Math.max(1, input.intrinsicWidthPx);
  let h = Math.max(1, input.intrinsicHeightPx);

  const vb = parseRootViewBox(input.viewBox);
  if (vb && vb.width > 0 && vb.height > 0) {
    const s = Math.min(1, vb.width / w, vb.height / h);
    w *= s;
    h *= s;
  }

  let x = input.anchorX - w / 2;
  let y = input.anchorY - h / 2;

  if (vb) {
    const maxX = vb.minX + vb.width - w;
    const maxY = vb.minY + vb.height - h;
    x = Math.min(Math.max(x, vb.minX), maxX);
    y = Math.min(Math.max(y, vb.minY), maxY);
  }

  return { x, y, width: w, height: h };
}
