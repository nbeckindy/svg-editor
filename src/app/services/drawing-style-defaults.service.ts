import { Injectable, computed, signal } from '@angular/core';
import type { DrawingStyleDefaultsWritePort } from '../history/drawing-style-defaults.port';
import {
  BASE_DRAWING_STYLE_DEFAULTS,
  type DrawingStyleDefaults
} from '../models/drawing-style-defaults';

export type { DrawingStyleDefaults };
export { BASE_DRAWING_STYLE_DEFAULTS };

@Injectable({
  providedIn: 'root'
})
export class DrawingStyleDefaultsService implements DrawingStyleDefaultsWritePort {
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
  readonly dominantBaseline = computed(() => this.defaultsState().dominantBaseline);
  readonly letterSpacing = computed(() => this.defaultsState().letterSpacing);
  readonly wordSpacing = computed(() => this.defaultsState().wordSpacing);

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

    const dominantBaseline: DrawingStyleDefaults['dominantBaseline'] =
      next.dominantBaseline === 'middle' ||
      next.dominantBaseline === 'hanging' ||
      next.dominantBaseline === 'text-before-edge' ||
      next.dominantBaseline === 'auto'
        ? next.dominantBaseline
        : fallback.dominantBaseline;

    const letterSpacing =
      typeof next.letterSpacing === 'number' && Number.isFinite(next.letterSpacing)
        ? next.letterSpacing
        : fallback.letterSpacing;

    const wordSpacing =
      typeof next.wordSpacing === 'number' && Number.isFinite(next.wordSpacing)
        ? next.wordSpacing
        : fallback.wordSpacing;

    const fillGradient =
      next.fillGradient === null
        ? null
        : next.fillGradient && typeof next.fillGradient === 'object'
          ? next.fillGradient
          : fallback.fillGradient;

    const strokeGradient =
      next.strokeGradient === null
        ? null
        : next.strokeGradient && typeof next.strokeGradient === 'object'
          ? next.strokeGradient
          : fallback.strokeGradient;

    return {
      fill: typeof next.fill === 'string' && next.fill.trim() ? next.fill : fallback.fill,
      stroke: typeof next.stroke === 'string' && next.stroke.trim() ? next.stroke : fallback.stroke,
      strokeWidth,
      fillGradient,
      strokeGradient,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle,
      textAnchor,
      dominantBaseline,
      letterSpacing,
      wordSpacing
    };
  }
}
