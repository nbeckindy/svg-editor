import { describe, it, expect, vi } from 'vitest';
import type { PenToolSession } from '../components/svg-canvas/pen-tool-session/pen-tool-session';
import { createPenCanvasTool, type PenCanvasToolDeps } from './pen-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';

function makePenDeps(over: Partial<PenCanvasToolDeps> = {}): () => PenCanvasToolDeps {
  const penTool = {
    isPenSessionActive: false,
    isPenInsertOnPathDragActive: false,
    wouldPickUpPenOpenPathContinuationAt: vi.fn(() => false),
    onCanvasPenPrimaryMouseDown: vi.fn(() => true),
    onDocumentMouseMovePen: vi.fn(),
    onDocumentMouseUpPen: vi.fn(),
    tryPenBackspaceShortcut: vi.fn(() => false),
    tryFinishPenPath: vi.fn(),
    clearDrawingState: vi.fn()
  } as unknown as PenToolSession;

  return () => ({
    getPenTool: () => penTool,
    getSnappedPenPoint: (clientX, clientY) => ({ x: clientX, y: clientY }),
    hasPathNodeEditState: () => false,
    tryStartPathNodeDrag: () => false,
    isCanvasReady: () => true,
    scheduleInsertHoverCursorHitTest: vi.fn(),
    ...over,
    getPenTool: over.getPenTool ?? (() => penTool)
  });
}

describe('createPenCanvasTool', () => {
  it('registers pen pointer handlers through the tool registry', () => {
    const onDocumentMouseMovePen = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      isPenInsertOnPathDragActive: false,
      onDocumentMouseMovePen,
      onDocumentMouseUpPen: vi.fn()
    } as unknown as PenToolSession;
    const tool = createPenCanvasTool(
      makePenDeps({
        getPenTool: () => penTool
      })
    );

    const moveConsumed = tool.onPointerMove?.({ clientX: 1, clientY: 2, shiftKey: false } as MouseEvent, {
      x: 0,
      y: 0
    });
    expect(onDocumentMouseMovePen).toHaveBeenCalled();
    expect(moveConsumed).toBe(true);
  });

  it('schedules idle insert hover without consuming move when pen session is idle', () => {
    const scheduleInsertHoverCursorHitTest = vi.fn();
    const tool = createPenCanvasTool(
      makePenDeps({
        scheduleInsertHoverCursorHitTest
      })
    );

    const consumed = tool.onPointerMove?.({ clientX: 3, clientY: 4, shiftKey: false } as MouseEvent, {
      x: 0,
      y: 0
    });
    expect(scheduleInsertHoverCursorHitTest).toHaveBeenCalledWith(3, 4);
    expect(consumed).toBe(false);
  });

  it('clears drawing state on deactivate', () => {
    const clearDrawingState = vi.fn();
    const penTool = { clearDrawingState } as unknown as PenToolSession;
    const tool = createPenCanvasTool(makePenDeps({ getPenTool: () => penTool }));
    tool.onDeactivate();
    expect(clearDrawingState).toHaveBeenCalled();
  });

  it('registers in ToolRegistryService', () => {
    const registry = new ToolRegistryService();
    registry.register(createPenCanvasTool(makePenDeps()));
    expect(registry.has('pen')).toBe(true);
  });

  it('finishes pen path on Enter when session is active', () => {
    const tryFinishPenPath = vi.fn();
    const penTool = {
      isPenSessionActive: true,
      tryFinishPenPath,
      tryPenBackspaceShortcut: vi.fn(() => false)
    } as unknown as PenToolSession;
    const tool = createPenCanvasTool(makePenDeps({ getPenTool: () => penTool }));
    const event = { key: 'Enter' } as KeyboardEvent;

    expect(tool.onKeyDown?.(event)).toBe(true);
    expect(tryFinishPenPath).toHaveBeenCalledWith(false);
  });

  it('ignores Enter when pen session is idle', () => {
    const tryFinishPenPath = vi.fn();
    const penTool = {
      isPenSessionActive: false,
      tryFinishPenPath,
      tryPenBackspaceShortcut: vi.fn(() => false)
    } as unknown as PenToolSession;
    const tool = createPenCanvasTool(makePenDeps({ getPenTool: () => penTool }));

    expect(tool.onKeyDown?.({ key: 'Enter' } as KeyboardEvent)).toBe(false);
    expect(tryFinishPenPath).not.toHaveBeenCalled();
  });

  it('delegates Backspace to pen session shortcut handler', () => {
    const tryPenBackspaceShortcut = vi.fn(() => true);
    const penTool = {
      isPenSessionActive: true,
      tryPenBackspaceShortcut,
      tryFinishPenPath: vi.fn()
    } as unknown as PenToolSession;
    const tool = createPenCanvasTool(makePenDeps({ getPenTool: () => penTool }));

    expect(tool.onKeyDown?.({ key: 'Backspace' } as KeyboardEvent)).toBe(true);
    expect(tryPenBackspaceShortcut).toHaveBeenCalled();
  });
});
