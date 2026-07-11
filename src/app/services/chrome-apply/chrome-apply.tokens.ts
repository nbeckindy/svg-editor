import { InjectionToken } from '@angular/core';
import type { ChromeEditorApplySvgPort } from '../../history/chrome-editor-apply-svg.port';
import type { ClipPathSvgPort } from '../../history/clip-path-svg.port';
import type { EditorShapeLifecycleSvgPort } from '../../history/editor-shape-lifecycle-svg.port';
import type { LayerReorderGroupSvgPort } from '../../history/layers-panel-svg.port';
import type { PropertiesPanelSvgPort } from '../../history/properties-panel-svg.port';
import type { SelectionTransformApplySvgPort } from '../../history/transform-gesture-svg.port';

/** Svg seam for chrome paint apply and selection sync from the Live tree. */
export const CHROME_EDITOR_APPLY_SVG_PORT = new InjectionToken<ChromeEditorApplySvgPort>(
  'CHROME_EDITOR_APPLY_SVG_PORT'
);

/** Svg seam for properties-panel typography, bake, and align/distribute commands. */
export const PROPERTIES_PANEL_SVG_PORT = new InjectionToken<PropertiesPanelSvgPort>(
  'PROPERTIES_PANEL_SVG_PORT'
);

/** Svg seam for layer reorder, group/ungroup, and lock reads from chrome apply. */
export const LAYER_REORDER_GROUP_SVG_PORT = new InjectionToken<LayerReorderGroupSvgPort>(
  'LAYER_REORDER_GROUP_SVG_PORT'
);

/** Svg seam for properties-panel union bbox transform commits. */
export const SELECTION_TRANSFORM_APPLY_SVG_PORT = new InjectionToken<SelectionTransformApplySvgPort>(
  'SELECTION_TRANSFORM_APPLY_SVG_PORT'
);

/** Svg seam for path boolean / compound shape lifecycle from chrome apply. */
export const EDITOR_SHAPE_LIFECYCLE_SVG_PORT = new InjectionToken<EditorShapeLifecycleSvgPort>(
  'EDITOR_SHAPE_LIFECYCLE_SVG_PORT'
);

/** Svg seam for clip-path make/release from chrome apply. */
export const CLIP_PATH_SVG_PORT = new InjectionToken<ClipPathSvgPort>('CLIP_PATH_SVG_PORT');
