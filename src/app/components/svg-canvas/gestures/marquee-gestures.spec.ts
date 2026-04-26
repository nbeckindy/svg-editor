import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionMarqueeGesture } from './selection-marquee-gesture';
import { ZoomMarqueeGesture } from './zoom-marquee-gesture';
import type { GestureContext } from './gesture-context';

function createContext(): GestureContext {
  return {
    svgManipulation: {
      getShapePropertiesIntersectingRect: vi.fn(),
      expandSelectionByClipGroups: vi.fn((hits) => hits),
      clearHighlight: vi.fn()
    },
    shapeSelection: {
      mergeShapesIntoSelection: vi.fn(),
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    },
    editorHistory: {
      pushAndExecute: vi.fn()
    },
    canvasView: {} as never,
    cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() } as never,
    svgContainer: signal(undefined),
    zoomWrapper: signal(undefined),
    highlightOverlayContainer: signal(undefined),
    overlayViewBox: '0 0 100 100',
    clientToEditorSvgPoint: vi.fn((x: number, y: number) => ({ x, y })),
    svgBboxToOverlayPixels: vi.fn((bbox) => bbox),
    invalidateHighlightCache: vi.fn(),
    setLastBbox: vi.fn()
  } as unknown as GestureContext;
}

describe('SelectionMarqueeGesture', () => {
  let ctx: GestureContext;
  let gesture: SelectionMarqueeGesture;

  beforeEach(() => {
    ctx = createContext();
    gesture = new SelectionMarqueeGesture();
  });

  it('selects expanded hits for non-tiny drag', () => {
    const hitA = { id: 'a' } as never;
    const hitB = { id: 'b' } as never;
    (ctx.svgManipulation.getShapePropertiesIntersectingRect as ReturnType<typeof vi.fn>).mockReturnValue([hitA]);
    (ctx.svgManipulation.expandSelectionByClipGroups as ReturnType<typeof vi.fn>).mockReturnValue([hitA, hitB]);

    gesture.startAt(10, 20);
    gesture.move(100, 120, ctx);
    gesture.endAt(100, 120, false, ctx);

    expect(ctx.shapeSelection.selectShapes).toHaveBeenCalledWith([hitA, hitB]);
    expect(gesture.consumeJustEnded()).toBe(true);
    expect(gesture.consumeJustEnded()).toBe(false);
  });

  it('does not select anything for tiny drag', () => {
    gesture.startAt(10, 20);
    gesture.endAt(11, 21, false, ctx);
    expect(ctx.shapeSelection.selectShapes).not.toHaveBeenCalled();
    expect(ctx.shapeSelection.mergeShapesIntoSelection).not.toHaveBeenCalled();
    expect(gesture.consumeJustEnded()).toBe(false);
  });
});

describe('ZoomMarqueeGesture', () => {
  let gesture: ZoomMarqueeGesture;

  beforeEach(() => {
    gesture = new ZoomMarqueeGesture();
  });

  it('computes rect and maps to svg coordinates', () => {
    gesture.startAt(20, 40);
    gesture.move(120, 160);
    const svgRect = gesture.toSvgRect(new DOMRect(10, 20, 200, 200), 2);

    expect(svgRect).toEqual({
      x: 5,
      y: 10,
      width: 50,
      height: 60
    });
  });

  it('tracks just-ended only for applied zoom', () => {
    gesture.startAt(10, 10);
    gesture.move(80, 80);
    gesture.finish(true);
    expect(gesture.consumeJustEnded()).toBe(true);
    expect(gesture.consumeJustEnded()).toBe(false);

    gesture.startAt(10, 10);
    gesture.move(12, 12);
    gesture.finish(false);
    expect(gesture.consumeJustEnded()).toBe(false);
  });
});
