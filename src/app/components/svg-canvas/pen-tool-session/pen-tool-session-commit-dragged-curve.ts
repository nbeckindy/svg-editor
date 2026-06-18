import {
  PenSession,
  penAdjustedCubicControlsForPendingLikeDrag,
  penCubicSmoothReflectP1Usable,
  penDragCurveAuthoringKind,
  penReflectStateAfterCommitted,
  penSvgDistanceSq,
  placementPointerQuadraticControlPoint,
  snapVectorTo45DegFrom,
  type CubicControlPoints,
  type PenPathSegment
} from '../../../models/pen-path';

function pendingLikeCubicAdjusted(
  defaultShiftSnap: boolean,
  anchor: { x: number; y: number },
  end: { x: number; y: number },
  dragCurrent: { x: number; y: number },
  dragStartSvg: { x: number; y: number },
  segments: readonly PenPathSegment[],
  altEndOnly: boolean,
  shiftAngleSnap?: boolean,
  zeroIncomingAtEnd = false
): CubicControlPoints {
  const sh = shiftAngleSnap === undefined ? defaultShiftSnap : shiftAngleSnap;
  return penAdjustedCubicControlsForPendingLikeDrag(
    anchor,
    end,
    dragCurrent,
    dragStartSvg,
    segments,
    altEndOnly,
    sh,
    zeroIncomingAtEnd
  );
}

export type CommitPenDraggedCurveSessionOpts = {
  penPathStartMv: () => { x: number; y: number } | null;
  /** Alt chord mode — matches `penPendingCubicAltEndHandleOnly()` on the session. */
  penPendingCurveAltChord: boolean;
  penPendingShiftAngleSnap: boolean;
};

/**
 * Append L/C/Q/S curve segment from drag geometry — shared by pending commit, colocated drafts, and close-from-start.
 * Mutates {@link PenSession} only; callers own History / `markForCheck`.
 */
export function commitPenDraggedCurveOnSession(
  session: PenSession,
  opts: CommitPenDraggedCurveSessionOpts,
  args: {
    anchor: { x: number; y: number };
    chordEndSvg: { x: number; y: number };
    dragCurrent: { x: number; y: number };
    ctrlCurve: boolean;
    segmentEnd?: { x: number; y: number };
    placementDragStartSvg?: { x: number; y: number };
    frozenOutgoingP1Svg?: { x: number; y: number };
    zeroIncomingAtSegmentEnd?: boolean;
  }
): void {
  const {
    anchor,
    chordEndSvg,
    dragCurrent,
    ctrlCurve,
    segmentEnd,
    placementDragStartSvg,
    frozenOutgoingP1Svg,
    zeroIncomingAtSegmentEnd = false
  } = args;

  const mv = opts.penPathStartMv();
  let committedEnd: { x: number; y: number };
  if (segmentEnd !== undefined) {
    // Exact session `M` when closing back to path start (float parity). Prepend close-at-tail passes a
    // different `segmentEnd` — must not substitute session `M` or the closing leg gets a straight connector.
    if (mv && penSvgDistanceSq(segmentEnd, mv) < 1e-10) {
      committedEnd = mv;
    } else {
      committedEnd = segmentEnd;
    }
  } else {
    committedEnd = chordEndSvg;
  }
  const placementDragResolved =
    placementDragStartSvg ?? (segmentEnd !== undefined ? committedEnd : chordEndSvg);
  const kind = penDragCurveAuthoringKind(ctrlCurve, session.getSegments());
  const segs = session.getSegments();
  switch (kind) {
    case 'cubic': {
      const altEndOnly = opts.penPendingCurveAltChord;
      let c = pendingLikeCubicAdjusted(
        opts.penPendingShiftAngleSnap,
        anchor,
        committedEnd,
        dragCurrent,
        placementDragResolved,
        segs,
        altEndOnly,
        undefined,
        zeroIncomingAtSegmentEnd
      );
      if (frozenOutgoingP1Svg && !altEndOnly) {
        c = {
          ...c,
          x1: frozenOutgoingP1Svg.x,
          y1: frozenOutgoingP1Svg.y
        };
      }
      session.appendCubic(c.x1, c.y1, c.x2, c.y2, committedEnd.x, committedEnd.y);
      break;
    }
    case 'quadratic': {
      let q = placementPointerQuadraticControlPoint(anchor, committedEnd, dragCurrent);
      if (opts.penPendingShiftAngleSnap) {
        const s = snapVectorTo45DegFrom(committedEnd, { x: q.x1, y: q.y1 });
        q = { x1: s.x, y1: s.y };
      }
      session.appendQuadratic(q.x1, q.y1, committedEnd.x, committedEnd.y);
      break;
    }
    case 'smoothCubic': {
      if (opts.penPendingCurveAltChord) {
        const st = penReflectStateAfterCommitted(segs);
        if (!st) {
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (opts.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          session.appendSmoothCubic(hx, hy, committedEnd.x, committedEnd.y);
          break;
        }
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const x1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const y1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (opts.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        session.appendCubic(x1, y1, hx, hy, committedEnd.x, committedEnd.y);
        break;
      }
      let hx = dragCurrent.x;
      let hy = dragCurrent.y;
      if (opts.penPendingShiftAngleSnap) {
        const s = snapVectorTo45DegFrom(committedEnd, { x: hx, y: hy });
        hx = s.x;
        hy = s.y;
      }
      session.appendSmoothCubic(hx, hy, committedEnd.x, committedEnd.y);
      break;
    }
    default: {
      if (opts.penPendingCurveAltChord) {
        let q = placementPointerQuadraticControlPoint(anchor, committedEnd, dragCurrent);
        if (opts.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(committedEnd, { x: q.x1, y: q.y1 });
          q = { x1: s.x, y1: s.y };
        }
        session.appendQuadratic(q.x1, q.y1, committedEnd.x, committedEnd.y);
        break;
      }
      if (opts.penPendingShiftAngleSnap) {
        const st = penReflectStateAfterCommitted(segs);
        if (st) {
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          const s = snapVectorTo45DegFrom(committedEnd, { x: ix, y: iy });
          session.appendQuadratic(s.x, s.y, committedEnd.x, committedEnd.y);
          break;
        }
      }
      session.appendSmoothQuadratic(committedEnd.x, committedEnd.y);
    }
  }
}
