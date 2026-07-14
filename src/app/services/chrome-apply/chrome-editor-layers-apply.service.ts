import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import {
  ReorderCommand,
  buildReorderToExtremeCommand,
  ToggleVisibilityCommand,
  ToggleLayerLockCommand,
  RenameElementCommand,
  ReorderBeforeSiblingCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand,
  ReparentElementsCommand,
  MakeClipPathCommand,
  ReleaseClipPathCommand,
  type ReparentElementsMode
} from '../../models/editor-commands';
import type { LayerRowKind } from '../svg-layer-structure.port';
import { ChromeEditorApplySupport } from './chrome-editor-apply-support.service';
import { GroupStructureChangeService } from './group-structure-change.service';
import {
  CHROME_EDITOR_APPLY_SVG_PORT,
  CLIP_PATH_SVG_PORT,
  LAYER_REORDER_GROUP_SVG_PORT,
  PROPERTIES_PANEL_SVG_PORT
} from './chrome-apply.tokens';

@Injectable({ providedIn: 'root' })
export class ChromeEditorLayersApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly layerSvg = inject(LAYER_REORDER_GROUP_SVG_PORT);
  private readonly clipPathSvg = inject(CLIP_PATH_SVG_PORT);
  private readonly paintSvg = inject(CHROME_EDITOR_APPLY_SVG_PORT);
  private readonly propertiesSvg = inject(PROPERTIES_PANEL_SVG_PORT);
  private readonly groupStructureChange = inject(GroupStructureChangeService);

  private get shapeSelection() { return this.support.shapeSelection; }
  private get editorHistory() { return this.support.editorHistory; }
  private shapeIdsTouchLocked(ids: string[]) { return this.support.shapeIdsTouchLocked(ids); }

  toggleLayerVisibility(layerId: string): void {
    this.editorHistory.pushAndExecute(new ToggleVisibilityCommand(this.layerSvg, layerId));
  }

  toggleLayerLock(layerId: string): void {
    this.editorHistory.pushAndExecute(new ToggleLayerLockCommand(this.layerSvg, layerId));
  }

  renameLayer(layerId: string, kind: LayerRowKind, newName: string): void {
    const trimmed = newName.trim();
    const newDataName = trimmed.length > 0 ? trimmed : null;
    const oldDataName = this.layerSvg.getElementDataName(layerId);
    if (newDataName === oldDataName) return;
    if (
      oldDataName === null &&
      newDataName === this.layerSvg.resolveLayerDisplayName(layerId, kind)
    ) {
      return;
    }
    this.editorHistory.pushAndExecute(
      new RenameElementCommand(this.layerSvg, layerId, oldDataName, newDataName)
    );
  }

  moveLayerBeforeSibling(draggedLayerId: string, referenceNextSiblingId: string | null): void {
    this.editorHistory.pushAndExecute(
      new ReorderBeforeSiblingCommand(this.layerSvg, draggedLayerId, referenceNextSiblingId)
    );
  }

  moveLayerForward(layerId: string): void {
    this.editorHistory.pushAndExecute(new ReorderCommand(this.layerSvg, layerId, 'forward'));
  }

  moveLayerBackward(layerId: string): void {
    this.editorHistory.pushAndExecute(new ReorderCommand(this.layerSvg, layerId, 'backward'));
  }

  moveLayerToFront(layerId: string): void {
    const cmd = buildReorderToExtremeCommand(this.layerSvg, [layerId], 'front');
    if (cmd) this.editorHistory.pushAndExecute(cmd);
  }

  moveLayerToBack(layerId: string): void {
    const cmd = buildReorderToExtremeCommand(this.layerSvg, [layerId], 'back');
    if (cmd) this.editorHistory.pushAndExecute(cmd);
  }

  groupSelectedFromLayersPanel(selectedShapeIds: string[]): void {
    if (selectedShapeIds.length < 2) return;
    if (this.shapeIdsTouchLocked(selectedShapeIds)) return;
    const cmd = new GroupCommand(this.layerSvg, selectedShapeIds);
    this.editorHistory.pushAndExecute(cmd);
    const newGroupId = cmd.createdGroupId;
    if (newGroupId) {
      const svg = this.paintSvg.getSVGInstance();
      const groupEl = svg?.findOne(`#${newGroupId}`) as SvgJsElement | undefined;
      if (groupEl) {
        this.shapeSelection.selectShapes([this.propertiesSvg.getShapeProperties(groupEl)]);
      }
    }
    this.groupStructureChange.notifyGroupStructureChange({ movedElementIds: selectedShapeIds, targetGroupId: newGroupId });
  }

  ungroupSelectedFromLayersPanel(groupIds: string[]): void {
    if (groupIds.length === 0) return;
    if (groupIds.some((id) => this.layerSvg.isElementOrAncestorLocked(id))) return;
    const svg = this.paintSvg.getSVGInstance();
    if (!svg) return;

    const selectFreedChildren = (childIds: string[]): void => {
      const shapes = childIds
        .map((id) => svg.findOne(`#${id}`) as SvgJsElement | null)
        .filter((el): el is SvgJsElement => el != null)
        .map((el) => this.propertiesSvg.getShapeProperties(el));
      if (shapes.length > 0) {
        this.shapeSelection.selectShapes(shapes);
      } else {
        this.shapeSelection.clearSelection();
      }
    };

    if (groupIds.length === 1) {
      const groupId = groupIds[0];
      const childIds: string[] = [];
      const groupNode = svg.findOne(`#${groupId}`)?.node;
      if (groupNode) {
        for (const child of Array.from(groupNode.children)) {
          if (child.id) childIds.push(child.id);
        }
      }
      this.editorHistory.pushAndExecute(new UngroupCommand(this.layerSvg, groupId));
      selectFreedChildren(childIds);
    } else {
      const multi = new UngroupElementsCommand(this.layerSvg, groupIds);
      this.editorHistory.pushAndExecute(multi);
      selectFreedChildren(multi.ungroupedChildIds);
    }
    this.groupStructureChange.notifyGroupStructureChange({ movedElementIds: groupIds, targetGroupId: null });
  }

  addSelectionToGroupFromLayersPanel(
    elementIds: string[],
    targetGroupId: string,
    referenceNextSiblingId: string | null = null
  ): void {
    const ids = elementIds.filter((id) => id !== targetGroupId);
    if (ids.length === 0) return;
    if (this.shapeIdsTouchLocked([...ids, targetGroupId])) return;
    if (!this.layerSvg.isUserGroupId(targetGroupId) || this.layerSvg.isGroupClipMaskCarrier(targetGroupId)) {
      return;
    }

    const cmd = new ReparentElementsCommand(this.layerSvg, ids, {
      kind: 'addToGroup',
      targetGroupId,
      referenceNextSiblingId
    });
    this.editorHistory.pushAndExecute(cmd);
    this.selectReparentedElements(cmd.reparentedElementIds);
    this.groupStructureChange.notifyGroupStructureChange({
      movedElementIds: cmd.reparentedElementIds,
      targetGroupId
    });
  }

  removeSelectionFromGroupFromLayersPanel(elementIds: string[]): void {
    if (elementIds.length === 0) return;
    if (this.shapeIdsTouchLocked(elementIds)) return;

    const cmd = new ReparentElementsCommand(this.layerSvg, elementIds, { kind: 'removeFromGroup' });
    this.editorHistory.pushAndExecute(cmd);
    this.selectReparentedElements(cmd.reparentedElementIds);
    this.groupStructureChange.notifyGroupStructureChange({
      movedElementIds: cmd.reparentedElementIds,
      targetGroupId: null
    });
  }

  reparentLayersFromPanel(
    elementIds: string[],
    mode: ReparentElementsMode
  ): void {
    if (elementIds.length === 0) return;
    if (this.shapeIdsTouchLocked(elementIds)) return;
    if (mode.kind === 'addToGroup' && this.shapeIdsTouchLocked([mode.targetGroupId])) return;
    if (
      mode.kind === 'reparentToParent' &&
      mode.targetParentId &&
      this.shapeIdsTouchLocked([mode.targetParentId])
    ) {
      return;
    }

    const cmd = new ReparentElementsCommand(this.layerSvg, elementIds, mode);
    this.editorHistory.pushAndExecute(cmd);
    this.selectReparentedElements(cmd.reparentedElementIds);
    const targetGroupId =
      mode.kind === 'addToGroup'
        ? mode.targetGroupId
        : mode.kind === 'reparentToParent'
          ? mode.targetParentId
          : null;
    this.groupStructureChange.notifyGroupStructureChange({
      movedElementIds: cmd.reparentedElementIds,
      targetGroupId
    });
  }

  /** Undoable layer drag reparent (into/out of groups or cross-parent insert). */
  reparentLayerDrag(
    elementIds: string[],
    mode: ReparentElementsMode
  ): void {
    this.reparentLayersFromPanel(elementIds, mode);
  }

  /**
   * Undoable make-clip from content + clip-shape ids (clip shape is the mask geometry).
   * Caller resolves which selected id is the topmost clip shape.
   */
  makeClipPathFromSelection(contentIds: string[], clipShapeId: string): void {
    const allIds = [...contentIds, clipShapeId];
    if (contentIds.length === 0 || !clipShapeId) return;
    if (this.shapeIdsTouchLocked(allIds)) return;
    if (!this.clipPathSvg.canMakeClipPath(allIds)) return;

    const cmd = new MakeClipPathCommand(this.clipPathSvg, contentIds, clipShapeId);
    this.editorHistory.pushAndExecute(cmd);

    const svg = this.paintSvg.getSVGInstance();
    const clipGeomId = cmd.createdClipGeometryId;
    if (clipGeomId && svg) {
      const geomEl = svg.findOne(`#${clipGeomId}`) as SvgJsElement | undefined;
      if (geomEl) {
        this.shapeSelection.selectShapes([this.propertiesSvg.getShapeProperties(geomEl)]);
      }
    }
  }

  /** Undoable release for selected carriers / clipped content (canvas context menu + layers). */
  releaseClipPathFromSelection(shapeIds: string[]): void {
    if (shapeIds.length === 0) return;
    if (this.shapeIdsTouchLocked(shapeIds)) return;
    if (!this.clipPathSvg.canReleaseClipPath(shapeIds)) return;

    const cmd = new ReleaseClipPathCommand(this.clipPathSvg, shapeIds);
    this.editorHistory.pushAndExecute(cmd);

    const svg = this.paintSvg.getSVGInstance();
    const releasedShapes: ShapeProperties[] = [];
    for (const id of cmd.releasedChildIds) {
      const el = svg?.findOne(`#${id}`) as SvgJsElement | null;
      if (el) releasedShapes.push(this.propertiesSvg.getShapeProperties(el));
    }
    if (cmd.restoredClipShapeId) {
      const clipEl = svg?.findOne(`#${cmd.restoredClipShapeId}`) as SvgJsElement | null;
      if (clipEl) releasedShapes.push(this.propertiesSvg.getShapeProperties(clipEl));
    }
    if (releasedShapes.length > 0) {
      this.shapeSelection.selectShapes(releasedShapes);
    } else {
      this.shapeSelection.clearSelection();
    }
  }

  releaseClipPathFromLayersPanel(carrierGroupId: string): void {
    this.releaseClipPathFromSelection([carrierGroupId]);
  }

  private selectReparentedElements(elementIds: string[]): void {
    const svg = this.paintSvg.getSVGInstance();
    if (!svg || elementIds.length === 0) return;
    const shapes = elementIds
      .map((id) => svg.findOne(`#${id}`) as SvgJsElement | null)
      .filter((el): el is SvgJsElement => el != null)
      .map((el) => this.propertiesSvg.getShapeProperties(el));
    if (shapes.length > 0) {
      this.shapeSelection.selectShapes(shapes);
    }
  }
}
