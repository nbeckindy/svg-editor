import type { BBox, Point, ResizeHandle } from './selection-resize';
import { computeScaleAnchorFromUnionResize, isResizeCorner, isResizeEdge } from './selection-resize';

/** Attribute snapshot for undoable text uniform scale (no transform matrix). */
export interface TextScaleAttrSnapshot {
  fontSize: string | null;
  letterSpacing: string | null;
  wordSpacing: string | null;
  x: string | null;
  y: string | null;
}

export type TextUniformScaleMode = ResizeHandle | 'center';

/** True when every selected shape is a `<text>` (empty → false). */
export function isTextOnlyShapeList(shapes: ReadonlyArray<{ type: string }>): boolean {
  return shapes.length > 0 && shapes.every((s) => s.type === 'text');
}

/**
 * Uniform scale factor for a text-only resize. Aspect-locked unions use equal |sx|/|sy|;
 * center mode uses width ratio.
 */
export function computeTextUniformScaleFactor(
  mode: TextUniformScaleMode,
  unionBefore: BBox,
  unionAfter: BBox
): { s: number; ax: number; ay: number } {
  if (mode === 'center') {
    const s = unionBefore.width > 0 ? unionAfter.width / unionBefore.width : 1;
    return {
      s,
      ax: unionBefore.x + unionBefore.width / 2,
      ay: unionBefore.y + unionBefore.height / 2
    };
  }
  const { sx, sy, ax, ay } = computeScaleAnchorFromUnionResize(mode, unionBefore, unionAfter);
  // Prefer geometric mean when both axes report scale (aspect-locked should match);
  // fall back to whichever axis moved.
  const eps = 1e-9;
  const absSx = Math.abs(sx);
  const absSy = Math.abs(sy);
  let s: number;
  if (absSx > eps && absSy > eps) {
    s = Math.sign(sx || sy) * Math.sqrt(absSx * absSy);
  } else if (absSx > eps) {
    s = sx;
  } else if (absSy > eps) {
    s = sy;
  } else {
    s = 1;
  }
  return { s, ax, ay };
}

/** BBox corner used as the visual reference for a resize handle (or center). */
export function referencePointForTextScale(bbox: BBox, mode: TextUniformScaleMode): Point {
  if (mode === 'center') {
    return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
  }
  if (isResizeCorner(mode)) {
    switch (mode) {
      case 'se':
        return { x: bbox.x, y: bbox.y };
      case 'nw':
        return { x: bbox.x + bbox.width, y: bbox.y + bbox.height };
      case 'ne':
        return { x: bbox.x, y: bbox.y + bbox.height };
      case 'sw':
        return { x: bbox.x + bbox.width, y: bbox.y };
    }
  }
  if (isResizeEdge(mode)) {
    switch (mode) {
      case 'e':
        return { x: bbox.x, y: bbox.y + bbox.height / 2 };
      case 'w':
        return { x: bbox.x + bbox.width, y: bbox.y + bbox.height / 2 };
      case 'n':
        return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height };
      case 's':
        return { x: bbox.x + bbox.width / 2, y: bbox.y };
    }
  }
  return { x: bbox.x, y: bbox.y };
}

/** Map a point through uniform scale about pivot. */
export function scalePointAboutPivot(p: Point, pivot: Point, s: number): Point {
  return {
    x: pivot.x + s * (p.x - pivot.x),
    y: pivot.y + s * (p.y - pivot.y)
  };
}

/** Parse a numeric SVG presentation attribute; null if missing/non-finite. */
export function parseOptionalNumberAttr(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Scale a numeric attr string by `s`. Returns null when the attr was absent/invalid
 * (caller should leave the attribute unchanged).
 */
export function scaleNumericAttrString(value: string | null | undefined, s: number): string | null {
  const n = parseOptionalNumberAttr(value);
  if (n == null) return null;
  return `${n * s}`;
}

/**
 * Nudge (dx, dy) so `refAfter` lands on the desired scaled position of `refBefore`.
 */
export function nudgeToKeepScaledReference(
  refBefore: Point,
  refAfter: Point,
  pivot: Point,
  s: number
): Point {
  const desired = scalePointAboutPivot(refBefore, pivot, s);
  return { x: desired.x - refAfter.x, y: desired.y - refAfter.y };
}

/**
 * Build proportional `unionAfter` when the user edits only width or height in chrome
 * (text-only must stay aspect-locked).
 */
export function proportionalUnionAfterAxisEdit(
  unionBefore: BBox,
  axis: 'w' | 'h',
  newSize: number
): BBox {
  if (axis === 'w') {
    const s = unionBefore.width > 0 ? newSize / unionBefore.width : 1;
    return {
      x: unionBefore.x,
      y: unionBefore.y,
      width: newSize,
      height: Math.abs(unionBefore.height * s)
    };
  }
  const s = unionBefore.height > 0 ? newSize / unionBefore.height : 1;
  return {
    x: unionBefore.x,
    y: unionBefore.y,
    width: Math.abs(unionBefore.width * s),
    height: newSize
  };
}
