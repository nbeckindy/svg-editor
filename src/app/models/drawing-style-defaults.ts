export interface DrawingStyleDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
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
  fontFamily: 'Arial, sans-serif',
  fontSize: 16,
  fontWeight: 'normal',
  fontStyle: 'normal',
  textAnchor: 'start'
};
