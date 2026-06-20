import { describe, expect, it } from 'vitest';
import { ellipseToClosedSubpath, rectToClosedSubpath } from './primitive-to-path';

describe('primitive-to-path', () => {
  it('rectToClosedSubpath builds a closed axis-aligned rectangle', () => {
    const segs = rectToClosedSubpath(10, 20, 30, 40);
    expect(segs[0]).toEqual({ type: 'M', x: 10, y: 20 });
    expect(segs.at(-1)).toEqual({ type: 'Z' });
    expect(segs.some((s) => s.type === 'C')).toBe(false);
  });

  it('rectToClosedSubpath uses cubics for rounded corners', () => {
    const segs = rectToClosedSubpath(0, 0, 100, 50, 10, 10);
    expect(segs.some((s) => s.type === 'C')).toBe(true);
    expect(segs.at(-1)).toEqual({ type: 'Z' });
  });

  it('ellipseToClosedSubpath builds four cubics and closes', () => {
    const segs = ellipseToClosedSubpath(50, 50, 20, 10);
    expect(segs[0]).toEqual({ type: 'M', x: 50, y: 40 });
    expect(segs.filter((s) => s.type === 'C')).toHaveLength(4);
    expect(segs.at(-1)).toEqual({ type: 'Z' });
  });
});
