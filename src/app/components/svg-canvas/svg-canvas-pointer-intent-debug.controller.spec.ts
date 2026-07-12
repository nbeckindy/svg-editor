import { describe, it, expect, vi } from 'vitest';
import {
  refreshSvgCanvasPointerIntentDebug,
  type SvgCanvasPointerIntentDebugContext,
  type PointerIntentDebugSampleFields
} from './svg-canvas-pointer-intent-debug.controller';

const sampleFields: PointerIntentDebugSampleFields = {
  tool: 'selector',
  isCreationInProgress: false,
  pathNodeDragPathId: null,
  isPenInsertOnPathDragActive: false,
  isPenSessionActive: false,
  isSelectionMarquee: false,
  isZoomMarquee: false,
  isResizingSelection: false,
  isSkewingSelection: false,
  isRotatingSelection: false,
  isPanning: false,
  isDraggingShape: false,
  isCanvasReady: true,
  getDescriptor: () => undefined,
  hasRegisteredTool: () => true
};

function makeContext(
  over: Partial<SvgCanvasPointerIntentDebugContext> = {}
): SvgCanvasPointerIntentDebugContext {
  return {
    isSamplingEnabled: () => true,
    getCanvasViewportElement: () => null,
    computeExpectedCursorLine: () => 'Expected cursor: default',
    getPointerIntentDebugFields: () => sampleFields,
    publish: vi.fn(),
    ...over
  };
}

describe('refreshSvgCanvasPointerIntentDebug', () => {
  it('does not publish when sampling is disabled', () => {
    const publish = vi.fn();
    refreshSvgCanvasPointerIntentDebug(makeContext({ isSamplingEnabled: () => false, publish }), 10, 20);
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes with overCanvas false when viewport is missing', () => {
    const publish = vi.fn();
    const previousElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(document.createElement('div')) as typeof document.elementFromPoint;

    try {
      refreshSvgCanvasPointerIntentDebug(
        makeContext({
          getCanvasViewportElement: () => undefined,
          publish
        }),
        10,
        20
      );

      expect(publish).toHaveBeenCalledOnce();
      expect(publish.mock.calls[0][0].primaryLine).toBe('selector: pointer not on canvas');
    } finally {
      if (previousElementFromPoint) {
        document.elementFromPoint = previousElementFromPoint;
      } else {
        delete (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint;
      }
    }
  });

  it('publishes with overCanvas true when hit target is inside the viewport', () => {
    const publish = vi.fn();
    const viewport = document.createElement('div');
    const child = document.createElement('span');
    viewport.appendChild(child);
    document.body.appendChild(viewport);

    const previousElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(child) as typeof document.elementFromPoint;

    try {
      refreshSvgCanvasPointerIntentDebug(
        makeContext({
          getCanvasViewportElement: () => viewport,
          publish
        }),
        10,
        20
      );

      expect(publish).toHaveBeenCalledOnce();
      expect(publish.mock.calls[0][0].detailLines).toContain('overCanvasViewport=true');
      expect(publish.mock.calls[0][0].primaryLine).toBe(
        'selector: primary mousedown → registered tool handler'
      );
    } finally {
      if (previousElementFromPoint) {
        document.elementFromPoint = previousElementFromPoint;
      } else {
        // jsdom may omit elementFromPoint until assigned
        delete (document as { elementFromPoint?: typeof document.elementFromPoint }).elementFromPoint;
      }
      viewport.remove();
    }
  });

  it('passes computeExpectedCursorLine result into the published snapshot', () => {
    const publish = vi.fn();
    const computeExpectedCursorLine = vi.fn(() => 'Expected cursor: crosshair');

    refreshSvgCanvasPointerIntentDebug(
      makeContext({
        computeExpectedCursorLine,
        publish
      }),
      5,
      6
    );

    expect(computeExpectedCursorLine).toHaveBeenCalledWith(5, 6, null, false);
    expect(publish.mock.calls[0][0].expectedCursorLine).toBe('Expected cursor: crosshair');
  });
});
