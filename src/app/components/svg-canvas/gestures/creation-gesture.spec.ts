import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CreationGesture } from './creation-gesture';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import type { GestureContext } from './gesture-context';

function createMockGestureContext() {
  return {
    svgManipulation: {
      getSVGInstance: vi.fn(),
      addShape: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-1', type: 'rect' }),
      getShapeBBox: vi.fn().mockReturnValue({ x: 10, y: 20, width: 50, height: 30 }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
    },
    shapeSelection: {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    },
    editorHistory: {
      pushAndExecute: vi.fn(),
    },
    canvasView: {},
    cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
    svgContainer: signal(undefined),
    zoomWrapper: signal(undefined),
    highlightOverlayContainer: signal(undefined),
    overlayViewBox: '0 0 100 100',
    clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 10, y: 20 }),
    svgBboxToOverlayPixels: vi.fn((bbox: any) => bbox),
    invalidateHighlightCache: vi.fn(),
    setLastBbox: vi.fn(),
  } as any as GestureContext;
}

function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent;
}

describe('CreationGesture', () => {
  let gesture: CreationGesture;
  let ctx: GestureContext;

  beforeEach(() => {
    gesture = new CreationGesture();
    ctx = createMockGestureContext();
    (ctx.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({
      findOne: vi.fn().mockReturnValue({ node: document.createElement('div') }),
    });
  });

  describe('start()', () => {
    it('returns true when SVG is initialized and tool is a creation tool', () => {
      const result = gesture.start(ctx, 'rect', makeMouseEvent(0, 0));
      expect(result).toBe(true);
    });

    it('returns false when SVG instance is null', () => {
      (ctx.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const result = gesture.start(ctx, 'rect', makeMouseEvent(0, 0));
      expect(result).toBe(false);
    });

    it('returns false for non-creation tools (e.g. selector)', () => {
      const result = gesture.start(ctx, 'selector', makeMouseEvent(0, 0));
      expect(result).toBe(false);
    });

    it('sets isActive to true after successful start()', () => {
      gesture.start(ctx, 'ellipse', makeMouseEvent(0, 0));
      expect(gesture.isActive).toBe(true);
    });
  });

  describe('move()', () => {
    beforeEach(() => {
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));
    });

    it('below drag threshold does not create ghost rect', () => {
      const smallDelta = MARQUEE_MIN_DRAG_PX - 1;
      gesture.move(ctx, 100 + smallDelta, 100 + smallDelta, false);
      expect(gesture.ghostRect).toBeNull();
    });

    it('above drag threshold creates ghost rect', () => {
      const largeDelta = MARQUEE_MIN_DRAG_PX + 10;
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 50, y: 70 });
      gesture.move(ctx, 100 + largeDelta, 100 + largeDelta, false);
      expect(gesture.ghostRect).not.toBeNull();
      expect(gesture.ghostRect!.width).toBeGreaterThan(0);
    });
  });

  describe('end()', () => {
    beforeEach(() => {
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 10, y: 20 });
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));
    });

    it('below drag threshold produces no shape (returns null)', () => {
      const smallDelta = MARQUEE_MIN_DRAG_PX - 1;
      const result = gesture.end(ctx, 100 + smallDelta, 100 + smallDelta, false);
      expect(result).toBeNull();
      expect(ctx.svgManipulation.addShape).not.toHaveBeenCalled();
    });

    it('above drag threshold creates a shape (returns an ID)', () => {
      const largeDelta = MARQUEE_MIN_DRAG_PX + 10;
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });

      const result = gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, false);
      expect(result).toBe('shape-new');
      expect(ctx.svgManipulation.addShape).toHaveBeenCalled();
    });

    it('auto-selects the created shape', () => {
      const largeDelta = MARQUEE_MIN_DRAG_PX + 10;
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });

      gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, false);
      expect(ctx.shapeSelection.selectShapes).toHaveBeenCalled();
    });

    it('pushes AddShapeCommand to editor history', () => {
      const largeDelta = MARQUEE_MIN_DRAG_PX + 10;
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });

      gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, false);
      expect(ctx.editorHistory.pushAndExecute).toHaveBeenCalledTimes(1);
      const pushedCmd = (ctx.editorHistory.pushAndExecute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(pushedCmd.description).toBe('Create shape');
    });
  });

  describe('consumeJustEnded()', () => {
    it('returns true once after end, then false', () => {
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 10, y: 20 });
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));

      const smallDelta = MARQUEE_MIN_DRAG_PX - 1;
      gesture.end(ctx, 100 + smallDelta, 100 + smallDelta, false);

      expect(gesture.consumeJustEnded()).toBe(true);
      expect(gesture.consumeJustEnded()).toBe(false);
    });
  });
});
