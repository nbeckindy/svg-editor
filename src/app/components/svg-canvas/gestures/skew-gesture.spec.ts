import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SkewGesture } from './skew-gesture';
import { GhostSession } from './ghost-session';
import type { GestureRuntimeContext } from './gesture-context';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import { createDefaultTransformGestureDoc } from './transform-gesture-doc.port';

function createSkewContext(): GestureRuntimeContext {
  const doc = {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids)
    },
    shapeSelection: {
      getSelectedShapes: vi.fn().mockReturnValue([{ id: 'shape-a' }])
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
      clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 10, y: 10 }),
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

describe('SkewGesture', () => {
  let gesture: SkewGesture;
  let ctx: GestureRuntimeContext;

  beforeEach(() => {
    vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([
      {
        outerGroup: { matrix: vi.fn(), remove: vi.fn() },
        nestedSvg: { attr: vi.fn(), viewbox: vi.fn() },
        worldToUnion: { matrix: vi.fn() }
      }
    ] as never);
    vi.spyOn(GhostSession.prototype, 'removeFragments').mockImplementation(() => undefined);
    gesture = new SkewGesture();
    ctx = createSkewContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start returns false when client point cannot be mapped', () => {
    (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const ok = gesture.start(ctx, 'n', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
    expect(gesture.isActive).toBe(false);
  });

  it('start returns false when SVG instance is missing', () => {
    (ctx.transformDoc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const ok = gesture.start(ctx, 'n', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
  });

  it('start activates when preconditions are met', () => {
    const ok = gesture.start(ctx, 'n', { clientX: 5, clientY: 5 } as MouseEvent);
    expect(ok).toBe(true);
    expect(gesture.isActive).toBe(true);
  });

  it('end does not push history when skew angle stayed at zero', () => {
    expect(gesture.start(ctx, 'n', { clientX: 0, clientY: 0 } as MouseEvent)).toBe(true);
    gesture.end(ctx);
    expect(ctx.doc.editorHistory.pushAndExecute).not.toHaveBeenCalled();
    expect(gesture.isActive).toBe(false);
  });
});
