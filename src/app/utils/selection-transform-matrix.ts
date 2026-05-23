import { Matrix } from '@svgdotjs/svg.js';

/** Degrees: treat rotations as equivalent modulo 360° (e.g. 0° vs 360°). */
export const ROTATION_MIXED_EPS_DEG = 0.05;

/** Skew readout: two shapes differ when skew components differ by more than this (degrees). */
export const SKEW_MIXED_EPS_DEG = 0.05;

export function isFinitePositiveDim(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/** Map any finite angle in degrees to `[0, 360)`. */
export function normDeg0To360(deg: number): number {
  if (!Number.isFinite(deg)) return NaN;
  return ((deg % 360) + 360) % 360;
}

export function shortestSignedDeltaDeg(fromDeg: number, toDeg: number): number {
  const a = normDeg0To360(fromDeg);
  const b = normDeg0To360(toDeg);
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function rotationDiffDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Rotation (degrees, 0–360) from the element’s cumulative transform in **root SVG user space**.
 * Uses the linear 2×2 part of the SVG `matrix(a,b,c,d,e,f)` where `x' = a·x + c·y + e`,
 * `y' = b·x + d·y + f`. The image of the local +X axis is `(a, b)`, so **θ = atan2(b, a)**.
 */
export function rotationDeg0To360FromMatrix(m: Matrix): number {
  const v = m.valueOf() as { a: number; b: number; c: number; d: number };
  const rad = Math.atan2(v.b, v.a);
  return normDeg0To360((rad * 180) / Math.PI);
}

/** SVG.js cumulative matrix: approximate skew X/Y in degrees from linear part. */
export function skewDegFromMatrix(m: Matrix): { skewX: number; skewY: number } {
  const v = m.valueOf() as { a: number; b: number; c: number; d: number };
  return {
    skewX: (Math.atan2(v.c, v.a) * 180) / Math.PI,
    skewY: (Math.atan2(v.b, v.d) * 180) / Math.PI
  };
}
