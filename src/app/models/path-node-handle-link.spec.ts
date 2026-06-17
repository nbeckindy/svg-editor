import { describe, expect, it } from 'vitest';
import {
  parsePathNodeHandleLinkMap,
  remapPathNodeHandleLinkMapAfterSegmentRemoval,
  remapPathNodeHandleLinkMapByStableAnchors,
  serializePathNodeHandleLinkMap
} from './path-node-handle-link';
import type { PathSegment } from './path-d';

describe('parsePathNodeHandleLinkMap / serializePathNodeHandleLinkMap', () => {
  it('round-trips independent entries', () => {
    const m = new Map<number, 'independent'>([
      [1, 'independent'],
      [5, 'independent']
    ]);
    const ser = serializePathNodeHandleLinkMap(m)!;
    expect(JSON.parse(ser)).toEqual({ '1': 'independent', '5': 'independent' });
    const back = parsePathNodeHandleLinkMap(ser);
    expect([...back.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 'independent'],
      [5, 'independent']
    ]);
  });

  it('returns empty map for invalid JSON', () => {
    expect([...parsePathNodeHandleLinkMap('not json').entries()]).toEqual([]);
  });

  it('serialize returns null for empty map', () => {
    expect(serializePathNodeHandleLinkMap(new Map())).toBeNull();
  });
});

describe('remapPathNodeHandleLinkMapAfterSegmentRemoval', () => {
  it('drops removed index and shifts higher keys', () => {
    const m = new Map<number, 'independent'>([
      [0, 'independent'],
      [2, 'independent'],
      [4, 'independent']
    ]);
    const r = remapPathNodeHandleLinkMapAfterSegmentRemoval(m, 2);
    expect([...r.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 'independent'],
      [3, 'independent']
    ]);
  });
});

describe('remapPathNodeHandleLinkMapByStableAnchors', () => {
  it('re-keys by vertex position after insert', () => {
    const oldSegs: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const newSegs: PathSegment[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 }
    ];
    const oldMap = new Map<number, 'independent'>([[1, 'independent']]);
    const next = remapPathNodeHandleLinkMapByStableAnchors(oldSegs, newSegs, oldMap);
    expect(next.get(2)).toBe('independent');
  });
});
