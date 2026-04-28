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

/** What kind of paint value a fill or stroke resolves to. */
export type PaintType = 'solid' | 'gradient' | 'pattern' | 'none';

export interface ShapeProperties {
  id: string;
  type: string;
  textContent?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAnchor?: 'start' | 'middle' | 'end';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** SVG `stroke-dasharray` value (e.g. `"5,3"` or `"none"`). Undefined when no dash is set. */
  strokeDasharray?: string;
  /** SVG `stroke-dashoffset` value. Defaults to 0 when unset. */
  strokeDashoffset?: number;
  opacity?: number;
  /** What kind of paint the fill resolves to (solid hex, gradient url, pattern url, or none). */
  fillPaintType?: PaintType;
  /** Raw fill value when it is a `url(#...)` reference (gradient or pattern). */
  fillUrl?: string;
  /** What kind of paint the stroke resolves to. */
  strokePaintType?: PaintType;
  /** Raw stroke value when it is a `url(#...)` reference. */
  strokeUrl?: string;
  /** How the visible fill was resolved (computed + cascade probe). */
  fillSource?: PaintSourceInfo;
  /** How the visible stroke color was resolved. */
  strokeSource?: PaintSourceInfo;
}
