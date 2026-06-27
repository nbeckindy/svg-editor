import { describe, it, expect } from 'vitest';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import { computeCanvasContextMenuState, shouldSuppressCanvasContextMenu } from './canvas-context-menu-state';

function rect(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function group(id: string): ShapeProperties {
  return { id, type: 'g', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

describe('computeCanvasContextMenuState', () => {
  const neverLocked = () => false;
  const alwaysLocked = (id: string) => id === 'locked';

  it('enables shape actions on shape hit with selection', () => {
    const state = computeCanvasContextMenuState({
      hitShape: true,
      selectedShapes: [rect('a'), rect('b')],
      hasClipboardContent: false,
      isElementOrAncestorLocked: neverLocked
    });

    expect(state.canCut).toBe(true);
    expect(state.canCopy).toBe(true);
    expect(state.canDelete).toBe(true);
    expect(state.canGroup).toBe(true);
    expect(state.canUngroup).toBe(false);
    expect(state.canRotate).toBe(true);
    expect(state.canPaste).toBe(false);
  });

  it('disables shape actions on empty hit but allows paste when clipboard has content', () => {
    const state = computeCanvasContextMenuState({
      hitShape: false,
      selectedShapes: [rect('a')],
      hasClipboardContent: true,
      isElementOrAncestorLocked: neverLocked
    });

    expect(state.canCut).toBe(false);
    expect(state.canCopy).toBe(false);
    expect(state.canDelete).toBe(false);
    expect(state.canGroup).toBe(false);
    expect(state.canUngroup).toBe(false);
    expect(state.canRotate).toBe(false);
    expect(state.canPaste).toBe(true);
  });

  it('disables cut/delete/group/rotate when selection touches locked elements', () => {
    const state = computeCanvasContextMenuState({
      hitShape: true,
      selectedShapes: [rect('locked'), rect('b')],
      hasClipboardContent: false,
      isElementOrAncestorLocked: alwaysLocked
    });

    expect(state.canCut).toBe(false);
    expect(state.canCopy).toBe(true);
    expect(state.canDelete).toBe(false);
    expect(state.canGroup).toBe(false);
    expect(state.canRotate).toBe(false);
  });

  it('enables ungroup when all selected shapes are groups', () => {
    const state = computeCanvasContextMenuState({
      hitShape: true,
      selectedShapes: [group('g1')],
      hasClipboardContent: false,
      isElementOrAncestorLocked: neverLocked
    });

    expect(state.canUngroup).toBe(true);
    expect(state.canGroup).toBe(false);
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
