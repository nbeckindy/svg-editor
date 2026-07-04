import { describe, it, expect } from 'vitest';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import { computeCanvasContextMenuState, shouldSuppressCanvasContextMenu } from './canvas-context-menu-state';

function rect(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function group(id: string): ShapeProperties {
  return { id, type: 'g', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function path(id: string): ShapeProperties {
  return { id, type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

const neverLocked = () => false;
const alwaysLocked = (id: string) => id === 'locked';

function mockRectElement(): Element {
  return {
    tagName: 'rect',
    getAttribute: (name: string) => {
      const attrs: Record<string, string> = {
        id: 'rect-a',
        x: '0',
        y: '0',
        width: '10',
        height: '10'
      };
      return attrs[name] ?? null;
    },
    hasAttribute: (name: string) => name in { id: true, x: true, y: true, width: true, height: true }
  } as Element;
}

function baseInput(over: Partial<Parameters<typeof computeCanvasContextMenuState>[0]> = {}) {
  return {
    hitShape: true,
    hitOutlineToPathPrimitive: false,
    selectedShapes: [rect('a'), rect('b')],
    hasClipboardContent: false,
    isSelectorMode: true,
    isElementOrAncestorLocked: neverLocked,
    getOutlineToPathElement: (id: string) => (id === 'rect-a' ? mockRectElement() : null),
    canMakeClipPathForSelection: () => true,
    canReleaseClipPathForSelection: () => false,
    ...over
  };
}

describe('computeCanvasContextMenuState', () => {
  it('enables shape actions on shape hit with selection', () => {
    const state = computeCanvasContextMenuState(baseInput());

    expect(state.canCut).toBe(true);
    expect(state.canCopy).toBe(true);
    expect(state.canDelete).toBe(true);
    expect(state.canGroup).toBe(true);
    expect(state.canUngroup).toBe(false);
    expect(state.canOutlineToPath).toBe(false);
    expect(state.canRotate).toBe(true);
    expect(state.canPaste).toBe(false);
  });

  it('enables make clipping mask when delegate allows and disables release', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        canMakeClipPathForSelection: () => true,
        canReleaseClipPathForSelection: () => false
      })
    );
    expect(state.canMakeClipPath).toBe(true);
    expect(state.canReleaseClipPath).toBe(false);
  });

  it('enables release clipping mask when delegate allows', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        selectedShapes: [rect('a')],
        canMakeClipPathForSelection: () => false,
        canReleaseClipPathForSelection: () => true
      })
    );
    expect(state.canMakeClipPath).toBe(false);
    expect(state.canReleaseClipPath).toBe(true);
  });

  it('disables clip path actions when not in selector mode', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        isSelectorMode: false,
        canMakeClipPathForSelection: () => true,
        canReleaseClipPathForSelection: () => true
      })
    );
    expect(state.canMakeClipPath).toBe(false);
    expect(state.canReleaseClipPath).toBe(false);
  });

  it('disables shape actions on empty hit but allows paste when clipboard has content', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        hitShape: false,
        selectedShapes: [rect('a')],
        hasClipboardContent: true
      })
    );

    expect(state.canCut).toBe(false);
    expect(state.canCopy).toBe(false);
    expect(state.canDelete).toBe(false);
    expect(state.canGroup).toBe(false);
    expect(state.canUngroup).toBe(false);
    expect(state.canOutlineToPath).toBe(false);
    expect(state.canRotate).toBe(false);
    expect(state.canPaste).toBe(true);
  });

  it('disables cut/delete/group/rotate when selection touches locked elements', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        selectedShapes: [rect('locked'), rect('b')],
        isElementOrAncestorLocked: alwaysLocked
      })
    );

    expect(state.canCut).toBe(false);
    expect(state.canCopy).toBe(true);
    expect(state.canDelete).toBe(false);
    expect(state.canGroup).toBe(false);
    expect(state.canRotate).toBe(false);
  });

  it('enables ungroup when all selected shapes are groups', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        selectedShapes: [group('g1')]
      })
    );

    expect(state.canUngroup).toBe(true);
    expect(state.canGroup).toBe(false);
  });

  it('enables outline to path when clicking a primitive with single eligible selection', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        hitOutlineToPathPrimitive: true,
        selectedShapes: [rect('rect-a')],
        getOutlineToPathElement: () => mockRectElement()
      })
    );

    expect(state.canOutlineToPath).toBe(true);
  });

  it('disables outline to path when not clicking a primitive', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        hitOutlineToPathPrimitive: false,
        selectedShapes: [rect('rect-a')],
        getOutlineToPathElement: () => mockRectElement()
      })
    );

    expect(state.canOutlineToPath).toBe(false);
  });

  it('disables outline to path when clicking a path', () => {
    const state = computeCanvasContextMenuState(
      baseInput({
        hitOutlineToPathPrimitive: false,
        selectedShapes: [path('path-a')],
        getOutlineToPathElement: () => null
      })
    );

    expect(state.canOutlineToPath).toBe(false);
  });
});

describe('shouldSuppressCanvasContextMenu', () => {
  it('suppresses when svg is not loaded', () => {
    expect(
      shouldSuppressCanvasContextMenu({
        hasSvgContent: false,
        penSessionActive: false,
        penInsertDragActive: false,
        gestureActive: false
      })
    ).toBe(true);
  });

  it('suppresses during active pen session or insert drag', () => {
    expect(
      shouldSuppressCanvasContextMenu({
        hasSvgContent: true,
        penSessionActive: true,
        penInsertDragActive: false,
        gestureActive: false
      })
    ).toBe(true);
    expect(
      shouldSuppressCanvasContextMenu({
        hasSvgContent: true,
        penSessionActive: false,
        penInsertDragActive: true,
        gestureActive: false
      })
    ).toBe(true);
  });

  it('allows menu when svg loaded and no pen or gesture conflict', () => {
    expect(
      shouldSuppressCanvasContextMenu({
        hasSvgContent: true,
        penSessionActive: false,
        penInsertDragActive: false,
        gestureActive: false
      })
    ).toBe(false);
  });
});
