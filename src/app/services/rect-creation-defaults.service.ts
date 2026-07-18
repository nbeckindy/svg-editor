import { Injectable, computed, signal } from '@angular/core';
import type { OrientationPoint } from '../components/orientation-grid/orientation-grid.component';
import { clampRectCornerRadius } from '../utils/rect-creation-geometry';

export interface RectCreationDefaultsSnapshot {
  width: number;
  height: number;
  cornerRadius: number;
  orientation: OrientationPoint;
}

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 100;
const DEFAULT_CORNER = 0;
const DEFAULT_ORIENTATION: OrientationPoint = 'top-left';

/**
 * Session defaults for the rect tool (tool context bar).
 * Not on History — only placed shapes are undoable.
 */
@Injectable({ providedIn: 'root' })
export class RectCreationDefaultsService {
  private readonly widthState = signal(DEFAULT_WIDTH);
  private readonly heightState = signal(DEFAULT_HEIGHT);
  private readonly cornerRadiusState = signal(DEFAULT_CORNER);
  private readonly orientationState = signal<OrientationPoint>(DEFAULT_ORIENTATION);

  readonly width = this.widthState.asReadonly();
  readonly height = this.heightState.asReadonly();
  readonly cornerRadius = this.cornerRadiusState.asReadonly();
  readonly orientation = this.orientationState.asReadonly();

  /** Corner clamped to current W×H. */
  readonly effectiveCornerRadius = computed(() =>
    clampRectCornerRadius(this.widthState(), this.heightState(), this.cornerRadiusState())
  );

  snapshot(): RectCreationDefaultsSnapshot {
    return {
      width: this.widthState(),
      height: this.heightState(),
      cornerRadius: this.effectiveCornerRadius(),
      orientation: this.orientationState()
    };
  }

  setWidth(raw: number): void {
    if (!Number.isFinite(raw) || raw <= 0) return;
    this.widthState.set(raw);
    this.reclampCorner();
  }

  setHeight(raw: number): void {
    if (!Number.isFinite(raw) || raw <= 0) return;
    this.heightState.set(raw);
    this.reclampCorner();
  }

  setCornerRadius(raw: number): void {
    if (!Number.isFinite(raw) || raw < 0) return;
    this.cornerRadiusState.set(
      clampRectCornerRadius(this.widthState(), this.heightState(), raw)
    );
  }

  setOrientation(orientation: OrientationPoint): void {
    this.orientationState.set(orientation);
  }

  private reclampCorner(): void {
    this.cornerRadiusState.set(
      clampRectCornerRadius(this.widthState(), this.heightState(), this.cornerRadiusState())
    );
  }
}
