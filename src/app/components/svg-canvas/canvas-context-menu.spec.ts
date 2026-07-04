import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import { UnionRotateCommand } from '../../models/editor-commands';
import {
  prepareCanvasContextMenuSelection,
  type CanvasContextMenuSelectionDeps
} from './canvas-context-menu-selection';
import { computeCanvasContextMenuState } from './canvas-context-menu-state';

function rectProps(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

describe('canvas context menu integration helpers', () => {
  describe('prepareCanvasContextMenuSelection + computeCanvasContextMenuState', () => {
    it('empty hit keeps selection and yields paste-only enablement', () => {
      const deps: CanvasContextMenuSelectionDeps = {
        getSvgInstance: () => null,
        getNearestGroupAncestorId: () => null,
        isGroupAClipMaskCarrier: () => false,
        getShapeProperties: (el) => rectProps(el.id),
        getSelectorSelectionForShape: (el) => [rectProps(el.id)],
        selectShapes: vi.fn(),
        getDrilledIntoGroupId: () => null,
        setDrilledIntoGroupId: vi.fn(),
        getSelectedShapeIds: () => ['kept']
      };

      const selection = prepareCanvasContextMenuSelection(
        { target: document.createElement('svg') } as unknown as MouseEvent,
        deps
      );
      const state = computeCanvasContextMenuState({
        hitShape: selection.hitShape,
        hitOutlineToPathPrimitive: selection.hitOutlineToPathPrimitive,
        selectedShapes: [rectProps('kept')],
        hasClipboardContent: true,
        isSelectorMode: true,
        isElementOrAncestorLocked: () => false,
        getOutlineToPathElement: () => null,
        canMakeClipPathForSelection: () => false,
        canReleaseClipPathForSelection: () => false
      });

      expect(selection.hitShape).toBe(false);
      expect(deps.selectShapes).not.toHaveBeenCalled();
      expect(state.canPaste).toBe(true);
      expect(state.canCopy).toBe(false);
    });
  });

  describe('rotateSelectionByDegrees contract', () => {
    let pushAndExecute: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      pushAndExecute = vi.fn();
    });

    function rotateSelectionByDegrees(
      deltaDeg: number,
      ids: string[],
      svc: {
        getUnionBBox: ReturnType<typeof vi.fn>;
        getSelectionRotationPivot: ReturnType<typeof vi.fn>;
        snapshotSelectionTransforms: ReturnType<typeof vi.fn>;
        isElementOrAncestorLocked: ReturnType<typeof vi.fn>;
      }
    ): void {
      if (ids.length === 0 || ids.some((id) => svc.isElementOrAncestorLocked(id))) return;
      const union = svc.getUnionBBox(ids);
      if (!union) return;
      const pivot = svc.getSelectionRotationPivot(ids) ?? { x: union.x + union.width / 2, y: union.y + union.height / 2 };
      const snap = svc.snapshotSelectionTransforms(ids);
      pushAndExecute(new UnionRotateCommand(svc as never, ids, pivot, deltaDeg, snap));
    }

    it('dispatches UnionRotateCommand with ±90 degrees', () => {
      const svc = {
        getUnionBBox: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
        getSelectionRotationPivot: vi.fn(() => null),
        snapshotSelectionTransforms: vi.fn(() => new Map()),
        isElementOrAncestorLocked: vi.fn(() => false)
      };

      rotateSelectionByDegrees(90, ['s1'], svc);
      expect(pushAndExecute).toHaveBeenCalledTimes(1);
      expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(UnionRotateCommand);
      expect((pushAndExecute.mock.calls[0][0] as UnionRotateCommand).description).toBe('Rotate 90°');

      rotateSelectionByDegrees(-90, ['s1'], svc);
      expect((pushAndExecute.mock.calls[1][0] as UnionRotateCommand).description).toBe('Rotate -90°');
    });
  });
});
