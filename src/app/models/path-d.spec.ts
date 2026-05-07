import { describe, expect, it } from 'vitest';
import { penPathSegmentsToD } from './pen-path';
import { parsePathD, parsePathDForNodeEditing, pathSegmentsToD } from './path-d';

describe('parsePathD', () => {
  it('parses absolute M/L/C/Z commands', () => {
    const result = parsePathD('M 10 20 L 40 50 C 50 60 70 80 90 100 Z');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 10, y: 20 },
      { type: 'L', x: 40, y: 50 },
      { type: 'C', x1: 50, y1: 60, x2: 70, y2: 80, x: 90, y: 100 },
      { type: 'Z' }
    ]);
  });

  it('parses relative commands into absolute coordinates', () => {
    const result = parsePathD('m 10 20 l 5 -5 c 10 0 20 10 30 0 z');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 10, y: 20 },
      { type: 'L', x: 15, y: 15 },
      { type: 'C', x1: 25, y1: 15, x2: 35, y2: 25, x: 45, y: 15 },
      { type: 'Z' }
    ]);
  });

  it('supports implicit lineto pairs after moveto', () => {
    const result = parsePathD('M 0 0 10 10 20 20');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 20, y: 20 }
    ]);
  });

  it('tolerates malformed input and reports errors without throwing', () => {
    const result = parsePathD('M 0 0 L 10, C 20 20 30');
    expect(result.segments).toEqual([{ type: 'M', x: 0, y: 0 }]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('keeps parsing valid commands around malformed tokens', () => {
    const result = parsePathD('M 0 0 L 10 ? 20 L 30 40');
    expect(result.segments).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 20 },
      { type: 'L', x: 30, y: 40 }
    ]);
    expect(result.errors.some((error) => error.includes('Unexpected token'))).toBe(true);
  });

  it('reports unsupported commands as errors', () => {
    const result = parsePathD('M 0 0 R 10 10 20 20 L 30 40');
    expect(result.segments).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 30, y: 40 }]);
    expect(result.errors).toContain('Unsupported path command "R".');
  });

  it('parses arc commands by normalizing to cubic segments', () => {
    const result = parsePathD('M 10 10 A 10 10 0 0 1 30 10');
    expect(result.errors).toEqual([]);
    expect(result.segments[0]).toEqual({ type: 'M', x: 10, y: 10 });
    expect(result.segments[1]?.type).toBe('C');
    const last = result.segments[result.segments.length - 1];
    expect(last).toMatchObject({ type: 'C', x: 30, y: 10 });
  });

  it('parses relative arcs into absolute cubic segments', () => {
    const result = parsePathD('M 5 5 a 15 10 30 0 1 20 10');
    expect(result.errors).toEqual([]);
    expect(result.segments[0]).toEqual({ type: 'M', x: 5, y: 5 });
    const last = result.segments[result.segments.length - 1];
    expect(last).toMatchObject({ type: 'C', x: 25, y: 15 });
  });

  it('splits large arcs into multiple cubic segments', () => {
    const result = parsePathD('M 0 0 A 40 40 0 1 1 0 80');
    expect(result.errors).toEqual([]);
    const cubicCount = result.segments.filter((segment) => segment.type === 'C').length;
    expect(cubicCount).toBeGreaterThan(1);
  });

  it('falls back to line for zero-radius arc', () => {
    const result = parsePathD('M 0 0 A 0 10 0 0 1 20 30');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 20, y: 30 }
    ]);
  });

  it('normalizes H/V commands into L segments', () => {
    const result = parsePathD('M 1 2 H 5 v 3 h -2 V 0');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 5, y: 2 },
      { type: 'L', x: 5, y: 5 },
      { type: 'L', x: 3, y: 5 },
      { type: 'L', x: 3, y: 0 }
    ]);
  });

  it('parses absolute Q and normalizes T using reflected control', () => {
    const result = parsePathD('M 0 0 Q 5 10 10 0 T 20 0');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 5, y1: 10, x: 10, y: 0 },
      { type: 'Q', x1: 15, y1: -10, x: 20, y: 0 }
    ]);
  });

  it('parses relative q and t', () => {
    const result = parsePathD('M 10 10 q 5 5 5 0 t 5 0');
    expect(result.errors).toEqual([]);
    expect(result.segments).toEqual([
      { type: 'M', x: 10, y: 10 },
      { type: 'Q', x1: 15, y1: 15, x: 15, y: 10 },
      { type: 'Q', x1: 15, y1: 5, x: 20, y: 10 }
    ]);
  });

  it('round-trips mixed M L C Q Z', () => {
    const d = 'M 0 0 L 10 0 Q 15 10 20 0 C 25 0 30 5 30 10 Z';
    const parsed = parsePathD(d);
    expect(parsed.errors).toEqual([]);
    const out = pathSegmentsToD(parsed.segments);
    const again = parsePathD(out);
    expect(again.errors).toEqual([]);
    expect(again.segments).toEqual(parsed.segments);
  });

  it('round-trips pen-authored M L C S Q T through parse → explicit d → parse', () => {
    const d = penPathSegmentsToD([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'C', x1: 10, y1: 5, x2: 15, y2: 5, x: 20, y: 0 },
      { type: 'S', x2: 25, y2: 5, x: 30, y: 0 },
      { type: 'Q', x1: 32, y1: 8, x: 35, y: 0 },
      { type: 'T', x: 40, y: 0 }
    ]);
    const first = parsePathD(d);
    expect(first.errors).toEqual([]);
    const serialized = pathSegmentsToD(first.segments);
    const second = parsePathD(serialized);
    expect(second.errors).toEqual([]);
    expect(second.segments).toEqual(first.segments);
  });
});

describe('parsePathDForNodeEditing', () => {
  it('returns segments when path is clean M/L/C/Z', () => {
    const s = parsePathDForNodeEditing('M 0 0 L 10 0 Z');
    expect(s).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'Z' }
    ]);
  });

  it('returns segments when path includes Q/T', () => {
    const s = parsePathDForNodeEditing('M 0 0 Q 5 10 10 0 T 15 0 Z');
    expect(s?.length).toBe(4);
    expect(s?.[1]).toEqual({ type: 'Q', x1: 5, y1: 10, x: 10, y: 0 });
    expect(s?.[2].type).toBe('Q');
  });

  it('normalizes absolute smooth cubic S to explicit cubic C', () => {
    const s = parsePathDForNodeEditing('M 0 0 C 10 10 20 10 30 0 S 50 -10 60 0');
    expect(s?.length).toBe(3);
    expect(s?.[1]).toEqual({ type: 'C', x1: 10, y1: 10, x2: 20, y2: 10, x: 30, y: 0 });
    expect(s?.[2]).toEqual({ type: 'C', x1: 40, y1: -10, x2: 50, y2: -10, x: 60, y: 0 });
  });

  it('normalizes relative smooth cubic s and supports command chaining', () => {
    const s = parsePathDForNodeEditing('M 10 10 c 10 0 20 0 30 0 s 10 10 20 0 10 -10 20 0');
    expect(s?.length).toBe(4);
    expect(s?.[1]).toEqual({ type: 'C', x1: 20, y1: 10, x2: 30, y2: 10, x: 40, y: 10 });
    expect(s?.[2]).toEqual({ type: 'C', x1: 50, y1: 10, x2: 50, y2: 20, x: 60, y: 10 });
    expect(s?.[3]).toEqual({ type: 'C', x1: 70, y1: 0, x2: 70, y2: 0, x: 80, y: 10 });
  });

  it('uses current point as first control for S when previous segment is non-cubic', () => {
    const s = parsePathDForNodeEditing('M 0 0 Q 10 10 20 0 S 40 0 50 10');
    expect(s?.length).toBe(3);
    expect(s?.[2]).toEqual({ type: 'C', x1: 20, y1: 0, x2: 40, y2: 0, x: 50, y: 10 });
  });

  it('returns cubic-normalized segments for arc paths', () => {
    const s = parsePathDForNodeEditing('M 0 0 A 10 5 0 0 1 20 0');
    expect(s).not.toBeNull();
    expect(s?.[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(s?.some((segment) => segment.type === 'C')).toBe(true);
  });

  it('returns segments for mixed arc + H/V icon-style path data', () => {
    const pathData =
      'M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414A2 2 0 0 0 3 11.586l-2 2V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z';
    const s = parsePathDForNodeEditing(pathData);
    expect(s).not.toBeNull();
    expect(s?.[0]?.type).toBe('M');
    expect(s?.some((segment) => segment.type === 'C')).toBe(true);
    expect(s?.some((segment) => segment.type === 'L')).toBe(true);
  });

  it('returns null when parse errors exist', () => {
    expect(parsePathDForNodeEditing('M 0 0 A 1 1 0 0')).toBeNull();
  });
});

describe('pathSegmentsToD', () => {
  it('serializes parsed segments with equivalent semantics', () => {
    const parsed = parsePathD('m 10 10 l 20 0 c 5 5 15 5 20 0 z');
    expect(parsed.errors).toEqual([]);
    const serialized = pathSegmentsToD(parsed.segments);
    expect(serialized).toBe('M 10 10 L 30 10 C 35 15 45 15 50 10 Z');

    const reparsed = parsePathD(serialized);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.segments).toEqual(parsed.segments);
  });

  it('returns an empty string for no segments', () => {
    expect(pathSegmentsToD([])).toBe('');
  });

  it('round-trips multi-subpath data with close commands', () => {
    const parsed = parsePathD('M 0 0 L 10 0 Z m 5 5 l 0 10 z');
    expect(parsed.errors).toEqual([]);

    const serialized = pathSegmentsToD(parsed.segments);
    expect(serialized).toBe('M 0 0 L 10 0 Z M 5 5 L 5 15 Z');

    const reparsed = parsePathD(serialized);
    expect(reparsed.errors).toEqual([]);
    expect(reparsed.segments).toEqual(parsed.segments);
  });
});
