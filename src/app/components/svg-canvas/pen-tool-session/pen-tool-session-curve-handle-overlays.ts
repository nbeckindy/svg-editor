import {
  lastCommittedVertex,
  penCubicSmoothReflectP1Usable,
  penDragCurveAuthoringKind,
  penFirstAnchorMirroredHandleControlsFromDrag,
  penPathOnlyMoveto,
  penReflectStateAfterCommitted,
  penAdjustedCubicControlsForPendingLikeDrag,
  placementPointerQuadraticControlPoint,
  snapVectorTo45DegFrom,
  type CubicControlPoints,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import type { PenOverlayPorts } from './pen-tool-session-overlay';
import { penSvgUserPointToOverlayPixel, penSvgUserSegmentToOverlayLine } from './pen-tool-session-overlay';
import type { PenPendingSegmentForPreview } from './pen-tool-session-pending-preview';

function cubicAdjustedForOverlay(
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

export type PenCurveHandleOverlaysParams = {
  ports: PenOverlayPorts;
  penPointerSvg: { x: number; y: number };
  penMirroredHandleChromeActive: boolean;
  penPendingSegment: PenPendingSegmentForPreview | null;
  penPendingCurveAltChord: boolean;
  penPendingShiftAngleSnap: boolean;
  penAwaitingColocatedSegmentEndpointAfterDraft: boolean;
  penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null;
  segments: readonly PenPathSegment[];
  penCurvePreviewPathD: string | null;
  penAwaitingFirstSegmentP3AfterDraft: boolean;
  penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null;
  penCommittedFirstSegmentP3Draft: PenFirstAnchorP3Draft | null;
  pendingDragSampleSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
  pendingCurvePreviewEndSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
  pendingCurveGeometryEndSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
};

export function computePenCurveHandleOverlays(p: PenCurveHandleOverlaysParams): { cx: number; cy: number }[] {
    if (p.penMirroredHandleChromeActive) {
      const pending = p.penPendingSegment!;
      if (p.penPendingCurveAltChord) return [];
      const anchor = pending.anchor;
      const dragPt = p.pendingDragSampleSvg(pending);
      const c = penFirstAnchorMirroredHandleControlsFromDrag(
        anchor,
        dragPt,
        p.penPendingShiftAngleSnap
      );
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(p.ports, x, y);
      const p1 = toOverlay(c.x1, c.y1);
      const p2 = toOverlay(c.x2, c.y2);
      return [
        { cx: p1.x, cy: p1.y },
        { cx: p2.x, cy: p2.y }
      ];
    }
    if (
      p.penAwaitingColocatedSegmentEndpointAfterDraft &&
      p.penColocatedSegmentEndpointDraft &&
      !penPathOnlyMoveto(p.segments)
    ) {
      const segs = p.segments;
      const tip = lastCommittedVertex(segs);
      const draft = p.penColocatedSegmentEndpointDraft;
      if (!tip || !draft) return [];
      const anchor = tip;
      const end = p.penPointerSvg;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(p.ports, x, y);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = toOverlay(x1, y1);
          return [{ cx: p1.x, cy: p1.y }];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const op = toOverlay(qc.x1, qc.y1);
          return [{ cx: op.x, cy: op.y }];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          const p1 = toOverlay(sx1, sy1);
          const p2 = toOverlay(hx, hy);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        default: {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            const op = toOverlay(qc.x1, qc.y1);
            return [{ cx: op.x, cy: op.y }];
          }
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          const op = toOverlay(ix, iy);
          return [{ cx: op.x, cy: op.y }];
        }
      }
    }
    if (p.penAwaitingFirstSegmentP3AfterDraft && p.penFirstAnchorP3Draft) {
      const segs = p.segments;
      const m = segs[0];
      if (m.type !== 'M') return [];
      const ptr = p.penPointerSvg;
      if (!ptr) return [];
      const anchor = { x: m.x, y: m.y };
      const end = ptr;
      const draft = p.penFirstAnchorP3Draft;
      const dragCurrent = draft.dragCommitSvg;
      const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
      const toOverlay = (x: number, y: number) =>
        penSvgUserPointToOverlayPixel(p.ports, x, y);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = draft.curveAltChord;
          const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
            anchor,
            end,
            dragCurrent,
            draft.placementDragStartSvg,
            segs,
            altEndOnly,
            draft.shiftAngleSnap,
            true
          );
          const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = toOverlay(x1, y1);
          return [{ cx: p1.x, cy: p1.y }];
        }
        case 'quadratic': {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const op = toOverlay(qc.x1, qc.y1);
          return [{ cx: op.x, cy: op.y }];
        }
        case 'smoothCubic': {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
          const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
          const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          const p1 = toOverlay(sx1, sy1);
          const p2 = toOverlay(hx, hy);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        default: {
          const st = penReflectStateAfterCommitted(segs);
          if (!st) return [];
          if (draft.curveAltChord) {
            let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
            if (draft.shiftAngleSnap) {
              const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
              qc = { x1: s.x, y1: s.y };
            }
            const op = toOverlay(qc.x1, qc.y1);
            return [{ cx: op.x, cy: op.y }];
          }
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
            ix = s.x;
            iy = s.y;
          }
          const op = toOverlay(ix, iy);
          return [{ cx: op.x, cy: op.y }];
        }
      }
    }
    if (
      p.penCommittedFirstSegmentP3Draft &&
      p.penPendingSegment &&
      penPathOnlyMoveto(p.segments)
    ) {
      const p3d = p.penCommittedFirstSegmentP3Draft;
      const pending = p.penPendingSegment;
      const segs = p.segments;
      const m = segs[0];
      if (m.type !== 'M') return [];
      const anchorMv = { x: m.x, y: m.y };
      const end = p.pendingCurvePreviewEndSvg(pending);
      const dragCurrent = p.pendingDragSampleSvg(pending);
      const kind = penDragCurveAuthoringKind(pending.ctrlCurve, segs);
      switch (kind) {
        case 'cubic': {
          const altEndOnly = p.penPendingCurveAltChord;
          const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
            anchorMv,
            end,
            dragCurrent,
            p3d.placementDragStartSvg,
            segs,
            altEndOnly,
            p.penPendingShiftAngleSnap,
            false
          );
          const x1 = p3d.frozenOutgoingP1Svg?.x ?? c.x1;
          const y1 = p3d.frozenOutgoingP1Svg?.y ?? c.y1;
          const p1 = penSvgUserPointToOverlayPixel(p.ports, x1, y1);
          const p2 = penSvgUserPointToOverlayPixel(p.ports, c.x2, c.y2);
          if (altEndOnly) {
            return [
              { cx: p1.x, cy: p1.y },
              { cx: p2.x, cy: p2.y }
            ];
          }
          const pOut = penSvgUserPointToOverlayPixel(p.ports, dragCurrent.x, dragCurrent.y);
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y },
            { cx: pOut.x, cy: pOut.y }
          ];
        }
        default:
          return [];
      }
    }
    if (!p.penCurvePreviewPathD) return [];
    if (!p.penPendingSegment) return [];
    const pending = p.penPendingSegment;
    const anchor = pending.anchor;
    const end = p.pendingCurveGeometryEndSvg(pending);
    const dragCurrent = p.pendingDragSampleSvg(pending);
    const kind = penDragCurveAuthoringKind(pending.ctrlCurve, p.segments);
    const toOverlay = (x: number, y: number) =>
      penSvgUserPointToOverlayPixel(p.ports, x, y);

    switch (kind) {
      case 'cubic': {
        const altEndOnly = p.penPendingCurveAltChord;
        const { x1, y1, x2, y2 } = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
          anchor,
          end,
          dragCurrent,
          pending.startSvg,
          p.segments,
          altEndOnly
        );
        const p1 = toOverlay(x1, y1);
        const p2 = toOverlay(x2, y2);
        if (altEndOnly) {
          return [
            { cx: p1.x, cy: p1.y },
            { cx: p2.x, cy: p2.y }
          ];
        }
        const pOut = toOverlay(dragCurrent.x, dragCurrent.y);
        return [
          { cx: p2.x, cy: p2.y },
          { cx: pOut.x, cy: pOut.y }
        ];
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (p.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        const op = toOverlay(qc.x1, qc.y1);
        return [{ cx: op.x, cy: op.y }];
      }
      case 'smoothCubic': {
        const st = penReflectStateAfterCommitted(p.segments);
        if (!st) return [];
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (p.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        const p1 = toOverlay(sx1, sy1);
        const p2 = toOverlay(hx, hy);
        return [
          { cx: p1.x, cy: p1.y },
          { cx: p2.x, cy: p2.y }
        ];
      }
      default: {
        const st = penReflectStateAfterCommitted(p.segments);
        if (!st) return [];
        if (p.penPendingCurveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (p.penPendingShiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          const op = toOverlay(qc.x1, qc.y1);
          return [{ cx: op.x, cy: op.y }];
        }
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (p.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        const op = toOverlay(ix, iy);
        return [{ cx: op.x, cy: op.y }];
      }
    }
  }

export type PenPendingCurveHandleGuideOverlaysParams = {
  ports: PenOverlayPorts;
  currentToolIsPen: boolean;
  penMirroredHandleChromeActive: boolean;
  penPointerSvg: { x: number; y: number } | null;
  penPendingSegment: PenPendingSegmentForPreview | null;
  penPendingCurveAltChord: boolean;
  penPendingShiftAngleSnap: boolean;
  penAwaitingColocatedSegmentEndpointAfterDraft: boolean;
  penColocatedSegmentEndpointDraft: PenFirstAnchorP3Draft | null;
  segments: readonly PenPathSegment[];
  penCurvePreviewPathD: string | null;
  penAwaitingFirstSegmentP3AfterDraft: boolean;
  penFirstAnchorP3Draft: PenFirstAnchorP3Draft | null;
  penCommittedFirstSegmentP3Draft: PenFirstAnchorP3Draft | null;
  pendingDragSampleSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
  pendingCurvePreviewEndSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
  pendingCurveGeometryEndSvg: (pending: PenPendingSegmentForPreview) => { x: number; y: number };
};

export function computePenPendingCurveHandleGuideOverlays(
  p: PenPendingCurveHandleGuideOverlaysParams
): { x1: number; y1: number; x2: number; y2: number }[] {
  if (!p.currentToolIsPen) {
    return [];
  }
  if (p.penMirroredHandleChromeActive && p.penPendingSegment) {
    const pending = p.penPendingSegment;
    if (p.penPendingCurveAltChord) return [];
    const anchor = pending.anchor;
    const dragPt = p.pendingDragSampleSvg(pending);
    const c = penFirstAnchorMirroredHandleControlsFromDrag(
      anchor,
      dragPt,
      p.penPendingShiftAngleSnap
    );
    const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
      penSvgUserSegmentToOverlayLine(p.ports, x1s, y1s, x2s, y2s);
    return [line(anchor.x, anchor.y, c.x1, c.y1), line(anchor.x, anchor.y, c.x2, c.y2)];
  }
  if (
    p.penAwaitingColocatedSegmentEndpointAfterDraft &&
    p.penColocatedSegmentEndpointDraft &&
    !penPathOnlyMoveto(p.segments)
  ) {
    const segs = p.segments;
    const tip = lastCommittedVertex(segs);
    const draft = p.penColocatedSegmentEndpointDraft;
    if (!tip || !draft) return [];
    const anchor = tip;
    const end = p.penPointerSvg!;
    const dragCurrent = draft.dragCommitSvg;
    const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
    const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
      penSvgUserSegmentToOverlayLine(p.ports, x1s, y1s, x2s, y2s);
    switch (kind) {
      case 'cubic': {
        const altEndOnly = draft.curveAltChord;
        const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
          anchor,
          end,
          dragCurrent,
          draft.placementDragStartSvg,
          segs,
          altEndOnly,
          draft.shiftAngleSnap,
          true
        );
        const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
        const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
        return [line(anchor.x, anchor.y, x1, y1)];
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
      }
      case 'smoothCubic': {
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        return [
          line(anchor.x, anchor.y, sx1, sy1),
          line(end.x, end.y, hx, hy)
        ];
      }
      default: {
        if (draft.curveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
        }
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        return [line(anchor.x, anchor.y, ix, iy)];
      }
    }
  }
  if (p.penAwaitingFirstSegmentP3AfterDraft && p.penFirstAnchorP3Draft) {
    const segs = p.segments;
    const m = segs[0];
    if (m.type !== 'M') return [];
    const anchor = { x: m.x, y: m.y };
    const end = p.penPointerSvg!;
    const draft = p.penFirstAnchorP3Draft;
    const dragCurrent = draft.dragCommitSvg;
    const kind = penDragCurveAuthoringKind(draft.ctrlCurve, segs);
    const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
      penSvgUserSegmentToOverlayLine(p.ports, x1s, y1s, x2s, y2s);
    switch (kind) {
      case 'cubic': {
        const altEndOnly = draft.curveAltChord;
        const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
          anchor,
          end,
          dragCurrent,
          draft.placementDragStartSvg,
          segs,
          altEndOnly,
          draft.shiftAngleSnap,
          true
        );
        const x1 = draft.frozenOutgoingP1Svg?.x ?? c.x1;
        const y1 = draft.frozenOutgoingP1Svg?.y ?? c.y1;
        return [line(anchor.x, anchor.y, x1, y1)];
      }
      case 'quadratic': {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
      }
      case 'smoothCubic': {
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        return [
          line(anchor.x, anchor.y, sx1, sy1),
          line(end.x, end.y, hx, hy)
        ];
      }
      default: {
        if (draft.curveAltChord) {
          let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
          if (draft.shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
            qc = { x1: s.x, y1: s.y };
          }
          return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
        }
        const st = penReflectStateAfterCommitted(segs);
        if (!st) return [];
        let ix = 2 * anchor.x - st.quadCpX;
        let iy = 2 * anchor.y - st.quadCpY;
        if (draft.shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          ix = s.x;
          iy = s.y;
        }
        return [line(anchor.x, anchor.y, ix, iy)];
      }
    }
  }
  if (
    p.penCommittedFirstSegmentP3Draft &&
    p.penPendingSegment &&
    penPathOnlyMoveto(p.segments)
  ) {
    const p3d = p.penCommittedFirstSegmentP3Draft;
    const pending = p.penPendingSegment;
    const segsP3 = p.segments;
    const m = segsP3[0];
    if (m.type !== 'M') return [];
    const anchorMv = { x: m.x, y: m.y };
    const endP3 = p.pendingCurvePreviewEndSvg(pending);
    const dragCurrentP3 = p.pendingDragSampleSvg(pending);
    const kindP3 = penDragCurveAuthoringKind(pending.ctrlCurve, segsP3);
    const lineP3 = (x1s: number, y1s: number, x2s: number, y2s: number) =>
      penSvgUserSegmentToOverlayLine(p.ports, x1s, y1s, x2s, y2s);
    if (kindP3 === 'cubic') {
      const altEndOnly = p.penPendingCurveAltChord;
      const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
        anchorMv,
        endP3,
        dragCurrentP3,
        p3d.placementDragStartSvg,
        segsP3,
        altEndOnly,
        p.penPendingShiftAngleSnap,
        false
      );
      const x1 = p3d.frozenOutgoingP1Svg?.x ?? c.x1;
      const y1 = p3d.frozenOutgoingP1Svg?.y ?? c.y1;
      const linesP3: { x1: number; y1: number; x2: number; y2: number }[] = [
        lineP3(anchorMv.x, anchorMv.y, x1, y1),
        lineP3(endP3.x, endP3.y, c.x2, c.y2)
      ];
      if (!altEndOnly) {
        linesP3.push(lineP3(endP3.x, endP3.y, dragCurrentP3.x, dragCurrentP3.y));
      }
      return linesP3;
    }
    return [];
  }
  if (!p.penCurvePreviewPathD) {
    return [];
  }
  if (!p.penPendingSegment) return [];
  const pending = p.penPendingSegment;
  const end = p.pendingCurveGeometryEndSvg(pending);
  const dragCurrent = p.pendingDragSampleSvg(pending);
  const kind = penDragCurveAuthoringKind(pending.ctrlCurve, p.segments);
  const segs = p.segments;
  const anchor = pending.anchor;

  const line = (x1s: number, y1s: number, x2s: number, y2s: number) =>
    penSvgUserSegmentToOverlayLine(p.ports, x1s, y1s, x2s, y2s);

  switch (kind) {
    case 'cubic': {
      const altEndOnly = p.penPendingCurveAltChord;
      const c = cubicAdjustedForOverlay(p.penPendingShiftAngleSnap, 
        anchor,
        end,
        dragCurrent,
        pending.startSvg,
        segs,
        altEndOnly
      );
      const lines: { x1: number; y1: number; x2: number; y2: number }[] = [
        line(anchor.x, anchor.y, c.x1, c.y1),
        line(end.x, end.y, c.x2, c.y2)
      ];
      if (!altEndOnly) {
        lines.push(line(end.x, end.y, dragCurrent.x, dragCurrent.y));
      }
      return lines;
    }
    case 'quadratic': {
      let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
      if (p.penPendingShiftAngleSnap) {
        const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
        qc = { x1: s.x, y1: s.y };
      }
      return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
    }
    case 'smoothCubic': {
      const st = penReflectStateAfterCommitted(segs);
      if (!st) return [];
      const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
      const sx1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
      const sy1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
      let hx = dragCurrent.x;
      let hy = dragCurrent.y;
      if (p.penPendingShiftAngleSnap) {
        const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
        hx = s.x;
        hy = s.y;
      }
      return [
        line(anchor.x, anchor.y, sx1, sy1),
        line(end.x, end.y, hx, hy)
      ];
    }
    default: {
      if (p.penPendingCurveAltChord) {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (p.penPendingShiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return [line(anchor.x, anchor.y, qc.x1, qc.y1)];
      }
      const st = penReflectStateAfterCommitted(segs);
      if (!st) return [];
      let ix = 2 * anchor.x - st.quadCpX;
      let iy = 2 * anchor.y - st.quadCpY;
      if (p.penPendingShiftAngleSnap) {
        const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
        ix = s.x;
        iy = s.y;
      }
      return [line(anchor.x, anchor.y, ix, iy)];
    }
  }

}
