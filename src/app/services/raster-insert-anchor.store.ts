import { Injectable, signal } from '@angular/core';

/** Last pointer position in root SVG user space for raster insert placement (e4s.4). */
@Injectable({ providedIn: 'root' })
export class RasterInsertAnchorStore {
  readonly lastDocPoint = signal<{ x: number; y: number } | null>(null);

  setFromDoc(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.lastDocPoint.set({ x, y });
  }

  clear(): void {
    this.lastDocPoint.set(null);
  }
}
