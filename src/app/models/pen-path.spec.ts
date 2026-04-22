import { describe, it, expect } from 'vitest';
import {
  PenSession,
  lastCommittedVertex,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penPathSegmentsToD
} from './pen-path';

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
});

describe('lastCommittedVertex', () => {
  it('returns moveto point when only M', () => {
    expect(lastCommittedVertex([{ type: 'M', x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
  });

  it('returns end of last L or C', () => {
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
});
