/**
 * Where the effective paint value comes from in the cascade (see SvgManipulationService).
 * Precedence: inline style > stylesheet/class > presentation attribute; inherited when unset.
 */
export type PaintSourceKind =
  | 'inline-style'
  | 'presentation-attr'
  | 'class-or-stylesheet'
  | 'inherited'
  | 'default'
  | 'unknown';

export interface PaintSourceInfo {
  kind: PaintSourceKind;
  /** Class names on the element when `kind` is `class-or-stylesheet`. */
  classNames?: string[];
}

export interface ShapeProperties {
  id: string;
  type: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  /** How the visible fill was resolved (computed + cascade probe). */
  fillSource?: PaintSourceInfo;
  /** How the visible stroke color was resolved. */
  strokeSource?: PaintSourceInfo;
}
