import type { Signal } from '@angular/core';
import type { SvgExportImagePolicyResult } from '../utils/svg-export-image-href-policy';

/** Svg slice for `SvgDebugPanelComponent` (revision + serialized document). */
export interface SvgDebugPanelSvgPort {
  readonly documentRevision: Signal<number>;
  exportSVG(): string;
}

/** Svg slice for `AppComponent` (new document + download). */
export interface AppRootSvgManipulationPort {
  clearHighlight(): void;
  exportSVG(): string;
  getSvgExportImagePolicyResult(): SvgExportImagePolicyResult;
}
