export interface LayerStackItem {
  id: string;
  type: string;
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface LayerTreeNode {
  id: string;
  type: string;
  name: string;
  children?: LayerTreeNode[];
  visible: boolean;
  /** Direct `data-editor-locked` on this row's element (not inherited). */
  locked: boolean;
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/**
 * DOM order, z-order, grouping, layer-panel naming, and layer tree/stack snapshots.
 */
export interface SvgLayerStructurePort {
  getShapeIdsInDomOrder(shapeIds: string[]): string[];
  getLayerStackItems(): LayerStackItem[];
  getLayerTree(): LayerTreeNode[];
  moveElementForward(elementId: string): boolean;
  moveElementBackward(elementId: string): boolean;
  moveElementToFront(elementId: string): boolean;
  moveElementToBack(elementId: string): boolean;
  /** Undo for layer reorder: restore `elementId` to `oldIndex` among its parent's element children. */
  restoreElementSiblingOrder(elementId: string, oldIndex: number): void;
  toggleLayerVisibility(elementId: string): boolean;
  isElementVisible(elementId: string): boolean;
  isElementDirectLocked(elementId: string): boolean;
  isElementOrAncestorLocked(elementId: string): boolean;
  setLayerLocked(elementId: string, locked: boolean): void;
  /**
   * Move `elementId` within its parent so it sits immediately before `referenceNextSiblingId`
   * in DOM order (`null` = append as last child). Returns false if siblings differ or nodes missing.
   */
  moveElementBeforeNextSibling(elementId: string, referenceNextSiblingId: string | null): boolean;
  groupSelectedElements(elementIds: string[]): string | null;
  ungroupElement(groupId: string): string[];
  ungroupElements(
    groupIds: string[]
  ): { allChildElementIds: string[]; undoSnapshots: string[][] };
  renameElement(elementId: string, newName: string): void;
  getElementName(elementId: string): string;
}
