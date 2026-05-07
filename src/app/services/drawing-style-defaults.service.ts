import { Injectable, computed, signal } from '@angular/core';

export interface DrawingStyleDefaults {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

/**
 * Canonical drawing defaults used by creation tools.
 * These values intentionally match today's creation-flow baselines.
 */
export const BASE_DRAWING_STYLE_DEFAULTS: DrawingStyleDefaults = {
  fill: '#000000',
  stroke: '#000000',
  strokeWidth: 2
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

    return {
      fill: typeof next.fill === 'string' && next.fill.trim() ? next.fill : fallback.fill,
      stroke: typeof next.stroke === 'string' && next.stroke.trim() ? next.stroke : fallback.stroke,
      strokeWidth
    };
  }
}
