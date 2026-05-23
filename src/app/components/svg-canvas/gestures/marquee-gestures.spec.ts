import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionMarqueeGesture } from './selection-marquee-gesture';
import { ZoomMarqueeGesture } from './zoom-marquee-gesture';
import type { GestureRuntimeContext } from './gesture-context';

function createContext(): GestureRuntimeContext {
  const doc = {
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
    }
  };
  return {
    doc,
    transformDoc: doc,
    pointer: {
      cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() } as never,
      highlightOverlayContainer: signal(undefined),
      clientToEditorSvgPoint: vi.fn((x: number, y: number) => ({ x, y })),
      svgBboxToOverlayPixels: vi.fn((bbox) => bbox),
      invalidateHighlightCache: vi.fn(),
      setLastBbox: vi.fn()
    },
    snap: {
      snap: {} as never,
      getSmartGuideCandidates: vi.fn(() => []),
      isSnapTemporarilyDisabled: vi.fn(() => false)
    }
  } as unknown as GestureRuntimeContext;
}

describe('SelectionMarqueeGesture', () => {
  let ctx: GestureRuntimeContext;
  let gesture: SelectionMarqueeGesture;

  beforeEach(() => {
    ctx = createContext();
    gesture = new SelectionMarqueeGesture();
  });

  it('selects expanded hits for non-tiny drag', () => {
    const hitA = { id: 'a' } as never;
    const hitB = { id: 'b' } as never;
    (ctx.doc.svgManipulation.getShapePropertiesIntersectingRect as ReturnType<typeof vi.fn>).mockReturnValue([hitA]);
    (ctx.doc.svgManipulation.expandSelectionByClipGroups as ReturnType<typeof vi.fn>).mockReturnValue([hitA, hitB]);
    gesture.startAt(0, 0);
    gesture.move(200, 200, ctx);
    gesture.endAt(200, 200, false, ctx);
    expect(ctx.doc.shapeSelection.selectShapes).toHaveBeenCalledWith([hitA, hitB]);
  });

  it('does not select anything for tiny drag', () => {
    gesture.startAt(0, 0);
    gesture.move(1, 1, ctx);
    gesture.endAt(1, 1, false, ctx);
    expect(ctx.doc.shapeSelection.selectShapes).not.toHaveBeenCalled();
    expect(ctx.doc.shapeSelection.mergeShapesIntoSelection).not.toHaveBeenCalled();
  });
});

describe('ZoomMarqueeGesture', () => {
  it('computes rect and maps to svg coordinates', () => {
    const g = new ZoomMarqueeGesture();
    g.startAt(10, 20);
    g.move(30, 40);
    const rawRect = { left: 0, top: 0, width: 100, height: 100 } as DOMRect;
    const svgRect = g.toSvgRect(rawRect, 2);
    expect(svgRect).toEqual({ x: 5, y: 10, width: 10, height: 10 });
  });

  it('tracks just-ended only for applied zoom', () => {
    const g = new ZoomMarqueeGesture();
    g.startAt(0, 0);
    g.move(10, 10);
    g.finish(true);
    expect(g.consumeJustEnded()).toBe(true);
    expect(g.consumeJustEnded()).toBe(false);
  });
});
