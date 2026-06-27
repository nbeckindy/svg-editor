import type { ShapeProperties } from '../../models/shape-properties.interface';

export interface CanvasContextMenuSuppressInput {
  hasSvgContent: boolean;
  penSessionActive: boolean;
  penInsertDragActive: boolean;
  gestureActive: boolean;
}

export function shouldSuppressCanvasContextMenu(input: CanvasContextMenuSuppressInput): boolean {
  if (!input.hasSvgContent) return true;
  if (input.penSessionActive || input.penInsertDragActive) return true;
  if (input.gestureActive) return true;
  return false;
}

export interface CanvasContextMenuStateInput {
  hitShape: boolean;
  selectedShapes: ShapeProperties[];
  hasClipboardContent: boolean;
  isElementOrAncestorLocked(id: string): boolean;
}

export interface CanvasContextMenuState {
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  canGroup: boolean;
  canUngroup: boolean;
  canRotate: boolean;
}

export function computeCanvasContextMenuState(input: CanvasContextMenuStateInput): CanvasContextMenuState {
  const { hitShape, selectedShapes, hasClipboardContent, isElementOrAncestorLocked } = input;
  const count = selectedShapes.length;
  const anyLocked = selectedShapes.some((s) => isElementOrAncestorLocked(s.id));
  const hasSelection = count > 0;
  const shapeActionsAllowed = hitShape && hasSelection;

  const canUngroup =
    shapeActionsAllowed &&
    !anyLocked &&
    selectedShapes.length > 0 &&
    selectedShapes.every((s) => s.type === 'g');

  return {
    canCut: shapeActionsAllowed && !anyLocked,
    canCopy: shapeActionsAllowed,
    canPaste: hasClipboardContent,
    canDelete: shapeActionsAllowed && !anyLocked,
    canGroup: shapeActionsAllowed && count >= 2 && !anyLocked,
    canUngroup,
    canRotate: shapeActionsAllowed && !anyLocked
  };
}
