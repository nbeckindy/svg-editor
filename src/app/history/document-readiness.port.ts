import type { Signal } from '@angular/core';
import type { Svg } from '@svgdotjs/svg.js';
import type { ArtboardModel } from '../models/artboard.model';

/** Narrow seam for UI that only needs to know whether a document is mounted. */
export interface DocumentReadinessPort {
  readonly documentRevision: Signal<number>;
  getSVGInstance(): Svg | null;
}

/** Narrow read-only seam for export logic — SVG instance, artboard, and viewBox. */
export interface SvgExportReadPort {
  getSVGInstance(): Svg | null;
  getDocumentViewBox(): string;
  getDocumentPreserveAspectRatio(): string;
  getArtboard(): ArtboardModel;
}
