import { describe, expect, it } from 'vitest';
import { parsePathD, pathSegmentsToD } from './path-d';
import { applyPenPathInsert, findPenPathInsertHit, insertPenNodeOnParsedPath } from './path-pen-insert';

describe('path-pen-insert', () => {
  it('findPenPathInsertHit returns L hit on horizontal segment', () => {
    const segments = parsePathD('M 0 0 L 100 0').segments;
    const hit = findPenPathInsertHit(segments, 50, 4, 100);
    expect(hit?.kind).toBe('L');
    if (hit?.kind === 'L') {
      expect(hit.segmentIndex).toBe(1);
      expect(hit.x).toBeCloseTo(50, 5);
      expect(hit.y).toBeCloseTo(0, 5);
    }
  });

  it('findPenPathInsertHit returns L hit near segment ends (not only interior 2–98% t)', () => {
    const segments = parsePathD('M 0 0 L 100 0').segments;
    const nearStart = findPenPathInsertHit(segments, 0.5, 0, 100);
    expect(nearStart?.kind).toBe('L');
    if (nearStart?.kind === 'L') {
      expect(nearStart.x).toBeCloseTo(0.5, 5);
    }
    const nearEnd = findPenPathInsertHit(segments, 99.2, 0, 100);
    expect(nearEnd?.kind).toBe('L');
    if (nearEnd?.kind === 'L') {
      expect(nearEnd.x).toBeCloseTo(99.2, 5);
    }
  });

  it('insertPenNodeOnParsedPath splits a line segment', () => {
    const segments = parsePathD('M 0 0 L 100 0').segments;
    const next = insertPenNodeOnParsedPath(segments, 25, 0, 400);
    expect(next).not.toBeNull();
    expect(next!.filter((s) => s.type === 'L').length).toBe(2);
    const d = pathSegmentsToD(next!);
    const round = parsePathD(d);
    expect(round.errors).toEqual([]);
  });

  it('insertPenNodeOnParsedPath subdivides a cubic', () => {
    const segments = parsePathD('M 0 0 C 0 50 100 50 100 0').segments;
    const next = insertPenNodeOnParsedPath(segments, 50, 38, 900);
    expect(next).not.toBeNull();
    expect(next!.filter((s) => s.type === 'C').length).toBe(2);
  });

  it('insertPenNodeOnParsedPath subdivides a quadratic', () => {
    const segments = parsePathD('M 0 0 Q 50 80 100 0').segments;
    const next = insertPenNodeOnParsedPath(segments, 50, 40, 900);
    expect(next).not.toBeNull();
    expect(next!.filter((s) => s.type === 'Q').length).toBe(2);
  });

  it('returns null when click is too far from path', () => {
    const segments = parsePathD('M 0 0 L 100 0').segments;
    expect(insertPenNodeOnParsedPath(segments, 50, 50, 4)).toBeNull();
  });

  it('applyPenPathInsert inserts L before Z on closing edge', () => {
    const segments = parsePathD('M 0 0 L 10 0 L 10 10 L 0 10 Z').segments;
    const hit = findPenPathInsertHit(segments, 0, 5, 100);
    expect(hit?.kind).toBe('Z');
    if (hit?.kind === 'Z') {
      const next = applyPenPathInsert(segments, hit);
      expect(next).not.toBeNull();
      const zIndex = next!.findIndex((s) => s.type === 'Z');
      expect(zIndex).toBeGreaterThan(0);
      expect(next![zIndex - 1].type).toBe('L');
    }
  });
});
