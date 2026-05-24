import type { Signal } from '@angular/core';
import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { LayerTreeNode } from '../services/svg-layer-structure.port';

/**
 * Svg slice for layer reorder / visibility / group commands (`ReorderCommand`,
 * `ToggleVisibilityCommand`, `GroupCommand`, `UngroupCommand`, `UngroupElementsCommand`).
 */
export interface LayerReorderGroupSvgPort {
  getSVGInstance(): Svg | null;
  moveElementForward(elementId: string): boolean;
  moveElementBackward(elementId: string): boolean;
  moveElementToFront(elementId: string): boolean;
  moveElementToBack(elementId: string): boolean;
  toggleLayerVisibility(elementId: string): boolean;
  groupSelectedElements(elementIds: string[]): string | null;
  ungroupElement(groupId: string): string[];
  ungroupElements(
    groupIds: string[]
  ): { allChildElementIds: string[]; undoSnapshots: string[][] };
}

/**
 * Svg seam for `LayersPanelComponent`: layer tree + revision, selection helpers, and
 * {@link LayerReorderGroupSvgPort} for history commands.
 */
export interface LayersPanelSvgPort extends LayerReorderGroupSvgPort {
  readonly documentRevision: Signal<number>;
  getLayerTree(): LayerTreeNode[];
  getShapeProperties(element: SvgJsElement): ShapeProperties;
  getShapePropertiesInSameClipGroup(shape: SvgJsElement): ShapeProperties[];
}
