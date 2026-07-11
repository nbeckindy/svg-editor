import { Injectable, inject } from '@angular/core';
import { Element as SVGElement } from '@svgdotjs/svg.js';
import {
  RemoveShapesCommand,
  PasteCommand,
  DuplicateCommand
} from '../../models/editor-commands';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { ClipboardService } from '../../services/clipboard.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';

const ALIGN_LEFT_SHORTCUT = 'ArrowLeft';
const ALIGN_RIGHT_SHORTCUT = 'ArrowRight';
const ALIGN_TOP_SHORTCUT = 'ArrowUp';
const ALIGN_CENTER_SHORTCUT = 'ArrowDown';
const ALIGN_MIDDLE_SHORTCUT = 'm';
const ALIGN_BOTTOM_SHORTCUT = 'b';
const DISTRIBUTE_HORIZONTAL_SHORTCUT = 'h';
const DISTRIBUTE_VERTICAL_SHORTCUT = 'v';

/** Host callbacks the canvas adapter supplies for drill-in state. */
export interface CanvasDocumentActionsHost {
  clearDrilledIntoGroupId(): void;
}

/**
 * Keyboard / shortcut document mutations for the canvas adapter — routes align, distribute,
 * group, and ungroup through chrome-apply; clipboard ops use history commands centrally.
 */
@Injectable({ providedIn: 'root' })
export class CanvasDocumentActionsService {
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);
  private readonly clipboard = inject(ClipboardService);
  private readonly chromeEditorApply = inject(ChromeEditorApplyService);

  private duplicateInvocationCount = 0;
  private duplicateSelectionKey = '';

  syncDuplicateCounterForSelection(shapeIds: string[]): void {
    const duplicateKey = [...shapeIds].sort().join('|');
    if (duplicateKey !== this.duplicateSelectionKey) {
      this.duplicateSelectionKey = duplicateKey;
      this.duplicateInvocationCount = 0;
    }
  }

  getExpandedSelectedShapeIds(): string[] {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return [];
    const expanded = this.svgManipulation.expandSelectionByClipGroups(selected);
    const ids = expanded.map((shape) => shape.id);
    return this.svgManipulation.getShapeIdsInDomOrder(ids);
  }

  selectAllShapesFromDocument(): void {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return;
    const items = this.svgManipulation.getLayerStackItems();
    if (items.length === 0) return;
    const shapes: ShapeProperties[] = [];
    for (const item of items) {
      const el = svg.findOne(`#${item.id}`) as SVGElement | undefined;
      if (el) shapes.push(this.svgManipulation.getShapeProperties(el));
    }
    if (shapes.length === 0) return;
    const expanded = this.svgManipulation.expandSelectionByClipGroups(shapes);
    this.shapeSelection.selectShapes(expanded);
    this.svgManipulation.clearHighlight();
  }

  copySelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    return true;
  }

  cutSelectionToClipboard(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    const payload = this.svgManipulation.createClipboardPayload(ids);
    if (payload.shapes.length === 0) return false;
    this.clipboard.set(payload);
    const cmd = new RemoveShapesCommand(this.svgManipulation, ids, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  pasteFromClipboard(): boolean {
    const payload = this.clipboard.get();
    if (!payload || payload.shapes.length === 0) return false;
    const cmd = new PasteCommand(
      this.svgManipulation,
      payload,
      this.clipboard.nextPasteOffset(),
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  duplicateSelection(): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length === 0) return false;
    if (ids.some((id) => this.svgManipulation.isElementOrAncestorLocked(id))) return false;
    this.duplicateInvocationCount += 1;
    const delta = this.duplicateInvocationCount * 10;
    const cmd = new DuplicateCommand(
      this.svgManipulation,
      ids,
      { dx: delta, dy: delta },
      this.shapeSelection
    );
    this.editorHistory.pushAndExecute(cmd);
    this.svgManipulation.clearHighlight();
    return true;
  }

  handleAlignmentShortcut(key: string): boolean {
    const normalized = key.length === 1 ? key.toLowerCase() : key;
    switch (normalized) {
      case ALIGN_LEFT_SHORTCUT:
        return this.alignSelection('left');
      case ALIGN_RIGHT_SHORTCUT:
        return this.alignSelection('right');
      case ALIGN_TOP_SHORTCUT:
        return this.alignSelection('top');
      case ALIGN_CENTER_SHORTCUT:
        return this.alignSelection('center');
      case ALIGN_MIDDLE_SHORTCUT:
        return this.alignSelection('middle');
      case ALIGN_BOTTOM_SHORTCUT:
        return this.alignSelection('bottom');
      case DISTRIBUTE_HORIZONTAL_SHORTCUT:
        return this.distributeSelection('horizontal');
      case DISTRIBUTE_VERTICAL_SHORTCUT:
        return this.distributeSelection('vertical');
      default:
        return false;
    }
  }

  alignSelection(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 2) return false;
    if (ids.some((id) => this.svgManipulation.isElementOrAncestorLocked(id))) return false;
    this.chromeEditorApply.applyAlignFromChrome(direction, ids);
    this.svgManipulation.clearHighlight();
    return true;
  }

  distributeSelection(direction: 'horizontal' | 'vertical'): boolean {
    const ids = this.getExpandedSelectedShapeIds();
    if (ids.length < 3) return false;
    if (ids.some((id) => this.svgManipulation.isElementOrAncestorLocked(id))) return false;
    this.chromeEditorApply.applyDistributeFromChrome(direction, ids);
    this.svgManipulation.clearHighlight();
    return true;
  }

  groupSelectedShapes(host: CanvasDocumentActionsHost): void {
    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length < 2) return;
    const ids = selected.map((s) => s.id);
    if (ids.some((id) => this.svgManipulation.isElementOrAncestorLocked(id))) return;
    this.chromeEditorApply.groupSelectedFromLayersPanel(ids);
    host.clearDrilledIntoGroupId();
  }

  ungroupSelectedShape(host: CanvasDocumentActionsHost): void {
    const selected = this.shapeSelection.getSelectedShapes();
    const groupIds = selected.filter((s) => s.type === 'g').map((s) => s.id);
    if (groupIds.length === 0) return;
    this.chromeEditorApply.ungroupSelectedFromLayersPanel(groupIds);
    host.clearDrilledIntoGroupId();
  }
}
