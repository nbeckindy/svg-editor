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
    snap: {
      snapToGrid: vi.fn((point) => point),
      snapDeltaToSmartGuides: vi.fn((_startBBox, rawDelta) => ({
        delta: rawDelta,
        guides: { vertical: [], horizontal: [] },
        matches: []
      })),
      shapeEnabled: vi.fn(() => false)
    },
    getSmartGuideCandidates: vi.fn(() => []),
    isSnapTemporarilyDisabled: vi.fn(() => false),
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

    it('snaps creation preview to grid for rectangles', () => {
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 17, y: 29 });
      (ctx.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 20, y: 30 });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.move(ctx, 100 + largeDelta, 100 + largeDelta, false);

      expect(ctx.snap.snapToGrid).toHaveBeenCalledWith({ x: 17, y: 29 });
      expect(gesture.ghostRect).toEqual({ x: 10, y: 20, width: 10, height: 10 });
    });

    it('applies smart-guide offset after grid snap when shape snap is enabled', () => {
      (ctx.snap.shapeEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 37, y: 44 });
      (ctx.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 40, y: 40 });
      (ctx.snap.snapDeltaToSmartGuides as ReturnType<typeof vi.fn>).mockReturnValue({
        delta: { x: -2, y: 3 },
        guides: { vertical: [38], horizontal: [43] },
        matches: []
      });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.move(ctx, 100 + largeDelta, 100 + largeDelta, false);

      expect(ctx.snap.snapDeltaToSmartGuides).toHaveBeenCalled();
      expect(gesture.ghostRect).toEqual({ x: 10, y: 20, width: 28, height: 23 });
    });

    it('uses Shift constraints instead of snapping for line preview', () => {
      gesture.start(ctx, 'line', makeMouseEvent(100, 100));
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 30, y: 40 });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.move(ctx, 100 + largeDelta, 100 + largeDelta, true);

      expect(ctx.snap.snapToGrid).not.toHaveBeenCalled();
      expect(ctx.snap.snapDeltaToSmartGuides).not.toHaveBeenCalled();
      expect(gesture.ghostLineStart).toEqual({ x: 10, y: 20 });
      expect(gesture.ghostLineEnd?.x).toBeCloseTo(30);
      expect(gesture.ghostLineEnd?.y).toBeCloseTo(40);
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

    it('creates snapped ellipse attributes with grid + smart-guide enabled', () => {
      gesture.start(ctx, 'ellipse', makeMouseEvent(100, 100));
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('ellipse-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 37, y: 44 });
      (ctx.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 40, y: 40 });
      (ctx.snap.shapeEnabled as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.snap.snapDeltaToSmartGuides as ReturnType<typeof vi.fn>).mockReturnValue({
        delta: { x: -2, y: 3 },
        guides: { vertical: [38], horizontal: [43] },
        matches: []
      });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, false);

      expect(ctx.svgManipulation.addShape).toHaveBeenCalledWith('ellipse', {
        cx: 24,
        cy: 31.5,
        rx: 14,
        ry: 11.5
      });
    });

    it('uses Shift circle constraint over snap for ellipse creation', () => {
      gesture.start(ctx, 'ellipse', makeMouseEvent(100, 100));
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('ellipse-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 25, y: 40 });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, true);

      expect(ctx.snap.snapToGrid).not.toHaveBeenCalled();
      expect(ctx.svgManipulation.addShape).toHaveBeenCalledWith('ellipse', {
        cx: 20,
        cy: 30,
        rx: 10,
        ry: 10
      });
    });

    it('uses Shift 45-degree constraint over snap for line creation', () => {
      gesture.start(ctx, 'line', makeMouseEvent(100, 100));
      (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('line-new');
      (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 30, y: 40 });
      const largeDelta = MARQUEE_MIN_DRAG_PX + 20;

      gesture.end(ctx, 100 + largeDelta, 100 + largeDelta, true);

      expect(ctx.snap.snapToGrid).not.toHaveBeenCalled();
      const [, lineAttrs] = (ctx.svgManipulation.addShape as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(lineAttrs).toMatchObject({ x1: 10, y1: 20 });
      expect(lineAttrs.x2).toBeCloseTo(30);
      expect(lineAttrs.y2).toBeCloseTo(40);
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
