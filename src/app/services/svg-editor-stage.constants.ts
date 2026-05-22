/** Class name for the editor content group (shapes live here). */
export const EDITOR_CONTENT_GROUP_ID = 'data-editor-content-group';
export const CONTENT_SHAPE_SELECTOR =
  'circle, rect, path, polygon, ellipse, line, polyline, text, image, use';
/** Attribute to mark the viewBox rect (white fill, thin black stroke). */
export const EDITOR_VIEWBOX_RECT_ATTR = 'data-editor-viewbox-rect';
/** Attribute to mark the light grey "outside" viewBox rect. */
export const EDITOR_OUTSIDE_RECT_ATTR = 'data-editor-outside-rect';
/** 25% black fill for area outside document viewBox. */
export const OUTSIDE_VIEWBOX_FILL = '#bfbfbf';

/** Tags skipped when building the layer tree (non-content structural elements). */
export const LAYER_TREE_SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'style', 'title', 'desc']);

export const SVG_NS = 'http://www.w3.org/2000/svg';
