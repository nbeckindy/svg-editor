import { describe, it, expect, vi } from 'vitest';
import { handleSvgCanvasClick } from './svg-canvas-click.controller';

describe('handleSvgCanvasClick', () => {
  it('commits inline text before gesture guards', () => {
    const commitInlineTextEditIfNotTarget = vi.fn();
    const consumePathNodeDragJustEnded = vi.fn(() => true);
    const dispatchRegisteredClick = vi.fn();

    handleSvgCanvasClick(
      {
        commitInlineTextEditIfNotTarget,
        consumePathNodeDragJustEnded,
        consumeDragJustEnded: () => false,
        consumeResizeJustEnded: () => false,
        consumeSkewJustEnded: () => false,
        consumeRotateJustEnded: () => false,
        consumeCreationJustEnded: () => false,
        maybeExitPathNodeEditOnClick: vi.fn(),
        dispatchRegisteredClick
      },
      { target: document.createElement('div') } as unknown as MouseEvent
    );

    expect(commitInlineTextEditIfNotTarget).toHaveBeenCalled();
    expect(dispatchRegisteredClick).not.toHaveBeenCalled();
  });

  it('dispatches registry click after pre-handlers', () => {
    const dispatchRegisteredClick = vi.fn(() => true);
    const event = { target: document.createElement('rect') } as unknown as MouseEvent;

    handleSvgCanvasClick(
      {
        commitInlineTextEditIfNotTarget: vi.fn(),
        consumePathNodeDragJustEnded: () => false,
        consumeDragJustEnded: () => false,
        consumeResizeJustEnded: () => false,
        consumeSkewJustEnded: () => false,
        consumeRotateJustEnded: () => false,
        consumeCreationJustEnded: () => false,
        maybeExitPathNodeEditOnClick: vi.fn(),
        dispatchRegisteredClick
      },
      event
    );

    expect(dispatchRegisteredClick).toHaveBeenCalledWith(event);
  });
});
