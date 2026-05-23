import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DragGesture } from './drag-gesture';
import { GhostSession } from './ghost-session';
import type { GestureRuntimeContext } from './gesture-context';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import { createDefaultTransformGestureDoc } from './transform-gesture-doc.port';

function createMultiSelectDragContext(): GestureRuntimeContext {
  const doc = {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids)
    },
    shapeSelection: {
      getSelectedShapes: vi.fn().mockReturnValue([{ id: 'a' }, { id: 'b' }])
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
      clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 5, y: 5 }),
      svgBboxToOverlayPixels: vi.fn((bbox) => bbox),
      invalidateHighlightCache: vi.fn(),
      setLastBbox: vi.fn()
    },
    snap: {
      snap: {
        snapDelta: vi.fn((_, d: { x: number; y: number }) => d),
        shapeEnabled: vi.fn(() => false),
        snapDeltaToSmartGuides: vi.fn(() => ({ delta: { x: 0, y: 0 }, guides: { vertical: [], horizontal: [] } }))
      },
      getSmartGuideCandidates: vi.fn(() => []),
      isSnapTemporarilyDisabled: vi.fn(() => false)
    }
  } as unknown as GestureRuntimeContext;
}

describe('DragGesture', () => {
  let gesture: DragGesture;
  let ctx: GestureRuntimeContext;

  beforeEach(() => {
    vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([
      {
        outerGroup: { matrix: vi.fn() },
        nestedSvg: { attr: vi.fn(), viewbox: vi.fn() },
        worldToUnion: { matrix: vi.fn() }
      }
    ] as never);
    vi.spyOn(GhostSession.prototype, 'removeFragments').mockImplementation(() => undefined);
    gesture = new DragGesture();
    ctx = createMultiSelectDragContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start returns false when there is no SVG instance', () => {
    (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const ok = gesture.start(
      ctx,
      ['a', 'b'],
      'a',
      { x: 1, y: 2 },
      { target: document.createElement('div') } as unknown as MouseEvent
    );
    expect(ok).toBe(false);
    expect(gesture.isActive).toBe(false);
  });

  it('start activates for union drag when ghost fragments build', () => {
    const ok = gesture.start(
      ctx,
      ['a', 'b'],
      'a',
      { x: 1, y: 2 },
      { target: document.createElement('div') } as unknown as MouseEvent
    );
    expect(ok).toBe(true);
    expect(gesture.isActive).toBe(true);
    expect(ctx.doc.svgManipulation.setShapeVisibility).toHaveBeenCalled();
  });

  it('end pushes translate command and clears active state', () => {
    expect(
      gesture.start(
        ctx,
        ['a', 'b'],
        'a',
        { x: 0, y: 0 },
        { target: document.createElement('div') } as unknown as MouseEvent
      )
    ).toBe(true);
    gesture.move(ctx, 10, 10, false);
    gesture.end(ctx, 10, 10, false);
    expect(ctx.doc.editorHistory.pushAndExecute).toHaveBeenCalled();
    expect(gesture.isActive).toBe(false);
  });

  it('cancel restores visibility without pushing history', () => {
    expect(
      gesture.start(
        ctx,
        ['a', 'b'],
        'a',
        { x: 0, y: 0 },
        { target: document.createElement('div') } as unknown as MouseEvent
      )
    ).toBe(true);
    gesture.cancel(ctx);
    expect(ctx.doc.editorHistory.pushAndExecute).not.toHaveBeenCalled();
    expect(gesture.isActive).toBe(false);
  });
});
