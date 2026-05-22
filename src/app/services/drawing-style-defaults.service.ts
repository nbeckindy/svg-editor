import { Injectable, computed, signal } from '@angular/core';

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

@Injectable({
  providedIn: 'root'
})
export class DrawingStyleDefaultsService {
  private readonly defaultsState = signal<DrawingStyleDefaults>(BASE_DRAWING_STYLE_DEFAULTS);

  readonly defaults = computed(() => this.defaultsState());
  readonly fill = computed(() => this.defaultsState().fill);
  readonly stroke = computed(() => this.defaultsState().stroke);
  readonly strokeWidth = computed(() => this.defaultsState().strokeWidth);
  readonly fontFamily = computed(() => this.defaultsState().fontFamily);
  readonly fontSize = computed(() => this.defaultsState().fontSize);
  readonly fontWeight = computed(() => this.defaultsState().fontWeight);
  readonly fontStyle = computed(() => this.defaultsState().fontStyle);
  readonly textAnchor = computed(() => this.defaultsState().textAnchor);

  setDefaults(next: DrawingStyleDefaults): void {
    this.defaultsState.set(this.normalize(next, this.defaultsState()));
  }

  updateDefaults(partial: Partial<DrawingStyleDefaults>): void {
    const current = this.defaultsState();
    this.defaultsState.set(this.normalize({ ...current, ...partial }, current));
  }

  resetDefaults(): void {
    this.defaultsState.set(BASE_DRAWING_STYLE_DEFAULTS);
  }

  private normalize(
    next: DrawingStyleDefaults,
    fallback: DrawingStyleDefaults
  ): DrawingStyleDefaults {
    const strokeWidth =
      typeof next.strokeWidth === 'number' && Number.isFinite(next.strokeWidth) && next.strokeWidth >= 0
        ? next.strokeWidth
        : fallback.strokeWidth;

    const fontSize =
      typeof next.fontSize === 'number' && Number.isFinite(next.fontSize) && next.fontSize > 0
        ? next.fontSize
        : fallback.fontSize;

    const fontFamily =
      typeof next.fontFamily === 'string' && next.fontFamily.trim()
        ? next.fontFamily.trim()
        : fallback.fontFamily;

    const fontWeight =
      typeof next.fontWeight === 'string' && next.fontWeight.trim()
        ? next.fontWeight.trim()
        : fallback.fontWeight;

    const fontStyle: 'normal' | 'italic' =
      next.fontStyle === 'italic' || next.fontStyle === 'normal' ? next.fontStyle : fallback.fontStyle;

    const textAnchor: 'start' | 'middle' | 'end' =
      next.textAnchor === 'middle' || next.textAnchor === 'end' || next.textAnchor === 'start'
        ? next.textAnchor
        : fallback.textAnchor;

    return {
      fill: typeof next.fill === 'string' && next.fill.trim() ? next.fill : fallback.fill,
      stroke: typeof next.stroke === 'string' && next.stroke.trim() ? next.stroke : fallback.stroke,
      strokeWidth,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      textAnchor
    };
  }
}
