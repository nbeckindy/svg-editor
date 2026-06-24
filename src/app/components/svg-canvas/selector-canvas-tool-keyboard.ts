import { RemoveShapesCommand, buildReorderToExtremeCommand } from '../../models/editor-commands';
import type { SvgManipulationService } from '../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../services/shape-selection.service';
import type { EditorHistoryService } from '../../services/editor-history.service';

/** Selector-tool keyboard actions implemented by the canvas adapter. */
export interface SelectorKeyboardActionsPort {
  getSvgContent(): string | null | undefined;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  selectAllShapesFromDocument(): void;
  copySelectionToClipboard(): boolean;
  cutSelectionToClipboard(): boolean;
  pasteFromClipboard(): boolean;
  duplicateSelection(): boolean;
  groupSelectedShapes(): void;
  ungroupSelectedShape(): void;
  handleAlignmentShortcut(key: string): boolean;
}

/** Returns true when the key was consumed by selector shortcuts. */
export function tryHandleSelectorKeyDown(
  actions: SelectorKeyboardActionsPort,
  event: KeyboardEvent
): boolean {
  if (!actions.getSvgContent()) return false;

  const mod = event.ctrlKey || event.metaKey;

  if (mod && (event.key === 'a' || event.key === 'A')) {
    actions.selectAllShapesFromDocument();
    return true;
  }

  if (mod && (event.key === 'c' || event.key === 'C')) {
    actions.copySelectionToClipboard();
    return true;
  }

  if (mod && (event.key === 'x' || event.key === 'X')) {
    return actions.cutSelectionToClipboard();
  }

  if (mod && (event.key === 'v' || event.key === 'V')) {
    return actions.pasteFromClipboard();
  }

  if (mod && (event.key === 'd' || event.key === 'D')) {
    return actions.duplicateSelection();
  }

  if (mod && event.shiftKey && actions.handleAlignmentShortcut(event.key)) {
    return true;
  }

  if (mod && (event.key === 'g' || event.key === 'G') && !event.shiftKey) {
    actions.groupSelectedShapes();
    return true;
  }

  if (mod && (event.key === 'g' || event.key === 'G') && event.shiftKey) {
    actions.ungroupSelectedShape();
    return true;
  }

  if (!mod && (event.key === ']' || event.key === '[')) {
    const direction = event.key === ']' ? 'front' : 'back';
    const ids = actions.shapeSelection.getSelectedShapes().map((s) => s.id);
    const cmd = buildReorderToExtremeCommand(actions.svgManipulation, ids, direction);
    if (cmd) {
      actions.editorHistory.pushAndExecute(cmd);
      return true;
    }
    return false;
  }

  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    actions.shapeSelection.getSelectedShapes().length > 0
  ) {
    const ids = actions.shapeSelection.getSelectedShapes().map((s) => s.id);
    if (ids.some((id) => actions.svgManipulation.isElementOrAncestorLocked(id))) {
      return false;
    }
    const cmd = new RemoveShapesCommand(actions.svgManipulation, ids, actions.shapeSelection);
    actions.editorHistory.pushAndExecute(cmd);
    actions.svgManipulation.clearHighlight();
    return true;
  }

  return false;
}
