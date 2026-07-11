import { InjectionToken, inject } from '@angular/core';
import { SvgManipulationService } from './svg-manipulation.service';
import type { AppRootSvgManipulationPort, SvgDebugPanelSvgPort } from '../history/editor-chrome-svg.port';
import type { ChromeEditorApplySvgPort } from '../history/chrome-editor-apply-svg.port';
import type { ClipPathSvgPort } from '../history/clip-path-svg.port';
import type { DocumentSettingsSvgPort } from '../history/document-settings-svg.port';
import type { EditorShapeLifecycleSvgPort } from '../history/editor-shape-lifecycle-svg.port';
import type { GradientFillEditorSvgPort } from '../history/gradient-fill-editor-svg.port';
import type { LayerLockReadPort } from '../history/layer-lock-read.port';
import type { LayerReorderGroupSvgPort, LayersPanelSvgPort } from '../history/layers-panel-svg.port';
import type { PropertiesPanelSvgPort } from '../history/properties-panel-svg.port';
import type { SelectionTransformReadoutSvgPort } from '../history/selection-transform-readout-svg.port';
import type { SelectionTransformApplySvgPort } from '../history/transform-gesture-svg.port';

export const APP_ROOT_SVG_MANIPULATION_PORT = new InjectionToken<AppRootSvgManipulationPort>(
  'AppRootSvgManipulationPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const SVG_DEBUG_PANEL_SVG_PORT = new InjectionToken<SvgDebugPanelSvgPort>(
  'SvgDebugPanelSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const CHROME_EDITOR_APPLY_SVG_PORT = new InjectionToken<ChromeEditorApplySvgPort>(
  'ChromeEditorApplySvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const CLIP_PATH_SVG_PORT = new InjectionToken<ClipPathSvgPort>(
  'ClipPathSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const DOCUMENT_SETTINGS_SVG_PORT = new InjectionToken<DocumentSettingsSvgPort>(
  'DocumentSettingsSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const EDITOR_SHAPE_LIFECYCLE_SVG_PORT = new InjectionToken<EditorShapeLifecycleSvgPort>(
  'EditorShapeLifecycleSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const GRADIENT_FILL_EDITOR_SVG_PORT = new InjectionToken<GradientFillEditorSvgPort>(
  'GradientFillEditorSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const LAYER_LOCK_READ_PORT = new InjectionToken<LayerLockReadPort>(
  'LayerLockReadPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const LAYER_REORDER_GROUP_SVG_PORT = new InjectionToken<LayerReorderGroupSvgPort>(
  'LayerReorderGroupSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const LAYERS_PANEL_SVG_PORT = new InjectionToken<LayersPanelSvgPort>(
  'LayersPanelSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const PROPERTIES_PANEL_SVG_PORT = new InjectionToken<PropertiesPanelSvgPort>(
  'PropertiesPanelSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const SELECTION_TRANSFORM_READOUT_SVG_PORT = new InjectionToken<SelectionTransformReadoutSvgPort>(
  'SelectionTransformReadoutSvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);

export const SELECTION_TRANSFORM_APPLY_SVG_PORT = new InjectionToken<SelectionTransformApplySvgPort>(
  'SelectionTransformApplySvgPort',
  { providedIn: 'root', factory: () => inject(SvgManipulationService) }
);
