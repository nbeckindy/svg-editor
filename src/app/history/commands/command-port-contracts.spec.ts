import { describe, it, expect, vi } from 'vitest';
import { Matrix } from '@svgdotjs/svg.js';
import { FillColorCommand, TranslateCommand, RemoveShapesCommand } from '../../models/editor-commands';
import type { HistoryPaintPort } from '../history-paint.port';
import type { TransformGestureSvgPort } from '../transform-gesture-svg.port';
import type { EditorShapeLifecycleSvgPort } from '../editor-shape-lifecycle-svg.port';

function mockPaintPort(): HistoryPaintPort {
  return {
    updateFillColor: vi.fn(),
    updateStrokeColor: vi.fn(),
    updateOpacity: vi.fn(),
    updateFillOpacity: vi.fn(),
    updateStrokeOpacity: vi.fn()
  };
}

function mockTransformPort(): TransformGestureSvgPort {
  return {
    getSVGInstance: vi.fn().mockReturnValue(null),
    translateShape: vi.fn(),
    applyUnionScaleFromSnapshot: vi.fn(),
    restoreVectorEffectsForShapeSubtrees: vi.fn(),
    applyUnionScaleFromCenter: vi.fn(),
    applyUnionRotationFromSnapshot: vi.fn(),
    applyUnionSkewFromSnapshot: vi.fn(),
    restoreSelectionTransformsFromSnapshot: vi.fn()
  };
}

function mockLifecyclePort(): EditorShapeLifecycleSvgPort {
  return {
    getSVGInstance: vi.fn().mockReturnValue(null),
    getShapeProperties: vi.fn(),
    removeShapes: vi.fn(),
    removeShape: vi.fn(),
    restoreRemovedShapesInContentGroup: vi.fn(),
    insertShapeMarkup: vi.fn(),
    createClipboardPayload: vi.fn().mockReturnValue({ shapes: [] }),
    pasteClipboardPayload: vi.fn().mockReturnValue({ insertedIds: [], insertedMarkup: [] }),
    updateTextContent: vi.fn()
  };
}

describe('command port contracts', () => {
  describe('HistoryPaintPort', () => {
    it('FillColorCommand calls updateFillColor on execute and undo', () => {
      const paint = mockPaintPort();
      const updateFillColor = vi.mocked(paint.updateFillColor);
      const cmd = new FillColorCommand(paint, 'shape-1', '#000000', '#ffffff');

      cmd.execute();
      expect(updateFillColor).toHaveBeenCalledWith('shape-1', '#ffffff');

      cmd.undo();
      expect(updateFillColor).toHaveBeenCalledWith('shape-1', '#000000');
    });
  });

  describe('TransformGestureSvgPort', () => {
    it('TranslateCommand calls translateShape on execute and restoreSelectionTransformsFromSnapshot on undo', () => {
      const transform = mockTransformPort();
      const translateShape = vi.mocked(transform.translateShape);
      const restoreSelectionTransformsFromSnapshot = vi.mocked(
        transform.restoreSelectionTransformsFromSnapshot
      );
      const snapshot = new Map<string, Matrix>([['shape-1', new Matrix()]]);
      const cmd = new TranslateCommand(transform, 'shape-1', 12, -4, snapshot);

      cmd.execute();
      expect(translateShape).toHaveBeenCalledWith('shape-1', 12, -4);

      cmd.undo();
      expect(restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['shape-1'], snapshot);
    });
  });

  describe('EditorShapeLifecycleSvgPort', () => {
    it('RemoveShapesCommand calls removeShapes on execute', () => {
      const lifecycle = mockLifecyclePort();
      const removeShapes = vi.mocked(lifecycle.removeShapes);
      const contentGroup = document.createElement('div');
      contentGroup.setAttribute('data-editor-content-group', '');
      const shape = document.createElement('div');
      shape.id = 'shape-1';
      contentGroup.appendChild(shape);

      lifecycle.getSVGInstance = vi.fn().mockReturnValue({
        findOne: (sel: string) => {
          if (sel === '[data-editor-content-group]') return { node: contentGroup };
          if (sel === '#shape-1') return { node: shape };
          return undefined;
        }
      });

      const cmd = new RemoveShapesCommand(lifecycle, ['shape-1']);
      cmd.execute();
      expect(removeShapes).toHaveBeenCalledWith(['shape-1']);
    });
  });
});
