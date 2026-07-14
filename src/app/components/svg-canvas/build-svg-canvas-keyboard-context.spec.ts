import { describe, it, expect, vi } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import {
  buildSvgCanvasKeyboardContext,
  buildSelectorKeyboardActions,
  type SvgCanvasKeyboardHost
} from './build-svg-canvas-keyboard-context';
import type { CanvasDocumentActionsService } from './canvas-document-actions.service';

function makeHost(over: Partial<SvgCanvasKeyboardHost> = {}): SvgCanvasKeyboardHost {
  return {
    gestureRuntime: {} as SvgCanvasKeyboardHost['gestureRuntime'],
    svgManipulation: {} as SvgCanvasKeyboardHost['svgManipulation'],
    shapeSelection: {} as SvgCanvasKeyboardHost['shapeSelection'],
    editorHistory: {} as SvgCanvasKeyboardHost['editorHistory'],
    cdr: { markForCheck: vi.fn(), detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
    drag: {} as SvgCanvasKeyboardHost['drag'],
    resize: {} as SvgCanvasKeyboardHost['resize'],
    skew: {} as SvgCanvasKeyboardHost['skew'],
    rotate: {} as SvgCanvasKeyboardHost['rotate'],
    selectionMarquee: {} as SvgCanvasKeyboardHost['selectionMarquee'],
    zoomMarquee: {} as SvgCanvasKeyboardHost['zoomMarquee'],
    penTool: {} as SvgCanvasKeyboardHost['penTool'],
    toolRegistry: {} as SvgCanvasKeyboardHost['toolRegistry'],
    getSvgContent: () => '<svg/>',
    getCurrentTool: () => 'selector',
    setTool: vi.fn(),
    markForCheck: vi.fn(),
    commitInlineTextEditIfActive: () => false,
    shouldIgnoreKeyboardShortcuts: () => false,
    isDraggingShape: () => false,
    isResizingSelection: () => false,
    isSkewingSelection: () => false,
    isRotatingSelection: () => false,
    isSelectionMarquee: () => false,
    isZoomMarquee: () => false,
    isPenSessionActive: () => false,
    cancelActiveMarquees: vi.fn(),
    exitPathNodeEditMode: () => false,
    clearSelectionAndHighlight: vi.fn(),
    setDrilledIntoGroupId: vi.fn(),
    getPathNodeEditState: () => null,
    tryDeleteSelectedPathNode: () => false,
    getViewKeyboardActions: () => ({
      zoomInAtViewportCenter: vi.fn(),
      zoomOutAtViewportCenter: vi.fn(),
      resetZoomAndRefreshOverlay: vi.fn(),
      fitArtboardToViewport: vi.fn(),
      fitContentToViewport: vi.fn()
    }),
    ...over
  };
}

describe('buildSvgCanvasKeyboardContext', () => {
  it('wires host callbacks onto the keyboard context', () => {
    const cancelActiveMarquees = vi.fn();
    const host = makeHost({ cancelActiveMarquees, getCurrentTool: () => 'pen' });
    const ctx = buildSvgCanvasKeyboardContext(host);

    expect(ctx.getCurrentTool()).toBe('pen');
    expect(ctx.getSvgContent()).toBe('<svg/>');
    ctx.cancelActiveMarquees();
    expect(cancelActiveMarquees).toHaveBeenCalledOnce();
  });
});

describe('buildSelectorKeyboardActions', () => {
  it('delegates clipboard and group to document actions', () => {
    const documentActions = {
      selectAllShapesFromDocument: vi.fn(),
      copySelectionToClipboard: vi.fn().mockReturnValue(true),
      cutSelectionToClipboard: vi.fn().mockReturnValue(true),
      pasteFromClipboard: vi.fn().mockReturnValue(true),
      duplicateSelection: vi.fn().mockReturnValue(true),
      groupSelectedShapes: vi.fn(),
      ungroupSelectedShape: vi.fn(),
      handleAlignmentShortcut: vi.fn().mockReturnValue(false)
    } as unknown as CanvasDocumentActionsService;
    const documentActionsHost = { clearDrilledIntoGroupId: vi.fn() };
    const actions = buildSelectorKeyboardActions(makeHost(), documentActions, documentActionsHost);

    actions.copySelectionToClipboard();
    actions.groupSelectedShapes();

    expect(documentActions.copySelectionToClipboard).toHaveBeenCalledOnce();
    expect(documentActions.groupSelectedShapes).toHaveBeenCalledWith(documentActionsHost);
  });
});
