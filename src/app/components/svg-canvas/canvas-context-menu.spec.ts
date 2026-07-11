import { describe, it, expect, vi } from 'vitest';
import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import { UnionRotateCommand } from '../../models/editor-commands';
import {
  prepareCanvasContextMenuSelection,
  type CanvasContextMenuSelectionDeps
} from './canvas-context-menu-selection';
import { computeCanvasContextMenuState } from './canvas-context-menu-state';
import { CanvasDocumentActionsService } from './canvas-document-actions.service';

function rectProps(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function elementId(el: SvgJsElement): string {
  return el.node?.id ?? '';
}

describe('canvas context menu integration helpers', () => {
  describe('prepareCanvasContextMenuSelection + computeCanvasContextMenuState', () => {
    it('empty hit keeps selection and yields paste-only enablement', () => {
      const deps: CanvasContextMenuSelectionDeps = {
        getSvgInstance: () => null,
        getNearestGroupAncestorId: () => null,
        isGroupAClipMaskCarrier: () => false,
        getShapeProperties: (el) => rectProps(elementId(el)),
        getShapePropertiesInSameClipGroup: (el) => [rectProps(elementId(el))],
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
        selectedShapes: [rectProps('kept')],
        hasClipboardContent: true,
        isElementOrAncestorLocked: () => false
      });

      expect(selection.hitShape).toBe(false);
      expect(deps.selectShapes).not.toHaveBeenCalled();
      expect(state.canPaste).toBe(true);
      expect(state.canCopy).toBe(false);
    });
  });

  describe('CanvasDocumentActionsService.rotateSelectionByDegrees', () => {
    it('dispatches UnionRotateCommand with ±90 degrees', () => {
      const pushAndExecute = vi.fn();
      const svc = {
        getUnionBBox: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 50 })),
        getSelectionRotationPivot: vi.fn(() => null),
        snapshotSelectionTransforms: vi.fn(() => new Map()),
        isElementOrAncestorLocked: vi.fn(() => false),
        clearHighlight: vi.fn()
      };
      const actions = Object.create(CanvasDocumentActionsService.prototype) as CanvasDocumentActionsService;
      Object.assign(actions, {
        svgManipulation: svc,
        shapeSelection: {
          getSelectedShapes: () => [rectProps('s1')]
        },
        editorHistory: { pushAndExecute },
        getExpandedSelectedShapeIds: () => ['s1']
      });

      actions.rotateSelectionByDegrees(90);
      expect(pushAndExecute).toHaveBeenCalledTimes(1);
      expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(UnionRotateCommand);
      expect((pushAndExecute.mock.calls[0][0] as UnionRotateCommand).description).toBe('Rotate 90°');

      actions.rotateSelectionByDegrees(-90);
      expect((pushAndExecute.mock.calls[1][0] as UnionRotateCommand).description).toBe('Rotate -90°');
    });
  });
});
