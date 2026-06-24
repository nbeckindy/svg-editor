import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef, signal } from '@angular/core';
import { handleSvgCanvasKeyDown, type SvgCanvasKeyboardContext } from './svg-canvas-keyboard.controller';
import type { EditorTool } from '../../services/editor-tool.service';
import type { PenToolSession } from './pen-tool-session/pen-tool-session';
import type { SelectorKeyboardActionsPort } from './selector-canvas-tool-keyboard';
import {
  patchRegisteredCanvasTool,
  registerAllCanvasToolsForTest,
  type RegisterAllCanvasToolsForTestOptions
} from '../../tools/register-all-canvas-tools-for-test';

function makeKeyboardContext(
  over: Partial<SvgCanvasKeyboardContext> & {
    getCurrentTool?: () => EditorTool;
    bootOptions?: RegisterAllCanvasToolsForTestOptions;
  }
): SvgCanvasKeyboardContext {
  const currentTool = signal<EditorTool>(over.getCurrentTool?.() ?? 'selector');
  const boot = registerAllCanvasToolsForTest(over.bootOptions);
  const base: SvgCanvasKeyboardContext = {
    gestureRuntime: {} as SvgCanvasKeyboardContext['gestureRuntime'],
    svgManipulation: {} as SvgCanvasKeyboardContext['svgManipulation'],
    shapeSelection: {
      getSelectedShapes: () => [],
      clearSelection: vi.fn()
    } as unknown as SvgCanvasKeyboardContext['shapeSelection'],
    editorHistory: { undo: vi.fn(), redo: vi.fn(), pushAndExecute: vi.fn() } as unknown as SvgCanvasKeyboardContext['editorHistory'],
    cdr: { detectChanges: vi.fn() } as unknown as ChangeDetectorRef,
    drag: { cancel: vi.fn() } as unknown as SvgCanvasKeyboardContext['drag'],
    resize: { cancel: vi.fn() } as unknown as SvgCanvasKeyboardContext['resize'],
    skew: { cancel: vi.fn() } as unknown as SvgCanvasKeyboardContext['skew'],
    rotate: { cancel: vi.fn() } as unknown as SvgCanvasKeyboardContext['rotate'],
    selectionMarquee: {} as SvgCanvasKeyboardContext['selectionMarquee'],
    zoomMarquee: {} as SvgCanvasKeyboardContext['zoomMarquee'],
    penTool: boot.penTool,
    toolRegistry: boot.registry,
    getSvgContent: () => '<svg/>',
    getCurrentTool: () => currentTool(),
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
    setTool: (tool: EditorTool) => currentTool.set(tool),
    markForCheck: vi.fn(),
    getViewKeyboardActions: () => ({
      zoomInAtViewportCenter: vi.fn(),
      zoomOutAtViewportCenter: vi.fn(),
      resetZoomAndRefreshOverlay: vi.fn(),
      fitArtboardToViewport: vi.fn(),
      fitContentToViewport: vi.fn()
    }),
    getPathNodeEditState: () => null,
    tryDeleteSelectedPathNode: () => false
  };
  return { ...base, ...over, getCurrentTool: over.getCurrentTool ?? base.getCurrentTool };
}

describe('handleSvgCanvasKeyDown', () => {
  let editorTool: { getCurrentTool(): EditorTool; setTool(tool: EditorTool): void };

  beforeEach(() => {
    let tool: EditorTool = 'selector';
    editorTool = {
      getCurrentTool: () => tool,
      setTool: (next) => {
        tool = next;
      }
    };
  });

  it('dispatches to registered tool onKeyDown before legacy handlers', () => {
    const onKeyDown = vi.fn(() => true);
    const ctx = makeKeyboardContext({ getCurrentTool: () => 'rect' });
    patchRegisteredCanvasTool(ctx.toolRegistry, 'rect', { onKeyDown });
    const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(onKeyDown).toHaveBeenCalledWith(event);
    expect(ctx.clearSelectionAndHighlight).not.toHaveBeenCalled();
  });

  it('falls through to legacy handlers when registered tool does not consume the key', () => {
    const clearSelectionAndHighlight = vi.fn();
    const ctx = makeKeyboardContext({
      getCurrentTool: () => 'rect',
      clearSelectionAndHighlight,
      shapeSelection: {
        getSelectedShapes: () => [{ id: 'a' }],
        clearSelection: vi.fn()
      } as unknown as SvgCanvasKeyboardContext['shapeSelection']
    });
    patchRegisteredCanvasTool(ctx.toolRegistry, 'rect', { onKeyDown: () => false });
    const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(clearSelectionAndHighlight).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('still applies global tool shortcut when active tool has no onKeyDown', () => {
    const ctx = makeKeyboardContext({ getCurrentTool: () => 'selector' });
    const event = { key: 'r', altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(editorTool.getCurrentTool()).toBe('rect');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('dispatches pen Enter through registered tool onKeyDown', () => {
    const tryFinishPenPath = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      tryFinishPenPath,
      tryPenBackspaceShortcut: vi.fn(() => false),
      isPenInsertOnPathDragActive: false,
      clearDrawingState: vi.fn()
    } as unknown as PenToolSession;
    const ctx = makeKeyboardContext({
      getCurrentTool: () => 'pen',
      isPenSessionActive: () => true,
      bootOptions: { penTool }
    });
    const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(tryFinishPenPath).toHaveBeenCalledWith(false);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('dispatches pen Backspace through registered tool onKeyDown', () => {
    const tryPenBackspaceShortcut = vi.fn(() => true);
    const penTool = {
      isPenSessionActive: true,
      tryPenBackspaceShortcut,
      tryFinishPenPath: vi.fn(),
      isPenInsertOnPathDragActive: false,
      clearDrawingState: vi.fn()
    } as unknown as PenToolSession;
    const ctx = makeKeyboardContext({
      getCurrentTool: () => 'pen',
      bootOptions: { penTool }
    });
    const event = { key: 'Backspace', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(tryPenBackspaceShortcut).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
