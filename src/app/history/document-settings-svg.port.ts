import type { Signal } from '@angular/core';
import type { ArtboardModel, ArtboardResizeAnchor } from '../models/artboard.model';

/** Svg slice for `ArtboardSizeCommand` / `ArtboardBackgroundCommand`. */
export interface DocumentArtboardCommandSvgPort {
  setArtboardSize(width: number, height: number, explicitOrigin?: { minX: number; minY: number }): void;
  setBackgroundColor(color: string): void;
}

/**
 * Svg seam for `DocumentSettingsComponent`: reactive artboard + resize anchor and artboard
 * commands.
 */
export interface DocumentSettingsSvgPort extends DocumentArtboardCommandSvgPort {
  readonly artboard: Signal<ArtboardModel>;
  readonly artboardResizeAnchor: Signal<ArtboardResizeAnchor>;
  setArtboardResizeAnchor(anchor: ArtboardResizeAnchor): void;
}
