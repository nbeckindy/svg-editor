/** Layer-panel row semantics — groups, clip/mask carriers, and leaf shapes differ in UI affordances. */
export type LayerRowKind = 'shape' | 'group' | 'clipMask' | 'mask';

export function isLayerBranchKind(kind: LayerRowKind): boolean {
  return kind === 'group' || kind === 'clipMask' || kind === 'mask';
}

export interface LayerStackItem {
  id: string;
  type: string;
  elementMarkup: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

/** Parent location of an element before a reparent operation (for undo). */
export interface ElementParentSnapshot {
  elementId: string;
  /** `null` when the former parent is the editor content root. */
  formerParentId: string | null;
  formerIndex: number;
}

export interface LayerTreeNode {
  id: string;
  /** Short label in the layer row type column (e.g. `rect`, `clip`). */
  type: string;
  kind: LayerRowKind;
  name: string;
  children?: LayerTreeNode[];
  visible: boolean;
  /** Direct `data-editor-locked` on this row's element (not inherited). */
  locked: boolean;
  elementMarkup: string;
  /** When set, used for the layer-row thumbnail instead of {@link elementMarkup}. */
  previewMarkup?: string;
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
  /** Move elements into an existing user `<g>`, preserving DOM order. Returns moved ids or `null`. */
  addElementsToGroup(
    elementIds: string[],
    targetGroupId: string,
    referenceNextSiblingId?: string | null
  ): string[] | null;
  /** Hoist each element one level out of its immediate user-group parent. Returns moved ids or `null`. */
  removeElementsFromGroup(elementIds: string[]): string[] | null;
  /** Reparent elements under `targetParentId` (`null` = content root) before optional sibling ref. */
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
  renameElement(elementId: string, newName: string): void;
  getElementName(elementId: string): string;
}
