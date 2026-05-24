import type { Signal } from '@angular/core';

/** Svg slice for `SvgDebugPanelComponent` (revision + serialized document). */
export interface SvgDebugPanelSvgPort {
  readonly documentRevision: Signal<number>;
  exportSVG(): string;
}

/** Svg slice for `AppComponent` (new document + download). */
export interface AppRootSvgManipulationPort {
  clearHighlight(): void;
  exportSVG(): string;
}
