import type { Signal } from '@angular/core';
import type { Svg } from '@svgdotjs/svg.js';

/** Narrow seam for UI that only needs to know whether a document is mounted. */
export interface DocumentReadinessPort {
  readonly documentRevision: Signal<number>;
  getSVGInstance(): Svg | null;
}
