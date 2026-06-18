import { describe, expect, it } from 'vitest';
import { PenSession, penPathSegmentsToD } from '../../../models/pen-path';
import { commitPenDraggedCurveOnSession } from './pen-tool-session-commit-dragged-curve';

describe('commitPenDraggedCurveOnSession', () => {
  it('close-at-tail segmentEnd is not replaced by session M when prepending from head', () => {
    const session = new PenSession();
    session.beginPath(10, 10);
    session.appendCubic(5, 5, 2, 8, 20, 20);

    commitPenDraggedCurveOnSession(
      session,
      {
        penPathStartMv: () => ({ x: 10, y: 10 }),
        penPendingCurveAltChord: false,
        penPendingShiftAngleSnap: false
      },
      {
        anchor: { x: 20, y: 20 },
        chordEndSvg: { x: 30, y: 2 },
        dragCurrent: { x: 28, y: 8 },
        ctrlCurve: false,
        segmentEnd: { x: 50, y: 40 }
      }
    );

    const d = penPathSegmentsToD(session.getSegments());
    expect(d).toMatch(/^M 10 10 C /);
    expect(d).toMatch(/ 50 40$/);
    expect(d).not.toMatch(/ 10 10$/);
  });

  it('close-to-M still snaps terminal to exact session moveto', () => {
    const session = new PenSession();
    session.beginPath(10.0000001, 10.0000002);
    session.appendCubic(5, 5, 2, 8, 20, 20);

    commitPenDraggedCurveOnSession(
      session,
      {
        penPathStartMv: () => ({ x: 10, y: 10 }),
        penPendingCurveAltChord: false,
        penPendingShiftAngleSnap: false
      },
      {
        anchor: { x: 20, y: 20 },
        chordEndSvg: { x: 10.0000003, y: 10.0000004 },
        dragCurrent: { x: 8, y: 12 },
        ctrlCurve: false,
        segmentEnd: { x: 10.0000003, y: 10.0000004 }
      }
    );

    const last = session.getSegments().at(-1)!;
    expect(last.type).toBe('C');
    expect(last.x).toBe(10);
    expect(last.y).toBe(10);
  });
});
