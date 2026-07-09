import { describe, it, expect, vi, afterEach } from 'vitest';
import { SVG } from '@svgdotjs/svg.js';
import type { Svg } from '@svgdotjs/svg.js';
import { PathNodeEditSession } from './path-node-edit-session';
import type { PathNodeEditSessionPorts } from './path-node-edit-session-ports';
import { PathNodeEditCommandBridgeService } from '../../../services/path-node-edit-command-bridge.service';

// ---- Path fixtures --------------------------------------------------------

/** Open path, 3 nodes — minimum for an open path (needs ≥ 2). */
const OPEN_3 = 'M 0 0 L 100 0 L 50 50';
/** Closed path, 3 nodes — at minimum for a closed path (needs ≥ 3). */
const CLOSED_3 = 'M 0 0 L 100 0 L 50 50 Z';
/** Closed path, 4 nodes — has room for one delete. */
const CLOSED_4 = 'M 0 0 L 100 0 L 100 100 L 0 100 Z';

// ---- DOM helpers ----------------------------------------------------------

const appended: Element[] = [];

afterEach(() => {
  for (const el of appended) el.remove();
  appended.length = 0;
});

/**
 * Creates a real svg.js `Svg` instance (needed by the session's
 * `buildPathNodeEditState` → `svg.findOne('#id')`).
 */
function makeSvgWithPath(pathId: string, d: string): Svg {
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(svgEl);
  appended.push(svgEl);
  const svg = SVG(svgEl) as Svg;
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.id = pathId;
  pathEl.setAttribute('d', d);
  svgEl.appendChild(pathEl);
  return svg;
}

/**
 * Creates an overlay anchor element that satisfies `tryStartPathNodeDrag`'s
 * `closest('[data-path-node-anchor-index]')` hit test.
 */
function makeAnchorEl(pathId: string, anchorIndex: number): Element {
  const el = document.createElement('div');
  el.setAttribute('data-path-node-anchor-index', String(anchorIndex));
  el.setAttribute('data-path-node-path-id', pathId);
  document.body.appendChild(el);
  appended.push(el);
  return el;
}

// ---- Ports factory --------------------------------------------------------

function minimalPorts(
  svgInstance: Svg | null = null,
  overrides: Partial<PathNodeEditSessionPorts> = {}
): PathNodeEditSessionPorts {
  const bridge = new PathNodeEditCommandBridgeService();
  return {
    markForCheck: vi.fn(),
    getCurrentTool: () => 'node-edit-selector',
    setTool: vi.fn(),
    clientToEditorSvgPoint: vi.fn(() => ({ x: 50, y: 50 })),
    getMainSvgElement: () => null,
    isEditorContentShapeTarget: () => true,
    isCanvasReady: () => true,
    svgBboxToOverlayPixels: (bbox) => bbox,
    svgManipulation: {
      getSVGInstance: () => svgInstance,
      isElementOrAncestorLocked: vi.fn(() => false),
      getPathNodeHandleLinkRaw: vi.fn(() => null),
      setPathNodeHandleLinkRaw: vi.fn(),
      mapPathLocalToRootUser: vi.fn((_id, lx, ly) => ({ x: lx, y: ly })),
      mapRootUserToPathLocal: vi.fn((_id, rx, ry) => ({ x: rx, y: ry })),
      updatePathData: vi.fn(),
      getShapeBBox: vi.fn(() => null),
      getShapeProperties: vi.fn(() => ({ id: 'p1' } as never))
    },
    shapeSelection: { selectShape: vi.fn() },
    editorHistory: { pushAndExecute: vi.fn() },
    pathNodeEditBridge: bridge,
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    setLastBbox: vi.fn(),
    clearHighlightRectCache: vi.fn(),
    ...overrides
  };
}

// ---- Tests ----------------------------------------------------------------

describe('PathNodeEditSession — enter / exit mode', () => {
  it('starts inactive', () => {
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.isPathNodeEditModeActive).toBe(false);
    expect(session.hasPathNodeEditState()).toBe(false);
  });

  it('becomes active when entering with a valid path id', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);
    expect(session.isPathNodeEditModeActive).toBe(true);
    expect(session.getPathNodeEditState()?.paths.length).toBe(1);
    expect(session.getPathNodeEditState()?.activePathId).toBe('p1');
  });

  it('stays inactive when path id has no matching element in the SVG instance', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['nonexistent']);
    expect(session.isPathNodeEditModeActive).toBe(false);
  });

  it('stays inactive when SVG instance is null', () => {
    const session = new PathNodeEditSession(minimalPorts(null));
    session.enterPathNodeEditMode(['p1']);
    expect(session.isPathNodeEditModeActive).toBe(false);
  });

  it('sets active path from preferredPathId when it appears in state', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const pathEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl2.id = 'p2';
    pathEl2.setAttribute('d', CLOSED_4);
    svg.node.appendChild(pathEl2);

    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1', 'p2'], 'p2');
    expect(session.getPathNodeEditState()?.activePathId).toBe('p2');
  });

  it('exitPathNodeEditMode returns false when not active', () => {
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.exitPathNodeEditMode()).toBe(false);
    expect(session.isPathNodeEditModeActive).toBe(false);
  });

  it('exitPathNodeEditMode returns true and clears state when active', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);
    expect(session.exitPathNodeEditMode()).toBe(true);
    expect(session.isPathNodeEditModeActive).toBe(false);
    expect(session.getPathNodeEditState()).toBeNull();
  });

  it('re-entering with new path ids replaces previous state', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const pathEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl2.id = 'p2';
    pathEl2.setAttribute('d', CLOSED_4);
    svg.node.appendChild(pathEl2);

    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);
    session.enterPathNodeEditMode(['p2']);
    expect(session.getPathNodeEditState()?.activePathId).toBe('p2');
    expect(session.getPathNodeEditState()?.paths.map((s) => s.pathId)).toEqual(['p2']);
  });
});

describe('PathNodeEditSession — isPathNodeEditTarget', () => {
  it('returns false when no edit state is active', () => {
    const el = document.createElement('div');
    (el as HTMLElement & { id: string }).id = 'p1';
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.isPathNodeEditTarget(el)).toBe(false);
  });

  it('returns true when the target id matches an active path', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);

    const el = document.createElement('div');
    el.id = 'p1';
    expect(session.isPathNodeEditTarget(el)).toBe(true);
  });

  it('returns false when target id does not match any active path', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);

    const el = document.createElement('div');
    el.id = 'other';
    expect(session.isPathNodeEditTarget(el)).toBe(false);
  });

  it('returns true when the target is a descendant with data-path-node-edit-target', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);

    const parent = document.createElement('div');
    parent.setAttribute('data-path-node-edit-target', '');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);
    appended.push(parent);

    expect(session.isPathNodeEditTarget(child)).toBe(true);
  });
});

describe('PathNodeEditSession — tryStartPathNodeDrag', () => {
  it('returns false when edit mode is not active', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    const el = makeAnchorEl('p1', 0);
    const ev = new MouseEvent('mousedown', { clientX: 10, clientY: 10 });
    expect(session.tryStartPathNodeDrag(el, ev)).toBe(false);
  });

  it('returns false when target has no anchor or handle attribute', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);

    const el = document.createElement('div');
    const ev = new MouseEvent('mousedown', { clientX: 10, clientY: 10 });
    expect(session.tryStartPathNodeDrag(el, ev)).toBe(false);
  });

  it('starts an anchor drag and returns true', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);

    const el = makeAnchorEl('p1', 0);
    const ev = new MouseEvent('mousedown', { clientX: 10, clientY: 10 });
    expect(session.tryStartPathNodeDrag(el, ev)).toBe(true);
    expect(session.getPathNodeDragSession()).not.toBeNull();
    expect(session.getPathNodeDragSession()?.pathId).toBe('p1');
    expect(session.getPathNodeDragSession()?.target.kind).toBe('anchor');
  });
});

describe('PathNodeEditSession — tryDeleteSelectedPathNode', () => {
  it('returns false when edit mode is not active', () => {
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.tryDeleteSelectedPathNode()).toBe(false);
  });

  it('returns true with feedback when active but no node is selected', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);
    const result = session.tryDeleteSelectedPathNode();
    expect(result).toBe(true);
    expect(session.pathNodeEditFeedbackMessage).toMatch(/select a node/i);
  });

  it('refuses to delete from a closed path with exactly 3 nodes', () => {
    const svg = makeSvgWithPath('p1', CLOSED_3);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);

    // Select the first anchor via drag start so selectedPathNode is set
    const el = makeAnchorEl('p1', 0);
    session.tryStartPathNodeDrag(el, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));

    const result = session.tryDeleteSelectedPathNode();
    expect(result).toBe(true);
    expect(session.pathNodeEditFeedbackMessage).toMatch(/at least 3 nodes/i);
    // No history command should have been pushed
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).not.toHaveBeenCalled();
  });

  it('refuses to delete from an open path with exactly 3 nodes (min is 2, but feedback guards ≤ 2 anchors uniquely — 3 open nodes ok to delete one)', () => {
    // open path with 2 nodes → after delete would become 1 → blocked
    const svg = makeSvgWithPath('p1', 'M 0 0 L 100 0');
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);

    const el = makeAnchorEl('p1', 0);
    session.tryStartPathNodeDrag(el, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));

    const result = session.tryDeleteSelectedPathNode();
    expect(result).toBe(true);
    expect(session.pathNodeEditFeedbackMessage).toMatch(/at least 2 nodes/i);
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).not.toHaveBeenCalled();
  });

  it('deletes a node from a closed 4-node path and pushes a history command', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);

    const el = makeAnchorEl('p1', 0);
    session.tryStartPathNodeDrag(el, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));

    const result = session.tryDeleteSelectedPathNode();
    expect(result).toBe(true);
    expect(session.pathNodeEditFeedbackMessage).toBeNull();
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).toHaveBeenCalledTimes(1);
    // State refreshed — still in edit mode (3 nodes remain)
    expect(session.isPathNodeEditModeActive).toBe(true);
  });
});

describe('PathNodeEditSession — syncPathNodeEditBridgeChrome', () => {
  it('reports toolIsNodeEdit=false when current tool is not node-edit-selector', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg, { getCurrentTool: () => 'selector' });
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);
    session.syncPathNodeEditBridgeChrome();
    expect(ports.pathNodeEditBridge.chrome().toolIsNodeEdit).toBe(false);
  });

  it('reports hasSelectedPathNode=false when no node is selected', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);
    session.syncPathNodeEditBridgeChrome();
    expect(ports.pathNodeEditBridge.chrome().hasSelectedPathNode).toBe(false);
  });

  it('reports hasSelectedPathNode=true when a node is selected after drag start', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);

    const el = makeAnchorEl('p1', 0);
    session.tryStartPathNodeDrag(el, new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    session.syncPathNodeEditBridgeChrome();
    expect(ports.pathNodeEditBridge.chrome().hasSelectedPathNode).toBe(true);
  });
});

describe('PathNodeEditSession — commitPenInsertOnExistingPath', () => {
  it('does nothing when old and new path data are identical', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.commitPenInsertOnExistingPath('p1', CLOSED_4, CLOSED_4);
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).not.toHaveBeenCalled();
  });

  it('does nothing when new path data is not valid', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.commitPenInsertOnExistingPath('p1', CLOSED_4, '');
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).not.toHaveBeenCalled();
  });

  it('does nothing when path element is not found in SVG instance', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.commitPenInsertOnExistingPath('nonexistent', CLOSED_4, CLOSED_4 + ' L 200 200');
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).not.toHaveBeenCalled();
  });

  it('pushes a history command when old → new path data are different and path exists', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    // New path data: same shape but with an extra point inserted
    const newD = 'M 0 0 L 50 0 L 100 0 L 100 100 L 0 100 Z';
    session.commitPenInsertOnExistingPath('p1', CLOSED_4, newD);
    expect(vi.mocked(ports.editorHistory.pushAndExecute)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ports.svgManipulation.updatePathData)).toHaveBeenCalledWith('p1', newD);
  });

  it('sets penPostInsertAnchorPathId when path is not in active node-edit state', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    const newD = 'M 0 0 L 50 0 L 100 0 L 100 100 L 0 100 Z';
    // No edit mode active for p1
    session.commitPenInsertOnExistingPath('p1', CLOSED_4, newD);
    expect(session.penPostInsertAnchorPathId).toBe('p1');
  });

  it('clears penPostInsertAnchorPathId when path IS in active node-edit state', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const ports = minimalPorts(svg);
    const session = new PathNodeEditSession(ports);
    session.enterPathNodeEditMode(['p1']);

    const newD = 'M 0 0 L 50 0 L 100 0 L 100 100 L 0 100 Z';
    session.commitPenInsertOnExistingPath('p1', CLOSED_4, newD);
    expect(session.penPostInsertAnchorPathId).toBeNull();
  });
});

describe('PathNodeEditSession — anchor overlay readouts', () => {
  it('getPathNodeAnchorOverlays returns empty array when not in edit mode', () => {
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.getPathNodeAnchorOverlays()).toEqual([]);
  });

  it('getPathNodeAnchorOverlays returns one entry per anchor when active', () => {
    const svg = makeSvgWithPath('p1', CLOSED_4);
    const session = new PathNodeEditSession(minimalPorts(svg));
    session.enterPathNodeEditMode(['p1']);
    const overlays = session.getPathNodeAnchorOverlays();
    // CLOSED_4 parses to 5 path segments; the close lineback adds one extra anchor
    expect(overlays.length).toBe(5);
    overlays.forEach((o) => expect(o.pathId).toBe('p1'));
  });

  it('getPathNodeControlHandleOverlays returns empty array when not in edit mode', () => {
    const session = new PathNodeEditSession(minimalPorts());
    expect(session.getPathNodeControlHandleOverlays()).toEqual([]);
  });
});
