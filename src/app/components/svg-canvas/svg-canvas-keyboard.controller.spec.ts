import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef, signal } from '@angular/core';
import { handleSvgCanvasKeyDown, type SvgCanvasKeyboardContext } from './svg-canvas-keyboard.controller';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import type { EditorTool } from '../../services/editor-tool.service';
import type { PenToolSession } from './pen-tool-session/pen-tool-session';

function makeKeyboardContext(
  over: Partial<SvgCanvasKeyboardContext> & { getCurrentTool?: () => EditorTool }
): SvgCanvasKeyboardContext {
  const currentTool = signal<EditorTool>(over.getCurrentTool?.() ?? 'selector');
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
    penTool: {
      tryPenBackspaceShortcut: vi.fn(() => false),
      isPenInsertOnPathDragActive: false
    } as unknown as PenToolSession,
    toolRegistry: new ToolRegistryService(),
    getSvgContent: () => '<svg/>',
    getCurrentTool: () => currentTool(),
    isSelectorActive: () => currentTool() === 'selector',
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
    selectAllShapesFromDocument: vi.fn(),
    copySelectionToClipboard: () => false,
    cutSelectionToClipboard: () => false,
    pasteFromClipboard: () => false,
    duplicateSelection: () => false,
    groupSelectedShapes: vi.fn(),
    ungroupSelectedShape: vi.fn(),
    zoomInAtViewportCenter: vi.fn(),
    zoomOutAtViewportCenter: vi.fn(),
    resetZoomAndRefreshOverlay: vi.fn(),
    fitArtboardToViewport: vi.fn(),
    fitContentToViewport: vi.fn(),
    updateViewBoxOverlayRect: vi.fn(),
    getPathNodeEditState: () => null,
    tryDeleteSelectedPathNode: () => false,
    handleAlignmentShortcut: () => false
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
    const registry = new ToolRegistryService();
    const onKeyDown = vi.fn(() => true);
    registry.register({
      toolId: 'rect',
      onActivate: () => {},
      onDeactivate: () => {},
      onKeyDown
    });
    const ctx = makeKeyboardContext({
      toolRegistry: registry,
      getCurrentTool: () => 'rect'
    });
    const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(onKeyDown).toHaveBeenCalledWith(event);
    expect(ctx.clearSelectionAndHighlight).not.toHaveBeenCalled();
  });

  it('falls through to legacy handlers when registered tool does not consume the key', () => {
    const registry = new ToolRegistryService();
    registry.register({
      toolId: 'rect',
      onActivate: () => {},
      onDeactivate: () => {},
      onKeyDown: () => false
    });
    const clearSelectionAndHighlight = vi.fn();
    const ctx = makeKeyboardContext({
      toolRegistry: registry,
      getCurrentTool: () => 'rect',
      clearSelectionAndHighlight,
      shapeSelection: {
        getSelectedShapes: () => [{ id: 'a' }],
        clearSelection: vi.fn()
      } as unknown as SvgCanvasKeyboardContext['shapeSelection']
    });
    const event = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(clearSelectionAndHighlight).toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('still applies global tool shortcut when active tool has no onKeyDown', () => {
    const registry = new ToolRegistryService();
    registry.register({
      toolId: 'selector',
      onActivate: () => {},
      onDeactivate: () => {}
    });
    const ctx = makeKeyboardContext({
      toolRegistry: registry,
      getCurrentTool: () => 'selector'
    });
    const event = { key: 'r', altKey: false, ctrlKey: false, metaKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;

    handleSvgCanvasKeyDown(ctx, event, editorTool);

    expect(editorTool.getCurrentTool()).toBe('rect');
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
