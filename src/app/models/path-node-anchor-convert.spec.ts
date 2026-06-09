import { describe, it, expect } from 'vitest';
import type { PathSegment } from './path-d';
import { symmetricCubicControlPoints } from './pen-path';
import {
  collectPathNodeAnchorsForPathNodeConversion,
  convertPathAnchorAtMoveSegmentIndexToCorner,
  convertPathAnchorAtMoveSegmentIndexToMirrorCubic,
  getMirrorCubicJointUiState,
  PATH_NODE_ANCHOR_UNSUPPORTED_JOINT_FEEDBACK,
  resolvePathNodeConversionLegs
} from './path-node-anchor-convert';

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

  it('closed subpath M: incoming only (segment before Z)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 },
      { type: 'Z' }
    ];
    const legs = resolvePathNodeConversionLegs(segments, 0);
    expect(legs?.incoming).toBe(3);
    expect(legs?.outgoing).toBeNull();
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
  it('flattens C–C joint to L–L', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    const r = convertPathAnchorAtMoveSegmentIndexToCorner(segments, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.segments[1]).toEqual({ type: 'L', x: 5, y: 0 });
    expect(r.segments[2]).toEqual({ type: 'L', x: 10, y: 0 });
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
  it('converts L–L to C–C with mirrored handles off the chords (visible bend)', () => {
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
    const symIn = symmetricCubicControlPoints(p0, V);
    const symOut = symmetricCubicControlPoints(V, B);

    const inc = r.segments[1] as Extract<PathSegment, { type: 'C' }>;
    const out = r.segments[2] as Extract<PathSegment, { type: 'C' }>;

    expect(inc.type).toBe('C');
    expect(inc.x1).toBeCloseTo(symIn.x1, 5);
    expect(inc.y1).toBeCloseTo(symIn.y1, 5);
    expect(inc.x).toBe(V.x);
    expect(inc.y).toBe(V.y);

    // Second incoming control should not sit on the straight chord P0→V (otherwise zero bend).
    const crossChord =
      (inc.x2 - p0.x) * (V.y - p0.y) - (inc.y2 - p0.y) * (V.x - p0.x);
    expect(Math.abs(crossChord)).toBeGreaterThan(1e-3);

    // Incoming end tangent 3(V − c2) must point toward B (avoids inverted handles / hourglass fold).
    const tdx = V.x - inc.x2;
    const tdy = V.y - inc.y2;
    expect(tdx * (B.x - V.x) + tdy * (B.y - V.y)).toBeGreaterThan(1e-6);

    expect(out.x2).toBeCloseTo(symOut.x2, 5);
    expect(out.y2).toBeCloseTo(symOut.y2, 5);
    expect(out.x).toBe(B.x);
    expect(out.y).toBe(B.y);

    // Mirrored through V (same pattern as pen L+L insert drag).
    expect(out.x1).toBeCloseTo(2 * V.x - inc.x2, 5);
    expect(out.y1).toBeCloseTo(2 * V.y - inc.y2, 5);

    // Handle axis should align with neighbor chord p0→B.
    const ux = B.x - p0.x;
    const uy = B.y - p0.y;
    const ulen = Math.hypot(ux, uy);
    const vx = inc.x2 - V.x;
    const vy = inc.y2 - V.y;
    const vlen = Math.hypot(vx, vy);
    expect(ulen).toBeGreaterThan(1e-6);
    expect(vlen).toBeGreaterThan(1e-6);
    const dot = Math.abs((vx * ux + vy * uy) / (vlen * ulen));
    expect(dot).toBeGreaterThan(1 - 1e-5);
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

describe('getMirrorCubicJointUiState', () => {
  it('detects already-cubic joint', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 0, x2: 4, y2: 0, x: 5, y: 0 },
      { type: 'C', x1: 6, y1: 0, x2: 9, y2: 0, x: 10, y: 0 }
    ];
    expect(getMirrorCubicJointUiState(segments, 1).kind).toBe('already-cubic-noop');
  });

  it('requires two lines for open M (outgoing L only)', () => {
    const segments: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 }
    ];
    expect(getMirrorCubicJointUiState(segments, 0).kind).toBe('needs-two-lines');
  });
});
