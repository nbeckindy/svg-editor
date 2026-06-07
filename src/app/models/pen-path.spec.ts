import { describe, it, expect } from 'vitest';
import {
  PenSession,
  appendCubicToD,
  appendSymmetricCubicToD,
  dragBendCubicControlPoints,
  dragBendQuadraticControlPoint,
  dragBendSmoothCubicSecondControl,
  placementIllustratorStyleCubicControlPoints,
  placementPointerCubicControlPoints,
  placementPointerQuadraticControlPoint,
  placementZeroChordCubicControlPointsFromDrag,
  lastCommittedVertex,
  movePenLastOutgoingHandleTo,
  pathSvgReflectStateAfter,
  penDragCurveAuthoringKind,
  penLastOutgoingHandleSvg,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penPathSegmentsToD,
  snapVectorTo45DegFrom,
  symmetricCubicControlPoints,
  penDraftFirstSegmentPreviewD,
  penFirstAnchorMirroredHandleControlsFromDrag,
  penReflectStateAfterCommitted,
  penCubicSmoothReflectP1Usable,
  penAdjustedCubicControlsForPendingLikeDrag
} from './pen-path';
import { parsePathD } from './path-d';

describe('symmetricCubicControlPoints', () => {
  it('places controls at 1/3 and 2/3 along chord', () => {
    const c = symmetricCubicControlPoints({ x: 0, y: 0 }, { x: 9, y: 9 });
    expect(c).toEqual({ x1: 3, y1: 3, x2: 6, y2: 6 });
  });
});

describe('appendSymmetricCubicToD', () => {
  it('appends C command to base d', () => {
    const d = appendSymmetricCubicToD('M 0 0', { x: 0, y: 0 }, { x: 9, y: 9 });
    expect(d).toBe('M 0 0 C 3 3 6 6 9 9');
  });
});

describe('appendCubicToD', () => {
  it('appends explicit cubic controls to base d', () => {
    const d = appendCubicToD('M 0 0', { x1: 2, y1: 4, x2: 6, y2: 8 }, { x: 9, y: 9 });
    expect(d).toBe('M 0 0 C 2 4 6 8 9 9');
  });
});

describe('penDraftFirstSegmentPreviewD', () => {
  it('builds M + C preview with frozen draft; provisional P3 has no incoming handle (P2 === P3)', () => {
    const segments = [{ type: 'M' as const, x: 0, y: 0 }];
    const draft = {
      placementDragStartSvg: { x: 0, y: 0 },
      dragCommitSvg: { x: 40, y: 25 },
      ctrlCurve: false,
      curveAltChord: false,
      shiftAngleSnap: false,
      frozenOutgoingP1Svg: { x: 17, y: 8 }
    };
    const d = penDraftFirstSegmentPreviewD(
      segments,
      draft,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
      false,
      false
    );
    expect(d.startsWith('M 0 0 C')).toBe(true);
    const tail = d.replace(/^M 0 0 C\s*/, '');
    const parts = tail.trim().split(/\s+/).map(Number);
    expect(parts.length).toBe(6);
    const [x1, y1, x2, y2, x, y] = parts;
    expect(x1).toBe(17);
    expect(y1).toBe(8);
    expect(x2).toBe(x);
    expect(y2).toBe(y);
    expect(x).toBe(100);
    expect(y).toBe(0);
  });
});

describe('penFirstAnchorMirroredHandleControlsFromDrag', () => {
  it('mirrors P1/P2 through anchor along drag; each arm is one-third of drag vector', () => {
    const c = penFirstAnchorMirroredHandleControlsFromDrag(
      { x: 0, y: 0 },
      { x: 9, y: 9 },
      false
    );
    expect(c).toEqual({ x1: 3, y1: 3, x2: -3, y2: -3 });
  });
});

describe('penCubicSmoothReflectP1Usable', () => {
  it('is false when prior cubic P2 coincides with the join (zero incoming)', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'C' as const, x1: 20, y1: 0, x2: 100, y2: 0, x: 100, y: 0 }
    ];
    const st = penReflectStateAfterCommitted(segs)!;
    expect(penCubicSmoothReflectP1Usable(st, { x: 100, y: 0 })).toBe(false);
  });

  it('is true when prior C has P2 off the join', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'C' as const, x1: 20, y1: 0, x2: 80, y2: 30, x: 100, y: 0 }
    ];
    const st = penReflectStateAfterCommitted(segs)!;
    expect(penCubicSmoothReflectP1Usable(st, { x: 100, y: 0 })).toBe(true);
  });
});

describe('penAdjustedCubicControlsForPendingLikeDrag', () => {
  it('skips smooth P1 reflection when prior segment has degenerate P2 at join (uses Illustrator placement)', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'C' as const, x1: 30, y1: 0, x2: 100, y2: 0, x: 100, y: 0 }
    ];
    const anchor = { x: 100, y: 0 };
    const end = { x: 200, y: 0 };
    const dragStart = { x: 150, y: 0 };
    const dragCurrent = { x: 180, y: 40 };
    const c = penAdjustedCubicControlsForPendingLikeDrag(
      anchor,
      end,
      dragCurrent,
      dragStart,
      segs,
      false,
      false,
      false
    );
    expect(Math.abs(c.x1 - anchor.x) + Math.abs(c.y1 - anchor.y)).toBeGreaterThan(1e-6);
  });
});

describe('dragBendQuadraticControlPoint', () => {
  it('offsets control normal to chord like cubic bend', () => {
    const q = dragBendQuadraticControlPoint(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: -4 }
    );
    expect(q.x1).toBeCloseTo(5, 6);
    expect(q.y1).toBeCloseTo(-4, 6);
  });
});

describe('penDragCurveAuthoringKind', () => {
  it('selects authoring mode based on Ctrl and last segment', () => {
    const mOnly = [{ type: 'M' as const, x: 0, y: 0 }];
    expect(penDragCurveAuthoringKind(false, mOnly)).toBe('cubic');
    expect(penDragCurveAuthoringKind(true, mOnly)).toBe('cubic');

    const afterL = [
      ...mOnly,
      { type: 'L' as const, x: 1, y: 1 }
    ];
    expect(penDragCurveAuthoringKind(true, afterL)).toBe('cubic');

    const afterC = [...afterL, { type: 'C' as const, x1: 0, y1: 0, x2: 1, y2: 1, x: 2, y: 2 }];
    expect(penDragCurveAuthoringKind(true, afterC)).toBe('smoothCubic');

    const afterS = [
      ...afterC,
      { type: 'S' as const, x2: 3, y2: 3, x: 4, y: 4 }
    ];
    expect(penDragCurveAuthoringKind(true, afterS)).toBe('smoothCubic');

    const afterQ = [
      ...mOnly,
      { type: 'Q' as const, x1: 1, y1: 2, x: 3, y: 0 }
    ];
    expect(penDragCurveAuthoringKind(true, afterQ)).toBe('smoothQuadratic');
  });
});

describe('pathSvgReflectStateAfter', () => {
  it('resets quadratic and cubic reflection after Z like parsePathD', () => {
    const st = pathSvgReflectStateAfter([
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
      { type: 'L', x: 20, y: 0 },
      { type: 'Z' },
      { type: 'M', x: 100, y: 100 }
    ]);
    expect(st?.x).toBe(100);
    expect(st?.canReflectCubic).toBe(false);
    expect(st?.quadCpX).toBe(100);
  });
});

describe('placementIllustratorStyleCubicControlPoints', () => {
  it('puts P1 on chord thirds and P2 back along drag from the new anchor', () => {
    const c = placementIllustratorStyleCubicControlPoints(
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 20, y: 20 },
      { x: 35, y: 25 }
    );
    expect(c.x1).toBeCloseTo(13.333333, 4);
    expect(c.y1).toBeCloseTo(13.333333, 4);
    expect(c.x2).toBeCloseTo(11.75, 5);
    expect(c.y2).toBeCloseTo(17.25, 5);
  });

  it('incoming handle length exceeds old chord cap when drag is long', () => {
    const p0 = { x: 0, y: 0 };
    const p3 = { x: 100, y: 0 };
    const dragStart = { x: 100, y: 0 };
    const dragCurrent = { x: 100, y: 200 };
    const c = placementIllustratorStyleCubicControlPoints(p0, p3, dragStart, dragCurrent);
    const chordLen = 100;
    const oldCap = chordLen * 0.58;
    const dragLen = 200;
    const k = dragLen * 0.55;
    expect(k).toBeGreaterThan(oldCap);
    const incomingLen = Math.hypot(p3.x - c.x2, p3.y - c.y2);
    expect(incomingLen).toBeCloseTo(k, 5);
  });

  it('falls back to symmetric chord thirds when drag length is ~0', () => {
    const c = placementIllustratorStyleCubicControlPoints(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 0 },
      { x: 9, y: 0 }
    );
    expect(c).toEqual({ x1: 3, y1: 0, x2: 6, y2: 0 });
  });

  it('uses drag-based handles when chord length is ~0', () => {
    const anchor = { x: 10, y: 10 };
    const c = placementIllustratorStyleCubicControlPoints(anchor, anchor, anchor, { x: 40, y: 10 });
    const dragLen = 30;
    expect(c.x1).toBeCloseTo(anchor.x + dragLen / 3, 6);
    expect(c.y1).toBeCloseTo(10, 6);
    expect(c.x2).toBeCloseTo(anchor.x - dragLen * 0.55, 6);
    expect(c.y2).toBeCloseTo(10, 6);
  });
});

describe('placementZeroChordCubicControlPointsFromDrag', () => {
  it('places P1 forward and P2 back along drag when anchor equals chord end', () => {
    const a = { x: 0, y: 0 };
    const c = placementZeroChordCubicControlPointsFromDrag(a, a, { x: 30, y: 0 });
    expect(c.x1).toBeCloseTo(10, 6);
    expect(c.y1).toBe(0);
    expect(c.x2).toBeCloseTo(-16.5, 6);
    expect(c.y2).toBe(0);
  });
});

describe('placementPointerCubicControlPoints (Alt end-handle lock)', () => {
  it('with breakHandleSymmetry false: mirrors start control for symmetric C', () => {
    const c = placementPointerCubicControlPoints(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 6, y: -3 },
      false
    );
    expect(c).toEqual({ x1: 3, y1: 3, x2: 6, y2: -3 });
  });

  it('with breakHandleSymmetry true: chord thirds on start handle, end handle at pointer', () => {
    const c = placementPointerCubicControlPoints(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 4, y: 5 },
      true
    );
    expect(c.x1).toBe(3);
    expect(c.y1).toBe(0);
    expect(c.x2).toBe(4);
    expect(c.y2).toBe(5);
  });
});

describe('placementPointerQuadraticControlPoint', () => {
  it('follows the pointer like a single Q handle drag', () => {
    const q = placementPointerQuadraticControlPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -4 });
    expect(q).toEqual({ x1: 5, y1: -4 });
  });
});

describe('dragBendCubicControlPoints', () => {
  it('matches symmetric controls when drag has no orthogonal component', () => {
    const c = dragBendCubicControlPoints(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 }
    );
    expect(c).toEqual({ x1: 3, y1: 0, x2: 6, y2: 0 });
  });

  it('bends controls off the chord when drag moves normal to chord', () => {
    const c = dragBendCubicControlPoints(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 2 }
    );
    expect(c).toEqual({ x1: 3, y1: 2, x2: 6, y2: 2 });
  });
});

describe('penPathSegmentsToD', () => {
  it('formats M and L segments', () => {
    const d = penPathSegmentsToD([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 20 }
    ]);
    expect(d).toBe('M 0 0 L 10 20');
  });

  it('formats cubic C segments', () => {
    const d = penPathSegmentsToD([
      { type: 'M', x: 1, y: 2 },
      { type: 'C', x1: 0, y1: 0, x2: 5, y2: 5, x: 10, y: 0 }
    ]);
    expect(d).toBe('M 1 2 C 0 0 5 5 10 0');
  });

  it('formats M, L, and C in one path', () => {
    const c = symmetricCubicControlPoints({ x: 5, y: 0 }, { x: 10, y: 10 });
    const d = penPathSegmentsToD([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'C', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, x: 10, y: 10 }
    ]);
    expect(d).toBe('M 0 0 L 5 0 C 6.666667 3.333333 8.333333 6.666667 10 10');
  });

  it('emits uppercase Q S T with stable shorthand for smooth segments', () => {
    const d = penPathSegmentsToD([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: 5, x2: 15, y2: 5, x: 20, y: 0 },
      { type: 'S', x2: 25, y2: 5, x: 30, y: 0 },
      { type: 'Q', x1: 32, y1: 8, x: 35, y: 0 },
      { type: 'T', x: 40, y: 0 }
    ]);
    expect(d).toContain(' Q ');
    expect(d).toContain(' S ');
    expect(d).toContain(' T ');
    expect(d.startsWith('M 0 0')).toBe(true);
  });

  it('normalizes authored pen path through parsePathD without geometric errors', () => {
    const segments = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'Q' as const, x1: 5, y1: 10, x: 10, y: 0 },
      { type: 'T' as const, x: 14, y: -2 },
      { type: 'S' as const, x2: 24, y2: 0, x: 26, y: -2 }
    ] as const;
    const d = penPathSegmentsToD([...segments]);
    const parsed = parsePathD(d);
    expect(parsed.errors).toEqual([]);
    expect(parsed.segments.some((s) => s.type === 'Q')).toBe(true);
    expect(parsed.segments.some((s) => s.type === 'C')).toBe(true);
  });
});

describe('dragBendSmoothCubicSecondControl', () => {
  it('inherits symmetric cubic outgoing control for S-authoring UX', () => {
    const s2 = dragBendSmoothCubicSecondControl(
      { x: 0, y: 0 },
      { x: 9, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: -3 }
    );
    expect(s2.x2).toBeCloseTo(6, 6);
    expect(s2.y2).toBeCloseTo(-3, 6);
  });
});

describe('penPathSegmentsAreValid', () => {
  it('rejects empty and moveto-only', () => {
    expect(penPathSegmentsAreValid([])).toBe(false);
    expect(penPathSegmentsAreValid([{ type: 'M', x: 0, y: 0 }])).toBe(false);
  });

  it('accepts M followed by L', () => {
    expect(
      penPathSegmentsAreValid([
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 1, y: 1 }
      ])
    ).toBe(true);
  });

  it('accepts M followed by C', () => {
    expect(
      penPathSegmentsAreValid([
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 0, y1: 0, x2: 1, y2: 1, x: 2, y: 2 }
      ])
    ).toBe(true);
  });

  it('accepts M followed by Q, S, or T', () => {
    expect(
      penPathSegmentsAreValid([
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 1, y1: 1, x: 2, y: 2 }
      ])
    ).toBe(true);
    expect(
      penPathSegmentsAreValid([
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 0, y1: 0, x2: 1, y2: 0, x: 2, y: 0 },
        { type: 'S', x2: 3, y2: 1, x: 4, y: 0 }
      ])
    ).toBe(true);
    expect(
      penPathSegmentsAreValid([
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 1, y1: 2, x: 3, y: 0 },
        { type: 'T', x: 5, y: -1 }
      ])
    ).toBe(true);
  });
});

describe('lastCommittedVertex', () => {
  it('returns moveto point when only M', () => {
    expect(lastCommittedVertex([{ type: 'M', x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
  });

  it('returns end vertex of last segment', () => {
    expect(
      lastCommittedVertex([
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 1, y: 1 },
        { type: 'L', x: 5, y: 5 }
      ])
    ).toEqual({ x: 5, y: 5 });
  });
});

describe('penPathOnlyMoveto', () => {
  it('is true only for lone M', () => {
    expect(penPathOnlyMoveto([{ type: 'M', x: 0, y: 0 }])).toBe(true);
    expect(
      penPathOnlyMoveto([
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 1, y: 1 }
      ])
    ).toBe(false);
  });
});

describe('PenSession', () => {
  it('popLastCommittedSegment clears moveto-only session', () => {
    const s = new PenSession();
    s.beginPath(1, 2);
    expect(s.popLastCommittedSegment()).toBe('cleared');
    expect(s.getSegments().length).toBe(0);
  });

  it('popLastCommittedSegment removes last L and ends session when only M remains', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(5, 5);
    expect(s.popLastCommittedSegment()).toBe('cleared');
    expect(s.getSegments().length).toBe(0);
  });

  it('popLastCommittedSegment pops last segment when anchors remain', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(10, 0);
    s.addLinePoint(10, 10);
    expect(s.popLastCommittedSegment()).toBe('popped');
    expect(s.getSegments()).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ]);
  });

  it('restoreDrawableSegments replaces session content', () => {
    const s = new PenSession();
    s.beginPath(9, 9);
    s.addLinePoint(1, 1);
    s.restoreDrawableSegments([
      { type: 'M', x: 2, y: 3 },
      { type: 'L', x: 5, y: 6 }
    ]);
    expect(s.finishPath()).toBe('M 2 3 L 5 6');
  });

  it('finishPath returns null until at least two vertices', () => {
    const s = new PenSession();
    expect(s.finishPath()).toBe(null);
    s.beginPath(0, 0);
    expect(s.finishPath()).toBe(null);
    s.addLinePoint(5, 5);
    expect(s.finishPath()).toBe('M 0 0 L 5 5');
  });

  it('reset clears segments', () => {
    const s = new PenSession();
    s.beginPath(1, 1);
    s.addLinePoint(2, 2);
    s.reset();
    expect(s.getPathD()).toBe('');
    expect(s.finishPath()).toBe(null);
  });

  it('finishPath returns a full d with M, L, and C after line and symmetric cubic', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(5, 0);
    const c = symmetricCubicControlPoints({ x: 5, y: 0 }, { x: 10, y: 10 });
    s.appendCubic(c.x1, c.y1, c.x2, c.y2, 10, 10);
    expect(s.finishPath()).toBe('M 0 0 L 5 0 C 6.666667 3.333333 8.333333 6.666667 10 10');
  });

  it('finishPath serializes Q, S, and T from session', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(10, 0);
    s.appendCubic(10, 5, 15, 5, 20, 0);
    s.appendSmoothCubic(25, 5, 30, 0);
    s.appendQuadratic(32, 8, 35, 0);
    s.appendSmoothQuadratic(40, 0);
    const d = s.finishPath();
    expect(d).toMatch(/ Q /);
    expect(d).toMatch(/ S /);
    expect(d).toMatch(/ T /);
  });

  it('finishPath is null for moveto-only after reset and beginPath', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(2, 2);
    s.reset();
    s.beginPath(5, 5);
    expect(s.finishPath()).toBe(null);
  });

  it('appendCubic without beginPath does not produce a valid finishPath', () => {
    const s = new PenSession();
    s.appendCubic(0, 0, 1, 1, 2, 2);
    expect(s.finishPath()).toBe(null);
  });

  it('replaceSegmentAt swaps one drawable segment', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(10, 0);
    s.appendCubic(12, 2, 8, 2, 20, 0);
    s.replaceSegmentAt(1, { type: 'L', x: 15, y: 5 });
    expect(s.getSegments()[1]).toEqual({ type: 'L', x: 15, y: 5 });
  });
});

describe('movePenLastOutgoingHandleTo', () => {
  it('updates trailing C second control', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'C' as const, x1: 0, y1: 0, x2: 5, y2: 5, x: 10, y: 10 }
    ];
    const next = movePenLastOutgoingHandleTo(segs, 8, 2);
    expect(next?.[1]).toMatchObject({ type: 'C', x2: 8, y2: 2, x: 10, y: 10 });
  });

  it('converts trailing T to Q when dragging implied control', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'Q' as const, x1: 5, y1: 10, x: 10, y: 0 },
      { type: 'T' as const, x: 20, y: 0 }
    ];
    const next = movePenLastOutgoingHandleTo(segs, 12, 4)!;
    expect(next[2]).toEqual({ type: 'Q', x1: 12, y1: 4, x: 20, y: 0 });
  });
});

describe('penLastOutgoingHandleSvg', () => {
  it('returns endpoint to second control for C', () => {
    const segs = [
      { type: 'M' as const, x: 0, y: 0 },
      { type: 'C' as const, x1: 0, y1: 0, x2: 4, y2: 4, x: 10, y: 10 }
    ];
    expect(penLastOutgoingHandleSvg(segs)).toEqual({
      anchorX: 10,
      anchorY: 10,
      hx: 4,
      hy: 4
    });
  });
});

describe('snapVectorTo45DegFrom', () => {
  it('snaps to nearest 45° increment preserving length from origin', () => {
    const o = { x: 0, y: 0 };
    const t = { x: 1.1, y: 0.2 };
    const s = snapVectorTo45DegFrom(o, t);
    const ang = (Math.atan2(s.y - o.y, s.x - o.x) * 180) / Math.PI;
    expect(ang).toBeCloseTo(0, 5);
    expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeCloseTo(Math.hypot(t.x - o.x, t.y - o.y), 5);
  });
});

describe('dragBendCubicControlPoints breakHandleSymmetry', () => {
  it('freezes first control at symmetric baseline while bending only the second', () => {
    const sym = dragBendCubicControlPoints(
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 45, y: 0 },
      { x: 45, y: -30 },
      false
    );
    const asym = dragBendCubicControlPoints(
      { x: 0, y: 0 },
      { x: 90, y: 0 },
      { x: 45, y: 0 },
      { x: 45, y: -30 },
      true
    );
    const base = symmetricCubicControlPoints({ x: 0, y: 0 }, { x: 90, y: 0 });
    expect(asym.x1).toBeCloseTo(base.x1, 6);
    expect(asym.y1).toBeCloseTo(base.y1, 6);
    expect(sym.y1).not.toBeCloseTo(asym.y1, 2);
  });
});
