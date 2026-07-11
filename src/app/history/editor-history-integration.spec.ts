import { signal } from '@angular/core';
import { Matrix } from '@svgdotjs/svg.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorHistoryService } from '../services/editor-history.service';
import {
  EditorCommand,
  PenSegmentReplaceCommand,
  isProvisionalCommand
} from '../models/editor-commands';
import type { PenPathSegment } from '../models/pen-path';
import { PenToolSession, type PenToolSessionPorts } from '../components/svg-canvas/pen-tool-session/pen-tool-session';
import { DragGesture } from '../components/svg-canvas/gestures/drag-gesture';
import { GhostSession } from '../components/svg-canvas/gestures/ghost-session';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import type { SvgManipulationService } from '../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../services/shape-selection.service';
import { createDefaultTransformGestureDoc } from '../components/svg-canvas/gestures/transform-gesture-doc.port';

function makePenSegmentReplace(
  index: number,
  before: PenPathSegment,
  after: PenPathSegment,
  apply: (i: number, s: PenPathSegment) => void,
  appliedAlready = false
): PenSegmentReplaceCommand {
  return new PenSegmentReplaceCommand(index, before, after, apply, appliedAlready);
}

function makeCommittedCommand(label = 'committed'): EditorCommand & { executeCalls: number; undoCalls: number } {
  return {
    description: label,
    executeCalls: 0,
    undoCalls: 0,
    execute() {
      this.executeCalls++;
    },
    undo() {
      this.undoCalls++;
    }
  };
}

function minimalPenPorts(
  history: EditorHistoryService,
  overrides: Partial<PenToolSessionPorts> = {}
): PenToolSessionPorts {
  return {
    pathNodeOverlay: {
      parsePathDataForNodeEditing: () => null,
      collectPathNodeAnchors: () => [],
      collectPathControlHandles: () => [],
      pathNodeLocalPointToOverlay: (_pathId, lx, ly) => ({ x: lx, y: ly }),
      penRootUserPointToOverlay: (rx, ry) => ({ x: rx, y: ry }),
      getPenPostInsertAnchorPathId: () => null,
      isPathInNodeEditState: () => false
    },
    markForCheck: vi.fn(),
    getCurrentTool: () => 'pen',
    isPenAltCurveMode: () => false,
    setPenAltCurveMode: vi.fn(),
    setTool: vi.fn(),
    clientToEditorSvgPoint: vi.fn(() => ({ x: 10, y: 20 })),
    svgBboxToOverlayPixels: (bbox) => ({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }),
    parseOverlayViewBox: () => ({ vbMinX: 0, vbMinY: 0, vbW: 100, vbH: 100 }),
    getMainSvgElement: () => null,
    confirmDiscardInProgressPath: vi.fn(() => true),
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
    editorHistory: history,
    penBackspaceShortcutShouldDefer: () => false,
    setLastBbox: vi.fn(),
    clearHighlightRectCache: vi.fn(),
    isEditorContentShapeTarget: () => false,
    getPenPathInsertToleranceSvg: () => 8,
    getPathDForId: () => null,
    commitPenInsertOnExistingPath: vi.fn(),
    clearPenPostInsertAnchorOverlay: vi.fn(),
    clearSelectionForPenBackgroundStroke: vi.fn(),
    isCanvasReady: () => true,
    armPenClosePostNodeEditEmptyClickSelectionGuard: vi.fn(),
    ...overrides
  };
}

function createDragContext(history: EditorHistoryService): GestureRuntimeContext {
  const restoreSelectionTransformsFromSnapshot = vi.fn();
  const translateShape = vi.fn();
  const doc = {
    svgManipulation: {
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['shape1', new Matrix()]])),
      setShapeVisibility: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({}),
      getShapeIdsInDomOrder: vi.fn((ids: string[]) => ids),
      getShapeBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 }),
      isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
      translateShape,
      restoreSelectionTransformsFromSnapshot
    },
    shapeSelection: {
      getSelectedShapes: vi.fn().mockReturnValue([{ id: 'shape1' }, { id: 'shape2' }])
    },
    editorHistory: history
  };
  const transformDoc = createDefaultTransformGestureDoc(
    doc.svgManipulation as unknown as SvgManipulationService,
    doc.shapeSelection as unknown as ShapeSelectionService,
    history
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

describe('EditorHistoryService integration', () => {
  describe('pen provisional segment lifecycle', () => {
    let history: EditorHistoryService;
    let applied: PenPathSegment[];

    beforeEach(() => {
      history = new EditorHistoryService();
      applied = [{ type: 'M', x: 0, y: 0 }];
    });

    it('marks PenSegmentReplaceCommand as provisional', () => {
      const cmd = makePenSegmentReplace(
        0,
        { type: 'M', x: 0, y: 0 },
        { type: 'M', x: 1, y: 1 },
        (i, s) => {
          applied[i] = s;
        }
      );
      expect(isProvisionalCommand(cmd)).toBe(true);
    });

    it('undo reverts provisional segment edit while pen session is active', () => {
      const before: PenPathSegment = { type: 'C', x1: 0, y1: 0, x2: 0, y2: 0, x: 10, y: 10 };
      const after: PenPathSegment = { type: 'C', x1: 2, y1: 2, x2: 4, y2: 4, x: 10, y: 10 };
      applied = [{ type: 'M', x: 0, y: 0 }, { ...before }];
      const apply = (i: number, s: PenPathSegment) => {
        applied[i] = s;
      };
      history.pushAndExecute(makePenSegmentReplace(1, before, after, apply));
      expect(applied[1]).toEqual(after);

      history.undo();
      expect(applied[1]).toEqual(before);
      expect(history.canUndo()).toBe(false);
    });

    it('discardWhere removes provisional commands and clears redo', () => {
      const committed = makeCommittedCommand();
      const provisional = makePenSegmentReplace(
        0,
        { type: 'M', x: 0, y: 0 },
        { type: 'M', x: 5, y: 5 },
        () => undefined
      );
      history.pushAndExecute(committed);
      history.pushAndExecute(provisional);
      history.undo();
      expect(history.canRedo()).toBe(true);

      history.discardWhere((c) => isProvisionalCommand(c));
      expect(history.canRedo()).toBe(false);
      expect(history.canUndo()).toBe(true);

      history.undo();
      expect(committed.undoCalls).toBe(1);
      expect(history.canUndo()).toBe(false);
    });

    it('after finish purge, provisional edits are not undoable', () => {
      const committed = makeCommittedCommand('finish path');
      const provisional = makePenSegmentReplace(
        1,
        { type: 'L', x: 1, y: 1 },
        { type: 'L', x: 2, y: 2 },
        () => undefined
      );
      history.pushAndExecute(provisional);
      history.pushAndExecute(committed);
      history.discardWhere((c) => isProvisionalCommand(c));

      expect(history.canUndo()).toBe(true);
      history.undo();
      expect(committed.undoCalls).toBe(1);
      expect(history.canUndo()).toBe(false);
    });

    it('pen provisional segment → undo → tool switch purges provisional history', () => {
      const historySvc = new EditorHistoryService();
      const discardSpy = vi.spyOn(historySvc, 'discardWhere');
      const ports = minimalPenPorts(historySvc);
      const session = new PenToolSession(ports);

      const ev = new MouseEvent('mousedown', { clientX: 5, clientY: 5, button: 0, detail: 1 });
      session.onCanvasPenPrimaryMouseDown(ev, () => ({ x: 1, y: 1 }));
      expect(session.isPenSessionActive).toBe(true);

      const before: PenPathSegment = { type: 'M', x: 1, y: 1 };
      const after: PenPathSegment = { type: 'M', x: 2, y: 2 };
      historySvc.pushAndExecute(makePenSegmentReplace(0, before, after, () => undefined));
      expect(historySvc.canUndo()).toBe(true);

      historySvc.undo();
      expect(historySvc.canUndo()).toBe(false);

      historySvc.pushAndExecute(makePenSegmentReplace(0, before, after, () => undefined));
      expect(historySvc.canUndo()).toBe(true);

      expect(session.confirmDiscardPenSessionIfNeeded('tool switch')).toBe(true);
      expect(session.isPenSessionActive).toBe(false);
      expect(discardSpy).toHaveBeenCalled();
      expect(historySvc.canUndo()).toBe(false);
    });
  });

  describe('transform ghost + history', () => {
    let history: EditorHistoryService;
    let ctx: GestureRuntimeContext;
    let gesture: DragGesture;

    beforeEach(() => {
      vi.spyOn(GhostSession.prototype, 'buildFragmentsForUnion').mockReturnValue([
        {
          outerGroup: { matrix: vi.fn(), remove: vi.fn() },
          nestedSvg: { attr: vi.fn(), viewbox: vi.fn() },
          worldToUnion: { matrix: vi.fn() }
        }
      ] as never);
      vi.spyOn(GhostSession.prototype, 'removeFragments').mockImplementation(() => undefined);
      history = new EditorHistoryService();
      ctx = createDragContext(history);
      gesture = new DragGesture();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('cancelled drag does not push to history and undo is a no-op', () => {
      expect(
        gesture.start(
          ctx,
          ['shape1', 'shape2'],
          'shape1',
          { x: 0, y: 0 },
          { target: document.createElement('div') } as unknown as MouseEvent
        )
      ).toBe(true);
      gesture.move(ctx, 20, 20, false);
      gesture.cancel(ctx);

      expect(history.canUndo()).toBe(false);
      history.undo();
      expect(history.canUndo()).toBe(false);
      expect(ctx.doc.svgManipulation.restoreSelectionTransformsFromSnapshot).not.toHaveBeenCalled();
    });

    it('completed drag then undo restores pre-gesture transform snapshot', () => {
      const restore = ctx.doc.svgManipulation.restoreSelectionTransformsFromSnapshot as ReturnType<typeof vi.fn>;
      expect(
        gesture.start(
          ctx,
          ['shape1', 'shape2'],
          'shape1',
          { x: 0, y: 0 },
          { target: document.createElement('div') } as unknown as MouseEvent
        )
      ).toBe(true);
      gesture.move(ctx, 20, 20, false);
      gesture.end(ctx, 20, 20, false);

      expect(history.canUndo()).toBe(true);
      history.undo();
      expect(restore).toHaveBeenCalled();
      expect(history.canRedo()).toBe(true);
    });

    it('cancel after move leaves no translate command for a later undo to reverse', () => {
      const translate = ctx.doc.svgManipulation.translateShape as ReturnType<typeof vi.fn>;
      expect(
        gesture.start(
          ctx,
          ['shape1', 'shape2'],
          'shape1',
          { x: 0, y: 0 },
          { target: document.createElement('div') } as unknown as MouseEvent
        )
      ).toBe(true);
      gesture.move(ctx, 15, 15, false);
      gesture.cancel(ctx);

      const committed = makeCommittedCommand('prior edit');
      history.pushAndExecute(committed);
      history.undo();
      expect(committed.undoCalls).toBe(1);
      expect(translate).not.toHaveBeenCalled();
    });
  });
});
