import { describe, expect, it } from 'vitest';
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
    const result = parsePathD('M 0 0 S 10 10 20 20 L 30 40');
    expect(result.segments).toEqual([{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 30, y: 40 }]);
    expect(result.errors).toContain('Unsupported path command "S".');
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

  it('returns null when parse errors exist', () => {
    expect(parsePathDForNodeEditing('M 0 0 A 1 1 0 0 0 5 0')).toBeNull();
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
