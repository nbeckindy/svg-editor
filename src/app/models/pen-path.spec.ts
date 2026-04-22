import { describe, it, expect } from 'vitest';
import {
  PenSession,
  appendCubicToD,
  appendSymmetricCubicToD,
  dragBendCubicControlPoints,
  lastCommittedVertex,
  penPathOnlyMoveto,
  penPathSegmentsAreValid,
  penPathSegmentsToD,
  symmetricCubicControlPoints
} from './pen-path';

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

  it('finishPath returns a full d with M, L, and C after line and symmetric cubic', () => {
    const s = new PenSession();
    s.beginPath(0, 0);
    s.addLinePoint(5, 0);
    const c = symmetricCubicControlPoints({ x: 5, y: 0 }, { x: 10, y: 10 });
    s.appendCubic(c.x1, c.y1, c.x2, c.y2, 10, 10);
    expect(s.finishPath()).toBe('M 0 0 L 5 0 C 6.666667 3.333333 8.333333 6.666667 10 10');
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
});
