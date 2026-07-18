import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResizeGesture } from './resize-gesture';
import { GhostSession } from './ghost-session';
import type { GestureRuntimeContext } from './gesture-context';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import { createDefaultTransformGestureDoc } from './transform-gesture-doc.port';

function createResizeContext(): GestureRuntimeContext {
  const doc = {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
      snapshotVectorEffectsForShapes: vi.fn().mockReturnValue(new Map()),
      snapshotTextScaleAttrs: vi.fn().mockReturnValue(new Map()),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids),
      getShapeBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false)
    },
    shapeSelection: {
      getSelectedShapes: vi.fn().mockReturnValue([{ id: 'shape-a', type: 'rect' }])
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
      clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 50, y: 50 }),
      svgBboxToOverlayPixels: vi.fn((bbox) => bbox),
      invalidateHighlightCache: vi.fn(),
      setLastBbox: vi.fn()
    },
    snap: {
      snap: {
        shapeEnabled: vi.fn(() => false),
        snapDeltaToSmartGuides: vi.fn()
      } as never,
      getSmartGuideCandidates: vi.fn(() => []),
      isSnapTemporarilyDisabled: vi.fn(() => false)
    }
  } as unknown as GestureRuntimeContext;
}

describe('ResizeGesture', () => {
  let gesture: ResizeGesture;
  let ctx: GestureRuntimeContext;

  beforeEach(() => {
    vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([
      {
        outerGroup: { matrix: vi.fn(), remove: vi.fn() },
        nestedSvg: { attr: vi.fn(), viewbox: vi.fn(), size: vi.fn() },
        worldToUnion: { matrix: vi.fn() }
      }
    ] as never);
    vi.spyOn(GhostSession.prototype, 'removeFragments').mockImplementation(() => undefined);
    gesture = new ResizeGesture();
    ctx = createResizeContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('start returns false when nothing is selected', () => {
    (ctx.doc.shapeSelection.getSelectedShapes as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const ok = gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
    expect(gesture.isActive).toBe(false);
  });

  it('start returns false when union bbox is unavailable', () => {
    (ctx.doc.svgManipulation.getUnionBBox as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const ok = gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
  });

  it('start returns false when SVG instance is missing', () => {
    (ctx.doc.svgManipulation.getSVGInstance as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const ok = gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
  });

  it('start returns false when ghost fragments are empty', () => {
    vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([]);
    const ok = gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(false);
  });

  it('start activates when preconditions are met', () => {
    const ok = gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent);
    expect(ok).toBe(true);
    expect(gesture.isActive).toBe(true);
    expect(ctx.doc.svgManipulation.setShapeVisibility).toHaveBeenCalled();
  });

  it('end commits TextUniformScaleCommand for text-only selection', () => {
    (ctx.doc.shapeSelection.getSelectedShapes as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 't1', type: 'text' }
    ]);
    (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 200, y: 200 });
    expect(gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent)).toBe(true);
    gesture.move(ctx, 200, 200, false, false);
    gesture.end(ctx, false);
    expect(ctx.doc.editorHistory.pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = (ctx.doc.editorHistory.pushAndExecute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cmd.description).toBe('Resize text');
    expect(ctx.doc.svgManipulation.snapshotTextScaleAttrs).toHaveBeenCalled();
  });

  it('end commits UnionScaleCommand for non-text selection', () => {
    expect(gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent)).toBe(true);
    gesture.move(ctx, 150, 150, false, false);
    gesture.end(ctx, false);
    const cmd = (ctx.doc.editorHistory.pushAndExecute as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(cmd.description).toBe('Resize shapes');
  });

  it('text-only move aspect-locks without Shift (union stays proportional)', () => {
    (ctx.doc.shapeSelection.getSelectedShapes as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 't1', type: 'text' }
    ]);
    (ctx.doc.svgManipulation.getUnionBBox as ReturnType<typeof vi.fn>).mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 50
    });
    // Drag SE toward a non-diagonal point; aspect lock should keep height/width = 0.5
    (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue({ x: 200, y: 80 });
    expect(gesture.start(ctx, 'se', { clientX: 0, clientY: 0 } as MouseEvent)).toBe(true);
    gesture.move(ctx, 200, 80, false, false);
    const overlay = gesture.overlayRect;
    expect(overlay).toBeTruthy();
    expect(overlay!.width / overlay!.height).toBeCloseTo(2, 5);
  });
});
