import { describe, it, expect, vi } from 'vitest';
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
      getShapeBBox: vi.fn()
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
    isCanvasReadyForPenInput: () => true,
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
});
