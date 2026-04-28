import { signal } from '@angular/core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RotateGesture, buildRotateGestureCursorCss } from './rotate-gesture';
import { GhostSession } from './ghost-session';
import type { GestureContext } from './gesture-context';

function createMockGestureContext(): GestureContext {
  return {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 100, height: 100 }),
      getSelectionRotationPivot: vi.fn().mockReturnValue(null),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids),
    },
    shapeSelection: {
      getSelectedShapes: vi.fn().mockReturnValue([{ id: 'shape-a' }]),
    },
    editorHistory: {
      pushAndExecute: vi.fn(),
    },
    canvasView: {},
    snap: {},
    cdr: { detectChanges: vi.fn(), markForCheck: vi.fn() },
    svgContainer: signal(undefined),
    zoomWrapper: signal(undefined),
    highlightOverlayContainer: signal(undefined),
    overlayViewBox: '0 0 100 100',
    clientToEditorSvgPoint: vi.fn().mockReturnValue({ x: 50, y: 0 }),
    svgBboxToOverlayPixels: vi.fn((bbox) => bbox),
    getSmartGuideCandidates: vi.fn(() => []),
    isSnapTemporarilyDisabled: vi.fn(() => false),
    invalidateHighlightCache: vi.fn(),
    setLastBbox: vi.fn(),
  } as unknown as GestureContext;
}

function makeMouseEvent(clientX: number, clientY: number): MouseEvent {
  return { clientX, clientY } as MouseEvent;
}

describe('buildRotateGestureCursorCss', () => {
  it('uses a data URL and lists grab as the CSS fallback', () => {
    const css = buildRotateGestureCursorCss();
    expect(css).toContain('data:image/svg+xml');
    expect(css).toMatch(/,\s*grab\s*$/);
  });
});

describe('RotateGesture', () => {
  let gesture: RotateGesture;
  let ctx: GestureContext;
  let ghostSpy: ReturnType<typeof vi.spyOn>;

  const fakeFragment = {
    outerGroup: { remove: vi.fn() },
    nestedSvg: {},
    worldToUnion: { matrix: vi.fn() },
  };

  beforeEach(() => {
    gesture = new RotateGesture();
    ctx = createMockGestureContext();
    ghostSpy = vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([fakeFragment as never]);
    document.body.style.cursor = 'crosshair';
  });

  afterEach(() => {
    ghostSpy.mockRestore();
    document.body.style.cursor = '';
  });

  it('sets body cursor on successful start and restores on end', () => {
    expect(gesture.start(ctx, makeMouseEvent(10, 10))).toBe(true);
    expect(document.body.style.cursor).toContain('data:image/svg+xml');

    gesture.end(ctx);

    expect(document.body.style.cursor).toBe('crosshair');
    expect(ctx.editorHistory.pushAndExecute).toHaveBeenCalled();
  });

  it('restores body cursor on cancel', () => {
    expect(gesture.start(ctx, makeMouseEvent(0, 0))).toBe(true);
    expect(document.body.style.cursor).not.toBe('crosshair');

    gesture.cancel(ctx);

    expect(document.body.style.cursor).toBe('crosshair');
  });

  it('does not change body cursor when start fails before activation', () => {
    (ctx.clientToEditorSvgPoint as ReturnType<typeof vi.fn>).mockReturnValue(null);

    expect(gesture.start(ctx, makeMouseEvent(0, 0))).toBe(false);

    expect(document.body.style.cursor).toBe('crosshair');
  });
});
