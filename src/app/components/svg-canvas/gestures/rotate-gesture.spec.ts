import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RotateGesture, buildRotateGestureCursorCss } from './rotate-gesture';
import { GhostSession } from './ghost-session';
import type { GestureRuntimeContext } from './gesture-context';
import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import { createDefaultTransformGestureDoc } from './transform-gesture-doc.port';

function createMockGestureRuntimeContext(): GestureRuntimeContext {
  const doc = {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      getSelectionRotationPivot: vi.fn().mockReturnValue(null),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids),
      getShapeBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false)
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
      clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 50, y: 0 }),
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

function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent;
}

describe('buildRotateGestureCursorCss', () => {
  it('uses a data URL and lists grab as the CSS fallback', () => {
    const css = buildRotateGestureCursorCss();
    expect(css).toContain('data:image/svg+xml');
    expect(css).toContain('grab');
  });
});

describe('RotateGesture', () => {
  let gesture: RotateGesture;
  let ctx: GestureRuntimeContext;

  beforeEach(() => {
    vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([
      {
        outerGroup: { matrix: vi.fn(), remove: vi.fn() },
        nestedSvg: { attr: vi.fn(), viewbox: vi.fn() },
        worldToUnion: { matrix: vi.fn() }
      }
    ] as never);
    gesture = new RotateGesture();
    ctx = createMockGestureRuntimeContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.cursor = '';
  });

  it('sets body cursor on successful start and restores on end', () => {
    const ok = gesture.start(ctx, makeMouseEvent(10, 10));
    expect(ok).toBe(true);
    expect(document.body.style.cursor).not.toBe('');
    gesture.end(ctx);
    expect(document.body.style.cursor).toBe('');
  });

  it('restores body cursor on cancel', () => {
    gesture.start(ctx, makeMouseEvent(10, 10));
    gesture.cancel(ctx);
    expect(document.body.style.cursor).toBe('');
  });

  it('does not change body cursor when start fails before activation', () => {
    (ctx.pointer.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const prior = document.body.style.cursor;
    const ok = gesture.start(ctx, makeMouseEvent(10, 10));
    expect(ok).toBe(false);
    expect(document.body.style.cursor).toBe(prior);
  });
});
