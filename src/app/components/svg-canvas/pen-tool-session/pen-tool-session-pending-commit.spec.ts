import { describe, it, expect, vi } from 'vitest';
import { PenSession, penPathSegmentsToD, type PenPathSegment } from '../../../models/pen-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';
import { commitPenPendingSegmentForView, type PenPendingCommitView } from './pen-tool-session-pending-commit';

/**
 * Instrumentation for click-close on the start anchor. Run:
 * `npx vitest run src/app/components/svg-canvas/pen-tool-session/pen-tool-session-pending-commit.spec.ts`
 * To narrow: `-t "no curve preview"` or `-t "mousedown not in close radius"`.
 */

/**
 * Documents which branch in {@link commitPenPendingSegmentForView} ran when simulating
 * pointer-up after mousedown in the start-anchor close ring.
 */
type CloseClickTrace = {
  branch: 'curve_preview_close' | 'no_preview_close' | 'none';
  appendCubicCalls: { x1: number; y1: number; x2: number; y2: number; x: number; y: number }[];
  commitDraggedCurveCalls: unknown[];
  tryFinishPathClose: boolean | null;
  segmentsAfter: readonly PenPathSegment[];
};

function runCloseClickScenario(opts: {
  /** Committed path before close (must start with M, length ≥ 2). */
  segments: PenPathSegment[];
  /** Last vertex — pending anchor. */
  anchor: { x: number; y: number };
  /** Pending chord end / mousedown on start ring (SVG). */
  startSvg: { x: number; y: number };
  moveto: { x: number; y: number };
  pendingShowsCurvePreview: boolean;
  pendingMousedownInCloseRadius: boolean;
  /** If true, anchor equals moveto so the no-preview branch skips append (degenerate). */
  anchorEqualsM?: boolean;
  /** SVG point returned on mouseup (`clientToEditorSvgPoint`); defaults to `startSvg`. */
  mouseupEditorSvg?: { x: number; y: number };
}): CloseClickTrace {
  const session = new PenSession();
  session.restoreDrawableSegments(opts.segments);

  const appendCubicCalls: CloseClickTrace['appendCubicCalls'] = [];
  const origAppend = session.appendCubic.bind(session);
  session.appendCubic = (x1, y1, x2, y2, x, y) => {
    appendCubicCalls.push({ x1, y1, x2, y2, x, y });
    origAppend(x1, y1, x2, y2, x, y);
  };

  const commitDraggedCurveCalls: unknown[] = [];
  let tryFinishPathClose: boolean | null = null;
  let branch: CloseClickTrace['branch'] = 'none';

  let pend: PenPendingSegmentForPreview | null = {
    anchor: opts.anchorEqualsM ? opts.moveto : opts.anchor,
    startClient: { x: 10, y: 10 },
    startSvg: opts.startSvg,
    ctrlCurve: false
  };

  const releasePt = opts.mouseupEditorSvg ?? opts.startSvg;
  const ports = {
    clientToEditorSvgPoint: vi.fn(() => ({ x: releasePt.x, y: releasePt.y }))
  } as unknown as PenToolSessionPorts;

  const view = {
    ports,
    penSession: session,
    get pendingSegment() {
      return pend;
    },
    set pendingSegment(v: PenPendingSegmentForPreview | null) {
      pend = v;
    },
    get pendingLastClient() {
      return null;
    },
    set pendingLastClient(_v: { x: number; y: number } | null) {},
    get pendingDragSvg() {
      return null;
    },
    set pendingDragSvg(_v: { x: number; y: number } | null) {},
    get pendingCurveAltChord() {
      return false;
    },
    set pendingCurveAltChord(_v: boolean) {},
    get pendingShiftAngleSnap() {
      return false;
    },
    set pendingShiftAngleSnap(_v: boolean) {},
    get pointerSvg() {
      return opts.startSvg;
    },
    set pointerSvg(_v: { x: number; y: number } | null) {},
    pathStartMv: () => opts.moveto,
    pendingShowsCurvePreview: () => opts.pendingShowsCurvePreview,
    pendingMousedownInCloseRadius: () => opts.pendingMousedownInCloseRadius,
    pendingResolvedEndForCommit: (p: PenPendingSegmentForPreview) => p.startSvg,
    pendingIsFirstFromMoveto: () => false,
    pendingChordColocated: () => false,
    pendingStartNearPathMoveto: () => false,
    pendingCubicAltEndOnly: () => false,
    clearFirstAnchorAwaitingDraft: vi.fn(),
    get colocatedDraft() {
      return null;
    },
    set colocatedDraft(_v: null) {},
    get awaitingColocatedEndpoint() {
      return false;
    },
    set awaitingColocatedEndpoint(_v: boolean) {},
    get firstAnchorP3Draft() {
      return null;
    },
    set firstAnchorP3Draft(_v: null) {},
    tryCommitFirstSegmentCurveFromPendingDraft: () => false,
    commitDraggedCurve: (...args: unknown[]) => {
      commitDraggedCurveCalls.push(args);
    },
    tryFinishPath: (close: boolean) => {
      tryFinishPathClose = close;
    },
    markForCheck: vi.fn()
  } as unknown as PenPendingCommitView;

  const event = new MouseEvent('mouseup', { clientX: 10, clientY: 10, button: 0 });

  if (opts.pendingMousedownInCloseRadius) {
    if (opts.pendingShowsCurvePreview) {
      branch = 'curve_preview_close';
    } else {
      branch = 'no_preview_close';
    }
  }

  commitPenPendingSegmentForView(view, event);

  return {
    branch,
    appendCubicCalls,
    commitDraggedCurveCalls,
    tryFinishPathClose,
    segmentsAfter: session.getSegments()
  };
}

describe('commitPenPendingSegmentForView — click close on start (close radius)', () => {
  const m = { x: 10, y: 10 };
  const firstC: PenPathSegment = {
    type: 'C',
    x1: 100,
    y1: 4.5,
    x2: 100,
    y2: 4.5,
    x: 100,
    y: 10
  };
  const baseSegs: PenPathSegment[] = [{ type: 'M', x: m.x, y: m.y }, firstC];

  it('no curve preview + first leg C: commitDraggedCurve with moveto as segmentEnd (not addLine)', () => {
    const last = { x: 100, y: 100 };
    const trace = runCloseClickScenario({
      segments: baseSegs,
      anchor: last,
      startSvg: m,
      moveto: m,
      pendingShowsCurvePreview: false,
      pendingMousedownInCloseRadius: true
    });

    expect(trace.branch).toBe('no_preview_close');
    expect(trace.commitDraggedCurveCalls).toHaveLength(1);
    expect(trace.appendCubicCalls).toHaveLength(0);
    expect(trace.tryFinishPathClose).toBe(true);

    const call = trace.commitDraggedCurveCalls[0] as unknown[];
    expect(call[0]).toEqual(last);
    expect(call[1]).toEqual(m);
    expect(call[2]).toEqual({ x: firstC.x1, y: firstC.y1 });
    expect(call[3]).toBe(false);
    expect(call[4]).toEqual(m);

    expect(trace.segmentsAfter).toEqual(baseSegs);
  });

  it('no curve preview + first leg L: appends L to moveto (no closing C)', () => {
    const lineFirst: PenPathSegment[] = [
      { type: 'M', x: m.x, y: m.y },
      { type: 'L', x: 100, y: 10 }
    ];
    const trace = runCloseClickScenario({
      segments: lineFirst,
      anchor: { x: 100, y: 100 },
      startSvg: m,
      moveto: m,
      pendingShowsCurvePreview: false,
      pendingMousedownInCloseRadius: true
    });

    expect(trace.commitDraggedCurveCalls).toHaveLength(0);
    expect(trace.appendCubicCalls).toHaveLength(0);
    expect(trace.segmentsAfter[trace.segmentsAfter.length - 1]).toEqual({ type: 'L', x: m.x, y: m.y });
    expect(penPathSegmentsToD(trace.segmentsAfter).trim().endsWith(`${m.x} ${m.y}`)).toBe(true);
  });

  it('curve preview + close radius: commitDraggedCurve with mirrored drag when release near M', () => {
    const trace = runCloseClickScenario({
      segments: baseSegs,
      anchor: { x: 100, y: 100 },
      startSvg: m,
      moveto: m,
      pendingShowsCurvePreview: true,
      pendingMousedownInCloseRadius: true
    });

    expect(trace.commitDraggedCurveCalls).toHaveLength(1);
    expect(trace.appendCubicCalls).toHaveLength(0);
    expect(trace.tryFinishPathClose).toBe(true);
    const call = trace.commitDraggedCurveCalls[0] as unknown[];
    expect(call[2]).toEqual({ x: firstC.x1, y: firstC.y1 });
  });

  it('curve preview + close radius + release far from M: keeps pointer sample (no open-P1 mirror)', () => {
    const far = { x: 500, y: 500 };
    const trace = runCloseClickScenario({
      segments: baseSegs,
      anchor: { x: 100, y: 100 },
      startSvg: m,
      moveto: m,
      pendingShowsCurvePreview: true,
      pendingMousedownInCloseRadius: true,
      mouseupEditorSvg: far
    });

    expect(trace.commitDraggedCurveCalls).toHaveLength(1);
    const call = trace.commitDraggedCurveCalls[0] as unknown[];
    expect(call[2]).toEqual(far);
  });

  it('no preview close but anchor equals moveto: skips append (no zero-length segment)', () => {
    const trace = runCloseClickScenario({
      segments: baseSegs,
      anchor: m,
      startSvg: m,
      moveto: m,
      pendingShowsCurvePreview: false,
      pendingMousedownInCloseRadius: true,
      anchorEqualsM: true
    });

    expect(trace.appendCubicCalls).toHaveLength(0);
    expect(trace.commitDraggedCurveCalls).toHaveLength(0);
    expect(trace.segmentsAfter).toEqual(baseSegs);
    expect(trace.tryFinishPathClose).toBe(true);
  });

  it('mousedown not in close radius: does not enter click-close branch (pending cleared elsewhere)', () => {
    const session = new PenSession();
    session.restoreDrawableSegments(baseSegs);
    let pend: PenPendingSegmentForPreview | null = {
      anchor: { x: 100, y: 10 },
      startClient: { x: 0, y: 0 },
      startSvg: { x: 200, y: 200 },
      ctrlCurve: false
    };
    const commitSpy = vi.fn();
    let finishClose: boolean | null = null;

    const view = {
      ports: { clientToEditorSvgPoint: vi.fn(() => ({ x: 200, y: 200 })) } as unknown as PenToolSessionPorts,
      penSession: session,
      get pendingSegment() {
        return pend;
      },
      set pendingSegment(v: PenPendingSegmentForPreview | null) {
        pend = v;
      },
      get pendingLastClient() {
        return null;
      },
      set pendingLastClient(_v: { x: number; y: number } | null) {},
      get pendingDragSvg() {
        return { x: 200, y: 200 };
      },
      set pendingDragSvg(_v: { x: number; y: number } | null) {},
      get pendingCurveAltChord() {
        return false;
      },
      set pendingCurveAltChord(_v: boolean) {},
      get pendingShiftAngleSnap() {
        return false;
      },
      set pendingShiftAngleSnap(_v: boolean) {},
      get pointerSvg() {
        return { x: 200, y: 200 };
      },
      set pointerSvg(_v: { x: number; y: number } | null) {},
      pathStartMv: () => m,
      pendingShowsCurvePreview: () => false,
      pendingMousedownInCloseRadius: () => false,
      pendingResolvedEndForCommit: (p: PenPendingSegmentForPreview) => p.startSvg,
      pendingIsFirstFromMoveto: () => false,
      pendingChordColocated: () => false,
      pendingStartNearPathMoveto: () => false,
      pendingCubicAltEndOnly: () => false,
      clearFirstAnchorAwaitingDraft: vi.fn(),
      get colocatedDraft() {
        return null;
      },
      set colocatedDraft(_v: null) {},
      get awaitingColocatedEndpoint() {
        return false;
      },
      set awaitingColocatedEndpoint(_v: boolean) {},
      get firstAnchorP3Draft() {
        return null;
      },
      set firstAnchorP3Draft(_v: null) {},
      tryCommitFirstSegmentCurveFromPendingDraft: () => false,
      commitDraggedCurve: commitSpy,
      tryFinishPath: (c: boolean) => {
        finishClose = c;
      },
      markForCheck: vi.fn()
    } as unknown as PenPendingCommitView;

    commitPenPendingSegmentForView(
      view,
      new MouseEvent('mouseup', { clientX: 500, clientY: 0, button: 0 })
    );

    expect(finishClose).toBeNull();
    expect(commitSpy).toHaveBeenCalled();
  });
});
