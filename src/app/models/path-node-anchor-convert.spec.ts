import { describe, it, expect } from 'vitest';
import type { PathSegment } from './path-d';
import { mirrorCornerCubicsFromStraightLL, symmetricCubicControlPoints } from './pen-path';
import {
  collectPathNodeAnchorsForPathNodeConversion,
  convertPathAnchorAtMoveSegmentIndexToCorner,
  convertPathAnchorAtMoveSegmentIndexToIndependentHandles,
  convertPathAnchorAtMoveSegmentIndexToMirrorCubic,
  getIndependentHandlesJointUiState,
  getMirrorCubicJointUiState,
  isPathNodeCornerAnchorAlreadyApplied,
  PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK,
  resolvePathNodeConversionLegs
} from './path-node-anchor-convert';

/**
 * Mirror cubic at `V`: incoming cubic ends with `(inc.x2, inc.y2)` and outgoing starts with
 * `(out.x1, out.y1)`. For a true 180° mirror (equal-length opposing arms, C1 joint), SVG cubic
 * end/start tangents align: `V − inc.x2 === out.x1 − V` (equivalently `inc.x2 + out.x1 === 2V`).
 */
function expectCubicJointMirror180AtVertex(
  inc: Extract<PathSegment, { type: 'C' }>,
  out: Extract<PathSegment, { type: 'C' }>,
  V: { x: number; y: number }
): void {
  const tanInX = V.x - inc.x2;
  const tanInY = V.y - inc.y2;
  const tanOutX = out.x1 - V.x;
  const tanOutY = out.y1 - V.y;
  expect(tanOutX).toBeCloseTo(tanInX, 6);
  expect(tanOutY).toBeCloseTo(tanInY, 6);
}

describe('resolvePathNodeConversionLegs', () => {
  it('open path M: outgoing only (first segment after M)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const legs = resolvePathNodeConversionLegs(segments, 0);
    expect(legs).toEqual({
      incoming: null,
      outgoing: 1,
      vertex: { x: 0, y: 0 }
    });
  });

  it('closed subpath M: incoming (before Z) and outgoing (first segment after M)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 },
      { type: 'Z' }
    ];
    const legs = resolvePathNodeConversionLegs(segments, 0);
    expect(legs?.incoming).toBe(3);
    expect(legs?.outgoing).toBe(1);
    expect(legs?.vertex).toEqual({ x: 0, y: 0 });
  });

  it('last node on open path: incoming only', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const anchors = collectPathNodeAnchorsForPathNodeConversion(segments);
    const last = anchors[anchors.length - 1];
    const legs = resolvePathNodeConversionLegs(segments, last.moveSegmentIndex);
    expect(legs?.incoming).toBe(last.moveSegmentIndex);
    expect(legs?.outgoing).toBeNull();
  });

  it('interior joint: incoming + outgoing', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const legs = resolvePathNodeConversionLegs(segments, 1);
    expect(legs?.incoming).toBe(1);
    expect(legs?.outgoing).toBe(2);
  });
});

describe('convertPathAnchorAtMoveSegmentIndexToCorner', () => {
  it('breaks smoothness at the joint without replacing cubics with lines (only handles at V)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const b = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expect(a.type).toBe('C');
    expect(b.type).toBe('C');
    expect(a.x1).toBe(1);
    expect(a.y1).toBe(0);
    expect(a.x2).toBe(5);
    expect(a.y2).toBe(0);
    expect(b.x1).toBe(5);
    expect(b.y1).toBe(0);
    expect(b.x2).toBe(9);
    expect(b.y2).toBe(0);
  });

  it('only adjusts outgoing cubic when incoming leg is L', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 8, y2: 2, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[1]).toEqual({ type: 'L', x: 5, y: 0 });
    const c = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expect(c.x1).toBe(5);
    expect(c.y1).toBe(0);
    expect(c.x2).toBe(8);
    expect(c.y2).toBe(2);
  });

  it('only adjusts incoming cubic when outgoing leg is L', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 1, x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    expect(c.x1).toBe(1);
    expect(c.y1).toBe(0);
    expect(c.x2).toBe(5);
    expect(c.y2).toBe(0);
    expect(r.segments[2]).toEqual({ type: 'L', x: 10, y: 0 });
  });

  it('succeeds with no cubic edits when both legs are already lines', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments).toEqual(segments);
  });

  it('closed path at M: collapses handles on both closing and opening cubics at the start vertex', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 2, y1: 0, x2: 4, y2: 0, x: 10, y: 0 },
      { type: 'C', x1: 16, y1: 0, x2: 18, y2: 0, x: 20, y: 0 },
      { type: 'C', x1: 16, y1: 10, x2: 4, y2: 10, x: 0, y: 0 },
      { type: 'Z' }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const opening = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const closing = r.segments[3] as Extract<PathSegment, { type: 'C' }>;
    expect(opening.x1).toBe(0);
    expect(opening.y1).toBe(0);
    expect(closing.x2).toBe(0);
    expect(closing.y2).toBe(0);
    expect(opening.x2).toBe(4);
    expect(closing.x1).toBe(16);
  });

  it('reports corner already applied when cubic handles sit on the vertex', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 5, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(isPathNodeCornerAnchorAlreadyApplied(segments, 1)).toBe(true);
  });

  it('rejects Q at joint', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 5, y1: -2, x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.feedback).toBe(PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK);
  });
});

describe('convertPathAnchorAtMoveSegmentIndexToMirrorCubic', () => {
  it('converts corner L–L to C–C using mirrorCornerCubicsFromStraightLL (C1 mirror at V)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const p0 = { x: 0, y: 0 };
    const V = { x: 10, y: 0 };
    const B = { x: 10, y: 10 };
    const pair = mirrorCornerCubicsFromStraightLL(p0, V, B);
    if (!pair) throw new Error('expected pair');

    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;

    expect(inc.type).toBe('C');
    // Start anchor (0,0) is corner-like: snap pins far-side handle onto M.
    expect(inc.x1).toBe(0);
    expect(inc.y1).toBe(0);
    expect(inc.x2).toBeCloseTo(pair.incoming.x2, 6);
    expect(inc.y2).toBeCloseTo(pair.incoming.y2, 6);
    expect(inc.x).toBe(V.x);
    expect(inc.y).toBe(V.y);

    expect(out.type).toBe('C');
    expect(out.x1).toBeCloseTo(pair.outgoing.x1, 6);
    expect(out.y1).toBeCloseTo(pair.outgoing.y1, 6);
    // Outgoing was L→C: far handle pinned onto end anchor (corner look).
    expect(out.x2).toBe(B.x);
    expect(out.y2).toBe(B.y);
    expect(out.x).toBe(B.x);
    expect(out.y).toBe(B.y);

    expectCubicJointMirror180AtVertex(inc, out, V);
  });

  it('closed path at M: mirrors across wrap (last segment before Z + first after M)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 0 },
      { type: 'Z' }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inc = r.segments[3] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    expect(inc.type).toBe('C');
    expect(out.type).toBe('C');
    expectCubicJointMirror180AtVertex(inc, out, { x: 0, y: 0 });
  });

  it('after corner L–L mirror, pins incoming x1 to M when that anchor stays corner-like', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    expect(inc.x1).toBe(0);
    expect(inc.y1).toBe(0);
  });

  it('returns not-ok without feedback for already C–C joint', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.feedback).toBeUndefined();
  });

  it('mirror cubic from corner-like C–C only moves handles at V; keeps far controls', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 5, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expect(inc.x1).toBe(1);
    expect(inc.y1).toBe(0);
    expect(out.x2).toBe(9);
    expect(out.y2).toBe(0);
    const V = { x: 5, y: 0 };
    const symIn = symmetricCubicControlPoints({ x: 0, y: 0 }, V);
    const symOut = symmetricCubicControlPoints(V, { x: 10, y: 0 });
    expect(inc.x2).toBeCloseTo(symIn.x2, 5);
    expect(inc.y2).toBeCloseTo(symIn.y2, 5);
    expect(out.x1).toBeCloseTo(symOut.x1, 5);
    expect(out.y1).toBeCloseTo(symOut.y1, 5);
  });

  it('rejects Q at joint for mirror cubic', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 5, y1: -2, x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.feedback).toBe(PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK);
  });
});

describe('convertPathAnchorAtMoveSegmentIndexToMirrorCubic — joint tangent mirror (180° at V)', () => {
  it('L–L corner: joint handles mirror 180° through V (non-collinear neighbors)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 10, y: 0 };
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expectCubicJointMirror180AtVertex(inc, out, V);
  });

  it('L–C corner: joint handles mirror 180° through V', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: 0, x2: 12, y2: 8, x: 20, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 10, y: 0 };
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expectCubicJointMirror180AtVertex(inc, out, V);
  });

  it('C–C corner-like: joint handles mirror 180° through V (non-collinear)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 1, x2: 10, y2: 0, x: 10, y: 0 },
      { type: 'C', x1: 10, y1: 0, x2: 14, y2: 4, x: 18, y: 8 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 10, y: 0 };
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expectCubicJointMirror180AtVertex(inc, out, V);
  });

  it('collinear neighbors: chord-thirds already give matching tangents at V', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToMirrorCubic(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 5, y: 0 };
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expectCubicJointMirror180AtVertex(inc, out, V);
  });
});

describe('getMirrorCubicJointUiState', () => {
  it('detects already-cubic joint', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(getMirrorCubicJointUiState(segments, 1).kind).toBe('already-cubic-noop');
  });

  it('treats C–C with handles collapsed on vertex as applicable (corner-like)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 5, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(getMirrorCubicJointUiState(segments, 1).kind).toBe('applicable');
  });

  it('requires two lines for open M (outgoing L only)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    expect(getMirrorCubicJointUiState(segments, 0).kind).toBe('needs-two-lines');
  });
});

describe('getIndependentHandlesJointUiState', () => {
  it('link-only on C–C with both joint handles off the vertex', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(getIndependentHandlesJointUiState(segments, 1).kind).toBe('link-only');
  });

  it('promote-from-corner on corner-like L–L', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    expect(getIndependentHandlesJointUiState(segments, 1).kind).toBe('promote-from-corner');
  });

  it('promote-from-corner when cubic handles are collapsed on the vertex', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 5, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(getIndependentHandlesJointUiState(segments, 1).kind).toBe('promote-from-corner');
  });
});

describe('convertPathAnchorAtMoveSegmentIndexToIndependentHandles', () => {
  it('from corner C–C: places joint handles on chord thirds (1/3 from each anchor)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 5, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 5, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToIndependentHandles(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 5, y: 0 };
    const p0 = { x: 0, y: 0 };
    const B = { x: 10, y: 0 };
    const symIn = symmetricCubicControlPoints(p0, V);
    const symOut = symmetricCubicControlPoints(V, B);
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expect(inc.x2).toBe(symIn.x2);
    expect(inc.y2).toBe(symIn.y2);
    expect(out.x1).toBe(symOut.x1);
    expect(out.y1).toBe(symOut.y1);
    expect(inc.x1).toBe(1);
    expect(out.x2).toBe(9);
  });

  it('from corner L–L: promotes both legs to C with chord-third controls at V', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToIndependentHandles(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const V = { x: 10, y: 0 };
    const p0 = { x: 0, y: 0 };
    const B = { x: 10, y: 10 };
    const symIn = symmetricCubicControlPoints(p0, V);
    const symOut = symmetricCubicControlPoints(V, B);
    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;
    expect(inc.x2).toBe(symIn.x2);
    expect(inc.y2).toBe(symIn.y2);
    expect(out.x1).toBe(symOut.x1);
    expect(out.y1).toBe(symOut.y1);
    expect(inc.x1).toBe(0);
    expect(inc.y1).toBe(0);
    expect(out.x2).toBe(B.x);
    expect(out.y2).toBe(B.y);
  });
});
