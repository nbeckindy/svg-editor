import { describe, it, expect, vi } from 'vitest';
import { MARQUEE_MIN_DRAG_PX } from '../../../utils/marquee-selection';
import { PenToolSession, type PenToolSessionPorts } from './pen-tool-session';

function minimalPorts(overrides: Partial<PenToolSessionPorts> = {}): PenToolSessionPorts {
  const confirmDiscardInProgressPath = vi.fn(() => true);
  return {
    markForCheck: vi.fn(),
    getCurrentTool: () => 'pen',
    isPenAltCurveMode: () => false,
    setPenAltCurveMode: vi.fn(),
    setTool: vi.fn(),
    clientToEditorSvgPoint: vi.fn(() => ({ x: 10, y: 20 })),
    svgBboxToOverlayPixels: (bbox) => ({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }),
    parseOverlayViewBox: () => ({ vbMinX: 0, vbMinY: 0, vbW: 100, vbH: 100 }),
    getMainSvgElement: () => null,
    confirmDiscardInProgressPath,
    svgManipulation: {
      getSVGInstance: () => null,
      getLayerStackItems: () => [],
      updatePathData: vi.fn(),
      insertPathIntoContentGroup: vi.fn(() => null),
      getShapeBBox: vi.fn(),
      setShapeVisibility: vi.fn()
    } as unknown as PenToolSessionPorts['svgManipulation'],
    shapeSelection: {
      selectShape: vi.fn(),
      getSelectedShapes: vi.fn(() => [])
    } as unknown as PenToolSessionPorts['shapeSelection'],
    editorHistory: {
      pushAndExecute: vi.fn(),
      discardWhere: vi.fn()
    } as unknown as PenToolSessionPorts['editorHistory'],
    penBackspaceShortcutShouldDefer: () => false,
    setLastBbox: vi.fn(),
    clearHighlightRectCache: vi.fn(),
    isEditorContentShapeTarget: () => false,
    getPenPathInsertToleranceSvg: () => 8,
    getPathDForId: () => null,
    commitPenInsertOnExistingPath: vi.fn(),
    clearPenPostInsertAnchorOverlay: vi.fn(),
    clearSelectionForPenBackgroundStroke: vi.fn(),
    isCanvasReadyForPenInput: () => true,
    armPenClosePostNodeEditEmptyClickSelectionGuard: vi.fn(),
    ...overrides
  };
}

describe('PenToolSession', () => {
  it('confirmDiscardPenSessionIfNeeded returns true without calling confirm when session empty', () => {
    const ports = minimalPorts();
    const session = new PenToolSession(ports);
    expect(session.confirmDiscardPenSessionIfNeeded('tool switch')).toBe(true);
    expect(ports.confirmDiscardInProgressPath).not.toHaveBeenCalled();
  });

  it('confirmDiscardPenSessionIfNeeded clears session when user confirms', () => {
    const ports = minimalPorts();
    const session = new PenToolSession(ports);
    const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
    expect(session.isPenSessionActive).toBe(true);

    vi.mocked(ports.confirmDiscardInProgressPath).mockReturnValue(true);
    expect(session.confirmDiscardPenSessionIfNeeded('tool switch')).toBe(true);
    expect(ports.confirmDiscardInProgressPath).toHaveBeenCalledWith('tool switch');
    expect(session.isPenSessionActive).toBe(false);
  });

  it('confirmDiscardPenSessionIfNeeded keeps session when user declines', () => {
    const ports = minimalPorts();
    const session = new PenToolSession(ports);
    const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
    expect(session.isPenSessionActive).toBe(true);

    vi.mocked(ports.confirmDiscardInProgressPath).mockReturnValue(false);
    expect(session.confirmDiscardPenSessionIfNeeded('document replace/load')).toBe(false);
    expect(session.isPenSessionActive).toBe(true);
  });

  it('tryPenBackspaceShortcut returns false when path/inline editors should defer', () => {
    const ports = minimalPorts({
      penBackspaceShortcutShouldDefer: () => true
    });
    const session = new PenToolSession(ports);
    const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
    expect(session.tryPenBackspaceShortcut()).toBe(false);
  });

  it('hides the document path during insert-on-path drag and restores on cancel', () => {
    const setShapeVisibility = vi.fn();
    const ports = minimalPorts({
      isEditorContentShapeTarget: () => true,
      getPathDForId: (id: string) => (id === 'p1' ? 'M 0 0 L 100 0' : null),
      clientToEditorSvgPoint: (cx: number, cy: number) => ({ x: cx, y: cy }),
      svgManipulation: {
        getSVGInstance: () => null,
        getLayerStackItems: () => [],
        updatePathData: vi.fn(),
        insertPathIntoContentGroup: vi.fn(() => null),
        getShapeBBox: vi.fn(),
        setShapeVisibility
      } as unknown as PenToolSessionPorts['svgManipulation']
    });
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.id = 'p1';
    const session = new PenToolSession(ports);
    const down = new MouseEvent('mousedown', { clientX: 40, clientY: 0, button: 0, detail: 1 });
    vi.spyOn(down, 'target', 'get').mockReturnValue(path);
    session.onCanvasPenPrimaryMouseDown(down, () => ({ x: 40, y: 0 }));
    expect(session.isPenInsertOnPathDragActive).toBe(true);
    expect(setShapeVisibility).toHaveBeenCalledWith('p1', false);
    session.cancelPenInsertOnPathDrag();
    expect(setShapeVisibility).toHaveBeenCalledWith('p1', true);
  });

  it('calls clearSelectionForPenBackgroundStroke when idle pen starts a new stroke on empty canvas', () => {
    const clearSelectionForPenBackgroundStroke = vi.fn();
    const ports = minimalPorts({
      clearSelectionForPenBackgroundStroke,
      isEditorContentShapeTarget: () => false
    });
    const session = new PenToolSession(ports);
    const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
    expect(clearSelectionForPenBackgroundStroke).toHaveBeenCalled();
    expect(session.isPenSessionActive).toBe(true);
  });

  it('first-anchor drag: full path preview is M-only, no curve d, mirrored handle overlays', () => {
    const ports = minimalPorts({
      clientToEditorSvgPoint: vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }))
    });
    const session = new PenToolSession(ports);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, detail: 1 }),
      () => ({ x: 0, y: 0 })
    );
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 12, clientY: 10, button: 0 }),
      () => ({ x: 50, y: 10 })
    );
    expect(session.penSessionPreviewPathD).toMatch(/^M\s+0\s+0$/);
    expect(session.penCurvePreviewPathD).toBeNull();
    expect(session.penFirstAnchorMirroredHandleDragActive).toBe(true);
    expect(session.penCurveHandleOverlays.length).toBe(2);
  });

  it('first-segment meaningful handle drag + mouseup keeps M until second primary down+up commits C', () => {
    const ports = minimalPorts({
      clientToEditorSvgPoint: vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }))
    });
    const session = new PenToolSession(ports);
    const down = new MouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(down, () => ({ x: 0, y: 0 }));
    const dragPx = MARQUEE_MIN_DRAG_PX + 4;
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 10 + dragPx, clientY: 10, button: 0 }),
      () => ({ x: 50, y: 10 })
    );
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 10 + dragPx, clientY: 10, button: 0 })
    );
    const segsAfterUp = session.getPenSessionSegments();
    expect(segsAfterUp.length).toBe(1);
    expect(segsAfterUp[0].type).toBe('M');

    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 200, clientY: 30, button: 0, detail: 1 }),
      () => ({ x: 200, y: 30 })
    );
    expect(session.getPenSessionSegments().length).toBe(1);
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 200, clientY: 30, button: 0 })
    );
    const segsAfterP3 = session.getPenSessionSegments();
    expect(segsAfterP3.length).toBe(2);
    expect(segsAfterP3[1].type).toBe('C');
    const firstC = segsAfterP3[1];
    if (firstC.type === 'C') {
      expect(firstC.x2).toBeCloseTo(firstC.x, 5);
      expect(firstC.y2).toBeCloseTo(firstC.y, 5);
    }
  });

  it('post-P3 plant-at-tip: drag shows mirrored handles only; mouseup freezes; next mousedown commits second C', () => {
    const ports = minimalPorts({
      clientToEditorSvgPoint: vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }))
    });
    const session = new PenToolSession(ports);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, detail: 1 }),
      () => ({ x: 0, y: 0 })
    );
    const dragPx = MARQUEE_MIN_DRAG_PX + 4;
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 10 + dragPx, clientY: 10, button: 0 }),
      () => ({ x: 50, y: 10 })
    );
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 10 + dragPx, clientY: 10, button: 0 })
    );
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 200, clientY: 30, button: 0, detail: 1 }),
      () => ({ x: 200, y: 30 })
    );
    expect(session.getPenSessionSegments().length).toBe(1);
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 200, clientY: 30, button: 0 })
    );
    expect(session.getPenSessionSegments().length).toBe(2);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 200, clientY: 30, button: 0, detail: 1 }),
      () => ({ x: 200, y: 30 })
    );
    expect(session.getPenSessionSegments().length).toBe(2);
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 250, clientY: 55, button: 0 }),
      () => ({ x: 250, y: 55 })
    );
    expect(session.penColocatedTipMirroredHandleDragActive).toBe(true);
    expect(session.penCurvePreviewPathD).toBeNull();
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 250, clientY: 55, button: 0 })
    );
    expect(session.getPenSessionSegments().length).toBe(2);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 310, clientY: 60, button: 0, detail: 1 }),
      () => ({ x: 310, y: 60 })
    );
    const segs = session.getPenSessionSegments();
    expect(segs.length).toBe(3);
    expect(segs[2].type).toBe('C');
    const colocatedC = segs[2];
    if (colocatedC.type === 'C') {
      const incomingLen = Math.hypot(colocatedC.x - colocatedC.x2, colocatedC.y - colocatedC.y2);
      expect(incomingLen).toBeGreaterThan(1e-3);
    }
  });

  it('first-anchor P3: mousedown starts pending; drag then mouseup commits with incoming from second drag', () => {
    const ports = minimalPorts({
      clientToEditorSvgPoint: vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }))
    });
    const session = new PenToolSession(ports);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, detail: 1 }),
      () => ({ x: 0, y: 0 })
    );
    const dragPx = MARQUEE_MIN_DRAG_PX + 4;
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 10 + dragPx, clientY: 10, button: 0 }),
      () => ({ x: 50, y: 10 })
    );
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 10 + dragPx, clientY: 10, button: 0 })
    );
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 200, clientY: 30, button: 0, detail: 1 }),
      () => ({ x: 200, y: 30 })
    );
    expect(session.getPenSessionSegments().length).toBe(1);
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 200 + dragPx, clientY: 30, button: 0 }),
      () => ({ x: 200 + dragPx, y: 30 })
    );
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 200 + dragPx, clientY: 30, button: 0 })
    );
    const c = session.getPenSessionSegments()[1];
    expect(c?.type).toBe('C');
    if (c?.type === 'C') {
      expect(c.x).toBeCloseTo(200, 5);
      expect(c.y).toBeCloseTo(30, 5);
      const incomingLen = Math.hypot(c.x - c.x2, c.y - c.y2);
      expect(incomingLen).toBeGreaterThan(1e-3);
    }
  });

  it('tryFinishPenPath with M + first-segment draft shows same feedback as need-two-points', () => {
    const ports = minimalPorts({
      clientToEditorSvgPoint: vi.fn((cx: number, cy: number) => ({ x: cx, y: cy }))
    });
    const session = new PenToolSession(ports);
    session.onCanvasPenPrimaryMouseDown(
      new MouseEvent('mousedown', { clientX: 10, clientY: 10, button: 0, detail: 1 }),
      () => ({ x: 0, y: 0 })
    );
    const dragPx = MARQUEE_MIN_DRAG_PX + 4;
    session.onDocumentMouseMovePen(
      new MouseEvent('mousemove', { clientX: 10 + dragPx, clientY: 10, button: 0 }),
      () => ({ x: 50, y: 10 })
    );
    session.onDocumentMouseUpPen(
      new MouseEvent('mouseup', { clientX: 10 + dragPx, clientY: 10, button: 0 })
    );
    session.tryFinishPenPath(false);
    expect(session.penFinishFeedbackMessage).toContain('Add at least 2 points');
  });

  it('Backspace after first mousedown clears moveto-only session (single-gesture pending)', () => {
    const clearSelectionForPenBackgroundStroke = vi.fn();
    const ports = minimalPorts({
      clearSelectionForPenBackgroundStroke,
      isEditorContentShapeTarget: () => false
    });
    const session = new PenToolSession(ports);
    const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
    session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
    expect(session.isPenSessionActive).toBe(true);
    expect(session.tryPenBackspaceShortcut()).toBe(true);
    expect(session.isPenSessionActive).toBe(false);
  });
});
