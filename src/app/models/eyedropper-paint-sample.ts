import type { EditableGradientModel } from './svg-gradient';

/** Solid / none / gradient paint for one fill or stroke channel. */
export type EyedropperPaintKind = 'none' | 'solid' | 'gradient';

export interface EyedropperPaintChannel {
  kind: EyedropperPaintKind;
  /** Solid hex when `kind === 'solid'`; seed color when `kind === 'gradient'`. */
  solid?: string;
  /** Gradient template when `kind === 'gradient'` (id rewritten per target on apply). */
  gradient?: EditableGradientModel;
}

/**
 * Full paint style sampled by the eyedropper from a document shape.
 * `null` fill/stroke means that paint channel was not transferable (e.g. pattern).
 */
export interface EyedropperPaintSample {
  fill: EyedropperPaintChannel | null;
  fillOpacity: number;
  stroke: EyedropperPaintChannel | null;
  strokeWidth: number;
  strokeOpacity: number;
  /** SVG `stroke-dasharray` (empty string = no dash). */
  strokeDasharray: string;
  strokeDashoffset: number;
}
