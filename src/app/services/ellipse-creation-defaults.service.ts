import { Injectable, signal } from '@angular/core';
import type { OrientationPoint } from '../components/orientation-grid/orientation-grid.component';

export interface EllipseCreationDefaultsSnapshot {
  width: number;
  height: number;
  orientation: OrientationPoint;
}

const DEFAULT_WIDTH = 100;
const DEFAULT_HEIGHT = 100;
const DEFAULT_ORIENTATION: OrientationPoint = 'top-left';

/**
 * Session defaults for the ellipse tool (tool context bar).
 * Not on History — only placed shapes are undoable.
 * W×H are the bounding-box size (rx = W/2, ry = H/2).
 */
@Injectable({ providedIn: 'root' })
export class EllipseCreationDefaultsService {
  private readonly widthState = signal(DEFAULT_WIDTH);
  private readonly heightState = signal(DEFAULT_HEIGHT);
  private readonly orientationState = signal<OrientationPoint>(DEFAULT_ORIENTATION);

  readonly width = this.widthState.asReadonly();
  readonly height = this.heightState.asReadonly();
  readonly orientation = this.orientationState.asReadonly();

  snapshot(): EllipseCreationDefaultsSnapshot {
    return {
      width: this.widthState(),
      height: this.heightState(),
      orientation: this.orientationState()
    };
  }

  setWidth(raw: number): void {
    if (!Number.isFinite(raw) || raw <= 0) return;
    this.widthState.set(raw);
  }

  setHeight(raw: number): void {
    if (!Number.isFinite(raw) || raw <= 0) return;
    this.heightState.set(raw);
  }

  setOrientation(orientation: OrientationPoint): void {
    this.orientationState.set(orientation);
  }
}
