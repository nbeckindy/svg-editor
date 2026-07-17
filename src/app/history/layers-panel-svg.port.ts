import type { Signal } from '@angular/core';
import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import type { LayerRowKind, LayerTreeNode, ElementParentSnapshot } from '../services/svg-layer-structure.port';

/**
 * Svg slice for layer reorder / visibility / group commands (`ReorderCommand`,
 * `ToggleVisibilityCommand`, `ToggleLayerLockCommand`, `GroupCommand`, `UngroupCommand`, `UngroupElementsCommand`,
 * `ReorderBeforeSiblingCommand`).
 */
export interface LayerReorderGroupSvgPort {
  getSVGInstance(): Svg | null;
  moveElementForward(elementId: string): boolean;
  moveElementBackward(elementId: string): boolean;
  moveElementToFront(elementId: string): boolean;
  moveElementToBack(elementId: string): boolean;
  toggleLayerVisibility(elementId: string): boolean;
  isElementVisible(elementId: string): boolean;
  isElementDirectLocked(elementId: string): boolean;
  isElementOrAncestorLocked(elementId: string): boolean;
  setLayerLocked(elementId: string, locked: boolean): void;
  moveElementBeforeNextSibling(elementId: string, referenceNextSiblingId: string | null): boolean;
  groupSelectedElements(elementIds: string[]): string | null;
  ungroupElement(groupId: string): string[];
  ungroupElements(
    groupIds: string[]
  ): { allChildElementIds: string[]; undoSnapshots: string[][] };
  addElementsToGroup(
    elementIds: string[],
    targetGroupId: string,
    referenceNextSiblingId?: string | null
  ): string[] | null;
  removeElementsFromGroup(elementIds: string[]): string[] | null;
  reparentElementsToParent(
    elementIds: string[],
    targetParentId: string | null,
    referenceNextSiblingId: string | null
  ): string[] | null;
  snapshotElementParentOrder(elementIds: string[]): ElementParentSnapshot[];
  restoreElementParentOrder(
    elementId: string,
    formerParentId: string | null,
    oldIndex: number
  ): void;
  isUserGroupId(groupId: string): boolean;
  isGroupClipMaskCarrier(groupId: string): boolean;
  /** Undo for {@link ReorderCommand}: move `elementId` back to `oldIndex` among its parent's element children. */
  restoreElementSiblingOrder(elementId: string, oldIndex: number): void;
  getElementDataName(elementId: string): string | null;
  setElementDataName(elementId: string, value: string | null): void;
  resolveLayerDisplayName(elementId: string, kind: LayerRowKind): string;
  /**
   * Rename an element's `id` attribute. Returns false when the element is missing,
   * `newId` is invalid/unchanged, or another element already owns `newId`.
   */
  changeElementId(oldId: string, newId: string): boolean;
}

/** Svg seam for `ChangeElementIdCommand` (DOM id + selection resync). */
export interface ChangeElementIdSvgPort {
  changeElementId(oldId: string, newId: string): boolean;
  getSVGInstance(): Svg | null;
  getShapeProperties(element: SvgJsElement): ShapeProperties;
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
  canReleaseClipPath(shapeIds: string[]): boolean;
}
