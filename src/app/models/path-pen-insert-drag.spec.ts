import { describe, expect, it } from 'vitest';
import { parsePathDForNodeEditing, type PathSegment } from './path-d';
import { applyPenPathInsert, findPenPathInsertHit } from './path-pen-insert';
import {
  adjustSplitSegmentsForPenInsertDrag,
  penInsertHitAnchorSvg,
  penInsertMoveSegmentIndexAfterSplit
} from './path-pen-insert-drag';

describe('adjustSplitSegmentsForPenInsertDrag', () => {
  it('keeps inserted cubic anchor fixed and mirrors outgoing x1y1 through the vertex', () => {
    const parsed = parsePathDForNodeEditing('M 0 0 C 10 0 20 10 30 0');
    expect(parsed).not.toBeNull();
    const hit = findPenPathInsertHit(parsed!, 15, 4, 2500);
    expect(hit).not.toBeNull();
    const split = applyPenPathInsert(parsed!, hit!);
    expect(split).not.toBeNull();
    const insertIdx = penInsertMoveSegmentIndexAfterSplit(hit!);
    const V = penInsertHitAnchorSvg(parsed!, hit!);
    expect(V).not.toBeNull();

    const work = split!.map((s) => ({ ...s }));
    const far = { x: V!.x + 30, y: V!.y + 40 };
    adjustSplitSegmentsForPenInsertDrag(work, insertIdx, V!, far);

    const segIn = work[insertIdx];
    const segOut = work[insertIdx + 1];
    expect(segIn?.type).toBe('C');
    expect(segOut?.type).toBe('C');
    if (segIn?.type !== 'C' || segOut?.type !== 'C') return;

    expect(segIn.x).toBeCloseTo(V!.x, 5);
    expect(segIn.y).toBeCloseTo(V!.y, 5);
    expect(segOut.x1).toBeCloseTo(2 * V!.x - segIn.x2, 5);
    expect(segOut.y1).toBeCloseTo(2 * V!.y - segIn.y2, 5);

    const splitIn = split![insertIdx] as Extract<PathSegment, { type: 'C' }>;
    const splitOut = split![insertIdx + 1] as Extract<PathSegment, { type: 'C' }>;
    expect(segIn.x1).toBeCloseTo(splitIn.x1, 8);
    expect(segIn.y1).toBeCloseTo(splitIn.y1, 8);
    expect(segOut.x2).toBeCloseTo(splitOut.x2, 8);
    expect(segOut.y2).toBeCloseTo(splitOut.y2, 8);
  });

  it('converts L–L split to C–C with bend at V when dragging off the chord', () => {
    const parsed = parsePathDForNodeEditing('M 0 0 L 100 0');
    expect(parsed).not.toBeNull();
    const hit = findPenPathInsertHit(parsed!, 40, 1, 1e6);
    expect(hit).not.toBeNull();
    const split = applyPenPathInsert(parsed!, hit!);
    expect(split).not.toBeNull();
    const insertIdx = penInsertMoveSegmentIndexAfterSplit(hit!);
    const V = penInsertHitAnchorSvg(parsed!, hit!);
    expect(V).not.toBeNull();

    const work = split!.map((s) => ({ ...s }));
    adjustSplitSegmentsForPenInsertDrag(work, insertIdx, V!, { x: 40, y: 35 });

    expect(work[insertIdx].type).toBe('C');
    expect(work[insertIdx + 1].type).toBe('C');
    const cin = work[insertIdx] as Extract<PathSegment, { type: 'C' }>;
    expect(cin.x1).toBeCloseTo(40 / 3, 5);
    expect(cin.y1).toBeCloseTo(0, 5);
    expect(cin.y2).not.toBeCloseTo(0, 1);
  });
});
