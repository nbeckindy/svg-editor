import type { EditableGradientModel } from './svg-gradient';

export interface DrawingStyleDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
  /**
   * Template for next-draw fill when mode is linear/radial.
   * Materialized into a fresh defs entry per created shape.
   */
  fillGradient: EditableGradientModel | null;
  /**
   * Template for next-draw stroke when mode is linear/radial.
   * Materialized into a fresh defs entry per created shape.
   */
  strokeGradient: EditableGradientModel | null;
  /** Default `font-family` for new `<text>` (text tool and shared typography preview). */
  fontFamily: string;
  /** User-space font size for new `<text>`. */
  fontSize: number;
  /** `font-weight` presentation value (e.g. `normal`, `bold`, numeric weights). */
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  textAnchor: 'start' | 'middle' | 'end';
}

/**
 * Canonical drawing defaults used by creation tools.
 * These values intentionally match today's creation-flow baselines.
 */
export const BASE_DRAWING_STYLE_DEFAULTS: DrawingStyleDefaults = {
  fill: '#000000',
  stroke: '#000000',
  strokeWidth: 2,
  fillGradient: null,
  strokeGradient: null,
  fontFamily: 'Arial, sans-serif',
  fontSize: 16,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start'
};

/** Paint mode implied by a solid color string + optional gradient template. */
export type CreationPaintMode = 'solid' | 'linear' | 'radial' | 'none';

export function creationPaintMode(
  solid: string | undefined | null,
  gradient: EditableGradientModel | null | undefined
): CreationPaintMode {
  if (gradient) {
    return gradient.kind === 'radial' ? 'radial' : 'linear';
  }
  if (!solid || solid.trim() === '' || solid.toLowerCase() === 'none') {
    return 'none';
  }
  return 'solid';
}

export function creationFillPaintMode(defaults: DrawingStyleDefaults): CreationPaintMode {
  return creationPaintMode(defaults.fill, defaults.fillGradient);
}

export function creationStrokePaintMode(defaults: DrawingStyleDefaults): CreationPaintMode {
  return creationPaintMode(defaults.stroke, defaults.strokeGradient);
}
