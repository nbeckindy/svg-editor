import { describe, expect, it, vi } from 'vitest';
import { computeExpectedCursorHint } from '../../tools/canvas-cursor-hint';
import {
  buildComputeExpectedCursorHintDepsFromCanvas,
  type CanvasCursorHintDepsHost
} from './build-canvas-cursor-hint-deps';

function makeHost(over: Partial<CanvasCursorHintDepsHost> = {}): CanvasCursorHintDepsHost {
  return {
    getCurrentTool: () => 'selector',
    getCanvasViewportElement: () => undefined,
    getPathNodeDragSession: () => null,
    creationIsActive: false,
    isDraggingShape: false,
    isResizingSelection: false,
    isSkewingSelection: false,
    isRotatingSelection: false,
    isPanning: false,
    isPenInsertOnPathDragActive: () => false,
    hasPathNodeEditState: () => false,
    getToolCursorHint: () => null,
    penInsertCopyCursorWouldApply: () => false,
    altKeyPressed: false,
    isCreationToolActive: () => false,
    ...over
  };
}

describe('buildComputeExpectedCursorHintDepsFromCanvas', () => {
  it('maps host getters into computeExpectedCursorHint deps', () => {
    const viewport = document.createElement('div');
    viewport.style.cursor = 'crosshair';
    const getToolCursorHint = vi.fn(() => 'Expected cursor: pointer (tool)');

    const deps = buildComputeExpectedCursorHintDepsFromCanvas(
      makeHost({
        getCanvasViewportElement: () => viewport,
        getToolCursorHint
      })
    );

    expect(deps.getViewportInlineCursor()).toBe('crosshair');
    expect(
      computeExpectedCursorHint(deps, 10, 20, document.createElement('span'), true)
    ).toBe('Expected cursor: pointer (tool)');
    expect(getToolCursorHint).toHaveBeenCalled();
  });

  it('reflects gesture state from the host', () => {
    const deps = buildComputeExpectedCursorHintDepsFromCanvas(
      makeHost({
        creationIsActive: true
      })
    );

    expect(
      computeExpectedCursorHint(deps, 0, 0, null, true)
    ).toBe('Expected cursor: crosshair (creation in progress)');
  });
});
