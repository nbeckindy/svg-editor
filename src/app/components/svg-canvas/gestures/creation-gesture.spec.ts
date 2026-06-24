import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CreationGesture } from './creation-gesture';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import type { GestureRuntimeContext } from './gesture-context';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import { createDefaultTransformGestureDoc } from './transform-gesture-doc.port';

function createMockGestureRuntimeContext(): GestureRuntimeContext {
  const doc = {
    svgManipulation: {
      getSVGInstance: vi.fn(),
      addShape: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-1', type: 'rect' }),
      getShapeBBox: vi.fn().mockReturnValue({ x: 10, y: 20, width: 50, height: 30 }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn()
    },
    shapeSelection: {
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    },
    editorHistory: {
      pushAndExecute: vi.fn()
    }
  };
  const transformDoc = createDefaultTransformGestureDoc(
    doc.svgManipulation as unknown as SvgManipulationService,
    doc.shapeSelection as unknown as ShapeSelectionService,
    doc.editorHistory as unknown as EditorHistoryService
  );
  return {
    doc,
    transformDoc,
    pointer: {
      cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
      highlightOverlayContainer: signal(undefined),
      clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 10, y: 20 }),
      svgBboxToOverlayPixels: vi.fn((bbox: { x: number; y: number; width: number; height: number }) => bbox),
      invalidateHighlightCache: vi.fn(),
      setLastBbox: vi.fn()
    },
    snap: {
      snap: {
        snapToGrid: vi.fn((point: { x: number; y: number }) => point),
        snapDeltaToSmartGuides: vi.fn((_startBBox: unknown, rawDelta: { x: number; y: number }) => ({
          delta: rawDelta,
          guides: { vertical: [], horizontal: [] },
          matches: []
        })),
        shapeEnabled: vi.fn(() => false)
      },
      getSmartGuideCandidates: vi.fn(() => []),
      isSnapTemporarilyDisabled: vi.fn(() => false)
    }
  } as unknown as GestureRuntimeContext;
}

function installSvgFindOneMock(c: GestureRuntimeContext): void {
  const shapeNode = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  (c.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({
    findOne: vi.fn((sel: string) => {
      if (String(sel).includes('editor-content')) return null;
      if (String(sel).startsWith('#')) return { node: shapeNode };
      return null;
    })
  });
}

function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent;
}

describe('CreationGesture', () => {
  let gesture: CreationGesture;
  let ctx: GestureRuntimeContext;

  beforeEach(() => {
    gesture = new CreationGesture();
    ctx = createMockGestureRuntimeContext();
  });

  describe('start()', () => {
    it('returns true when SVG is initialized and tool is a creation tool', () => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      const ok = gesture.start(ctx, 'rect', makeMouseEvent(10, 20));
      expect(ok).toBe(true);
      expect(gesture.isActive).toBe(true);
    });

    it('returns false when SVG instance is null', () => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const ok = gesture.start(ctx, 'rect', makeMouseEvent(10, 20));
      expect(ok).toBe(false);
    });

    it('returns false for non-creation tools (e.g. selector)', () => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      const ok = gesture.start(ctx, 'selector', makeMouseEvent(10, 20));
      expect(ok).toBe(false);
    });

    it('sets isActive to true after successful start()', () => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      gesture.start(ctx, 'rect', makeMouseEvent(10, 20));
      expect(gesture.isActive).toBe(true);
    });
  });

  describe('move()', () => {
    beforeEach(() => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));
    });

    it('below drag threshold does not create ghost rect', () => {
      gesture.move(ctx, 100 + MARQUEE_MIN_DRAG_PX - 1, 100 + MARQUEE_MIN_DRAG_PX - 1, false);
      expect(gesture.ghostRect).toBeNull();
    });

    it('above drag threshold creates ghost rect', () => {
      gesture.move(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(gesture.ghostRect).not.toBeNull();
    });

    it('snaps creation preview to grid for rectangles', () => {
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 17, y: 29 });
      (ctx.snap.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 20, y: 30 });
      gesture.move(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.snap.snap.snapToGrid).toHaveBeenCalledWith({ x: 17, y: 29 });
    });

    it('applies smart-guide offset after grid snap when shape snap is enabled', () => {
      (ctx.snap.snap.shapeEnabled as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 37, y: 44 });
      (ctx.snap.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 40, y: 40 });
      (ctx.snap.snap.snapDeltaToSmartGuides as ReturnType<typeof vi.fn>).mockReturnValue({
        delta: { x: 2, y: -1 },
        guides: { vertical: [], horizontal: [] },
        matches: []
      });
      gesture.move(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.snap.snap.snapDeltaToSmartGuides).toHaveBeenCalled();
    });

    it('uses Shift constraints instead of snapping for line preview', () => {
      gesture = new CreationGesture();
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      gesture.start(ctx, 'line', makeMouseEvent(100, 100));
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 30, y: 40 });
      gesture.move(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, true);
      expect(ctx.snap.snap.snapToGrid).not.toHaveBeenCalled();
      expect(ctx.snap.snap.snapDeltaToSmartGuides).not.toHaveBeenCalled();
    });
  });

  describe('end()', () => {
    beforeEach(() => {
      installSvgFindOneMock(ctx);
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));
    });

    it('below drag threshold produces no shape (returns null)', () => {
      const id = gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX - 1, 100 + MARQUEE_MIN_DRAG_PX - 1, false);
      expect(id).toBeNull();
      expect(ctx.doc.svgManipulation.addShape).not.toHaveBeenCalled();
    });

    it('above drag threshold creates a shape (returns an ID)', () => {
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });
      const id = gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.doc.svgManipulation.addShape).toHaveBeenCalled();
      expect(id).toBe('shape-new');
    });

    it('auto-selects the created shape', () => {
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.doc.shapeSelection.selectShapes).toHaveBeenCalled();
    });

    it('pushes AddShapeCommand to editor history', () => {
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('shape-new');
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 80, y: 90 });
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.doc.editorHistory.pushAndExecute).toHaveBeenCalledTimes(1);
      const pushedCmd = (ctx.doc.editorHistory.pushAndExecute as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(pushedCmd).toBeDefined();
    });

    it('creates snapped ellipse attributes with grid + smart-guide enabled', () => {
      gesture = new CreationGesture();
      installSvgFindOneMock(ctx);
      gesture.start(ctx, 'ellipse', makeMouseEvent(100, 100));
      (ctx.snap.snap.shapeEnabled as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 37, y: 44 });
      (ctx.snap.snap.snapToGrid as ReturnType<typeof vi.fn>).mockReturnValue({ x: 40, y: 40 });
      (ctx.snap.snap.snapDeltaToSmartGuides as ReturnType<typeof vi.fn>).mockReturnValue({
        delta: { x: 1, y: 0 },
        guides: { vertical: [], horizontal: [] },
        matches: []
      });
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('ellipse-new');
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, false);
      expect(ctx.doc.svgManipulation.addShape).toHaveBeenCalledWith('ellipse', expect.any(Object));
    });

    it('uses Shift circle constraint over snap for ellipse creation', () => {
      gesture = new CreationGesture();
      installSvgFindOneMock(ctx);
      gesture.start(ctx, 'ellipse', makeMouseEvent(100, 100));
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 25, y: 40 });
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('ellipse-new');
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, true);
      expect(ctx.snap.snap.snapToGrid).not.toHaveBeenCalled();
      expect(ctx.doc.svgManipulation.addShape).toHaveBeenCalledWith('ellipse', expect.any(Object));
    });

    it('uses Shift 45-degree constraint over snap for line creation', () => {
      gesture = new CreationGesture();
      installSvgFindOneMock(ctx);
      let ptCall = 0;
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockImplementation(() => {
        ptCall += 1;
        return ptCall === 1 ? { x: 100, y: 100 } : { x: 30, y: 40 };
      });
      gesture.start(ctx, 'line', makeMouseEvent(100, 100));
      (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mockReturnValue('line-new');
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX + 5, 100 + MARQUEE_MIN_DRAG_PX + 5, true);
      expect(ctx.snap.snap.snapToGrid).not.toHaveBeenCalled();
      const [, lineAttrs] = (ctx.doc.svgManipulation.addShape as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(lineAttrs).toEqual(expect.objectContaining({ x1: 100, y1: 100 }));
    });
  });

  describe('consumeJustEnded()', () => {
    it('returns true once after end, then false', () => {
      (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue({});
      gesture.start(ctx, 'rect', makeMouseEvent(100, 100));
      (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 10, y: 20 });
      gesture.end(ctx, 100 + MARQUEE_MIN_DRAG_PX - 1, 100 + MARQUEE_MIN_DRAG_PX - 1, false);
      expect(gesture.consumeJustEnded()).toBe(true);
      expect(gesture.consumeJustEnded()).toBe(false);
    });
  });
});
