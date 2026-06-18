import {
  penPathSegmentsToD,
  penStartingLegIsCubic,
  penSvgDistanceSq,
  type PenFirstAnchorP3Draft,
  type PenPathSegment
} from '../../../models/pen-path';
import { computePenInsertOnPathPreviewPathD, type PenInsertOnPathDragState } from './pen-tool-session-insert-on-path';
import type { PenToolSessionPorts } from './pen-tool-session-ports';
import { penSvgUserPointToOverlayPixel, penSvgUserSegmentToOverlayLine } from './pen-tool-session-overlay';
import {
  computePenPendingShowsCurvePreviewForClose,
  penPendingCurvePreviewEndSvg as penPendingCurvePreviewEndUserSvg,
  penPendingDragSampleSvg as samplePenPendingDragSvg,
  type PenPendingSegmentForPreview
} from './pen-tool-session-pending-preview';
import {
  buildPenPendingCurveAppendedBaseD,
  computePenCurvePreviewPathD,
  computePenSessionPreviewPathD
} from './pen-tool-session-preview-path-d';
import {
  computePenCloseTargetHoverOverlay,
  computePenCommittedOutgoingHandleSvg,
  computePenOpenPathContinueHoverOverlay,
  computePenRubberBandOverlay
} from './pen-tool-session-preview-overlays';
import {
  computePenCurveHandleOverlays,
  computePenPendingCurveHandleGuideOverlays
} from './pen-tool-session-curve-handle-overlays';
import {
  findPenOpenPathEndpointHoverAtClient,
  penEndpointsWithinJoinTolerance,
  type PenContinuingPathRewrite
} from './pen-tool-session-path-continuation';

/** Domain slice for {@link PenToolSessionPresenter} (template bindings / editor chrome). */
export interface PenToolSessionPresenterHost {
  readonly ports: PenToolSessionPorts;
  readonly segments: readonly PenPathSegment[];

  isPenSessionActive(): boolean;
  isPenInsertOnPathDragActive(): boolean;

  getPointerSvg(): { x: number; y: number } | null;
  getPendingSegment(): PenPendingSegmentForPreview | null;
  getPendingLastClient(): { x: number; y: number } | null;
  getPendingDragSvg(): { x: number; y: number } | null;
  getPendingCurveAltChord(): boolean;
  getPendingShiftAngleSnap(): boolean;
  getFirstAnchorP3Draft(): PenFirstAnchorP3Draft | null;
  getAwaitingColocatedEndpoint(): boolean;
  getColocatedDraft(): PenFirstAnchorP3Draft | null;
  getHoverClientPx(): { x: number; y: number } | null;
  getContinuingPathRewrite(): PenContinuingPathRewrite | null;
  getInsertOnPath(): PenInsertOnPathDragState | null;
  getInsertOnPathLastClient(): { x: number; y: number } | null;
  getInsertOnPathPointerSvg(): { x: number; y: number } | null;

  penPendingIsFirstFromMoveto(): boolean;
  penPendingChordColocated(): boolean;
  penPathStartMv(): { x: number; y: number } | null;
  penPathCloseTargetMv(): { x: number; y: number } | null;
  penCloseAffordanceAllowed(): boolean;
  isPenPointerWithinCloseRadius(clientX: number, clientY: number): boolean;
  penCommittedPathHasVertexBeyondMoveto(): boolean;
}

/** Editor-chrome bindings for in-progress pen authoring (preview `d`, overlays, insert preview). */
export class PenToolSessionPresenter {
  constructor(private readonly host: PenToolSessionPresenterHost) {}

  get penPendingShowsCurvePreview(): boolean {
    return computePenPendingShowsCurvePreviewForClose({
      penFirstAnchorP3Draft: this.host.getFirstAnchorP3Draft(),
      penAwaitingColocatedSegmentEndpointAfterDraft: this.host.getAwaitingColocatedEndpoint(),
      penColocatedSegmentEndpointDraft: this.host.getColocatedDraft(),
      penPendingSegment: this.host.getPendingSegment(),
      penPendingLastClient: this.host.getPendingLastClient(),
      penPendingDragSvg: this.host.getPendingDragSvg(),
      penPendingIsFirstSegmentFromMovetoGesture: this.host.penPendingIsFirstFromMoveto(),
      penPendingChordColocated: this.host.penPendingChordColocated(),
      penPendingStartNearPathMoveto: this.penPendingStartNearPathMoveto(),
      penPathStartMv: this.host.penPathCloseTargetMv(),
      allowRelaxedCloseRingCurvePreview: penStartingLegIsCubic(this.host.segments)
    });
  }

  get penSessionPreviewPathD(): string | null {
    return computePenSessionPreviewPathD({
      penInsertOnPath: this.host.isPenInsertOnPathDragActive(),
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.host.isPenSessionActive(),
      segments: this.host.segments,
      penPointerSvg: this.host.getPointerSvg(),
      penPendingSegment: this.host.getPendingSegment(),
      penFirstAnchorP3Draft: this.host.getFirstAnchorP3Draft(),
      penAwaitingColocatedSegmentEndpointAfterDraft: this.host.getAwaitingColocatedEndpoint(),
      penColocatedSegmentEndpointDraft: this.host.getColocatedDraft(),
      penPendingIsFirstSegmentFromMovetoGesture: this.host.penPendingIsFirstFromMoveto(),
      penPendingChordColocated: this.host.penPendingChordColocated(),
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      appendPenPendingCurveToBaseD: (baseD) => this.appendPenPendingCurveToBaseD(baseD)
    });
  }

  get penCurvePreviewPathD(): string | null {
    return computePenCurvePreviewPathD({
      penInsertOnPath: this.host.isPenInsertOnPathDragActive(),
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      penPointerSvg: this.host.getPointerSvg(),
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      segments: this.host.segments,
      penPendingSegment: this.host.getPendingSegment(),
      penFirstAnchorP3Draft: this.host.getFirstAnchorP3Draft(),
      penAwaitingColocatedSegmentEndpointAfterDraft: this.host.getAwaitingColocatedEndpoint(),
      penColocatedSegmentEndpointDraft: this.host.getColocatedDraft(),
      penPendingIsFirstSegmentFromMovetoGesture: this.host.penPendingIsFirstFromMoveto(),
      penPendingChordColocated: this.host.penPendingChordColocated(),
      appendPenPendingCurveToBaseD: (baseD) => this.appendPenPendingCurveToBaseD(baseD)
    });
  }

  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return (
      !!this.host.getPendingSegment() &&
      this.host.penPendingIsFirstFromMoveto() &&
      this.penPendingShowsCurvePreview
    );
  }

  get penColocatedTipMirroredHandleDragActive(): boolean {
    return (
      !!this.host.getPendingSegment() &&
      this.host.penPendingChordColocated() &&
      this.penPendingShowsCurvePreview
    );
  }

  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    const pointer = this.host.getPointerSvg();
    if (!pointer) return [];
    return computePenCurveHandleOverlays({
      ports: this.host.ports,
      penPointerSvg: pointer,
      penMirroredHandleChromeActive:
        this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive,
      penPendingSegment: this.host.getPendingSegment(),
      penPendingCurveAltChord: this.host.getPendingCurveAltChord(),
      penPendingShiftAngleSnap: this.host.getPendingShiftAngleSnap(),
      penAwaitingColocatedSegmentEndpointAfterDraft: this.host.getAwaitingColocatedEndpoint(),
      penColocatedSegmentEndpointDraft: this.host.getColocatedDraft(),
      segments: this.host.segments,
      penCurvePreviewPathD: this.penCurvePreviewPathD,
      penFirstAnchorGapP3Draft: this.host.getFirstAnchorP3Draft() !== null && this.host.getPendingSegment() === null,
      penFirstAnchorP3Draft: this.host.getFirstAnchorP3Draft(),
      pendingDragSampleSvg: (pend) => this.pendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.pendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.pendingCurveGeometryEndSvg(pend),
      penPendingLastClient: this.host.getPendingLastClient()
    });
  }

  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return computePenRubberBandOverlay({
      ports: this.host.ports,
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.host.isPenSessionActive(),
      penPointerSvg: this.host.getPointerSvg(),
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      hasPendingSegment: this.host.getPendingSegment() !== null,
      penPendingIsFirstSegmentFromMovetoGesture: this.host.penPendingIsFirstFromMoveto(),
      penPendingChordColocated: this.host.penPendingChordColocated(),
      segments: this.host.segments
    });
  }

  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    const h = this.committedOutgoingHandleSvg();
    if (!h) return null;
    return penSvgUserSegmentToOverlayLine(this.host.ports, h.anchorX, h.anchorY, h.hx, h.hy);
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    const h = this.committedOutgoingHandleSvg();
    if (!h) return null;
    const p2 = penSvgUserPointToOverlayPixel(this.host.ports, h.hx, h.hy);
    return { cx: p2.x, cy: p2.y };
  }

  get penPendingCurveHandleGuideOverlays(): { x1: number; y1: number; x2: number; y2: number }[] {
    return computePenPendingCurveHandleGuideOverlays({
      ports: this.host.ports,
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      penMirroredHandleChromeActive:
        this.penFirstAnchorMirroredHandleDragActive || this.penColocatedTipMirroredHandleDragActive,
      penPointerSvg: this.host.getPointerSvg(),
      penPendingSegment: this.host.getPendingSegment(),
      penPendingCurveAltChord: this.host.getPendingCurveAltChord(),
      penPendingShiftAngleSnap: this.host.getPendingShiftAngleSnap(),
      penAwaitingColocatedSegmentEndpointAfterDraft: this.host.getAwaitingColocatedEndpoint(),
      penColocatedSegmentEndpointDraft: this.host.getColocatedDraft(),
      segments: this.host.segments,
      penCurvePreviewPathD: this.penCurvePreviewPathD,
      penFirstAnchorGapP3Draft: this.host.getFirstAnchorP3Draft() !== null && this.host.getPendingSegment() === null,
      penFirstAnchorP3Draft: this.host.getFirstAnchorP3Draft(),
      pendingDragSampleSvg: (pend) => this.pendingDragSampleSvg(pend),
      pendingCurvePreviewEndSvg: (pend) => this.pendingCurvePreviewEndSvg(pend),
      pendingCurveGeometryEndSvg: (pend) => this.pendingCurveGeometryEndSvg(pend),
      penPendingLastClient: this.host.getPendingLastClient()
    });
  }

  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    return computePenCloseTargetHoverOverlay({
      ports: this.host.ports,
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.host.isPenSessionActive(),
      penHoverClientPx: this.host.getHoverClientPx(),
      penCloseTargetMv: this.host.penPathCloseTargetMv(),
      penCloseAffordanceAllowed: this.host.penCloseAffordanceAllowed(),
      isPenPointerWithinCloseRadius: (clientX, clientY) =>
        this.host.isPenPointerWithinCloseRadius(clientX, clientY)
    });
  }

  get penOpenPathContinueHoverOverlay(): { cx: number; cy: number } | null {
    return computePenOpenPathContinueHoverOverlay({
      ports: this.host.ports,
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.host.isPenSessionActive(),
      penHoverClientPx: this.host.getHoverClientPx(),
      findOpenPathEndpointHoverAtClient: (clientX, clientY) => {
        const hit = findPenOpenPathEndpointHoverAtClient(this.host.ports, clientX, clientY);
        return hit ? hit.endpoint : null;
      }
    });
  }

  get penContinuationGhostPathD(): string | null {
    const cont = this.host.getContinuingPathRewrite();
    if (cont?.stitch !== 'prependBeforeExisting' || !cont.existingSegments?.length) {
      return null;
    }
    return penPathSegmentsToD(cont.existingSegments);
  }

  get penInsertOnPathPathId(): string | null {
    return this.host.getInsertOnPath()?.pathId ?? null;
  }

  get penInsertOnPathPlantedAnchorSvg(): { x: number; y: number } | null {
    return this.host.getInsertOnPath()?.dragStartSvg ?? null;
  }

  get penInsertOnPathPreviewPathD(): string | null {
    const st = this.host.getInsertOnPath();
    if (!st) return null;
    return computePenInsertOnPathPreviewPathD(
      st,
      this.host.getInsertOnPathLastClient(),
      this.host.getInsertOnPathPointerSvg()
    );
  }

  private penPendingStartNearPathMoveto(): boolean {
    const pending = this.host.getPendingSegment();
    const m = this.host.penPathStartMv();
    if (!pending || !m) return false;
    return penEndpointsWithinJoinTolerance(
      this.host.ports,
      pending.startSvg.x,
      pending.startSvg.y,
      m.x,
      m.y
    );
  }

  private pendingDragSampleSvg(pending: Pick<PenPendingSegmentForPreview, 'startSvg'>): { x: number; y: number } {
    return samplePenPendingDragSvg(pending, this.host.getPendingDragSvg(), this.host.getPointerSvg());
  }

  private pendingCurvePreviewEndSvg(pending: PenPendingSegmentForPreview): { x: number; y: number } {
    return penPendingCurvePreviewEndUserSvg(
      pending,
      this.host.penPathCloseTargetMv(),
      this.host.penCommittedPathHasVertexBeyondMoveto(),
      (ax, ay, bx, by) => penEndpointsWithinJoinTolerance(this.host.ports, ax, ay, bx, by)
    );
  }

  private pendingCurveGeometryEndSvg(pending: {
    anchor: { x: number; y: number };
    startClient: { x: number; y: number };
    startSvg: { x: number; y: number };
    ctrlCurve: boolean;
  }): { x: number; y: number } {
    const pointer = this.host.getPointerSvg();
    if (this.host.penPendingIsFirstFromMoveto() && pointer) {
      return pointer;
    }
    if (this.host.penPendingChordColocated() && pointer) {
      return pointer;
    }
    return this.pendingCurvePreviewEndSvg(pending);
  }

  private appendPenPendingCurveToBaseD(baseD: string): string {
    const pending = this.host.getPendingSegment();
    if (!pending) return baseD;
    return buildPenPendingCurveAppendedBaseD({
      baseD,
      pending,
      segments: this.host.segments,
      penPointerSvg: this.host.getPointerSvg(),
      penPendingIsFirstSegmentFromMovetoGesture: this.host.penPendingIsFirstFromMoveto(),
      penPendingChordColocated: this.host.penPendingChordColocated(),
      curvePreviewEndUserSvg: (pen) => this.pendingCurvePreviewEndSvg(pen),
      dragSampleSvg: (pen) => this.pendingDragSampleSvg(pen),
      penPendingCurveAltChord: this.host.getPendingCurveAltChord(),
      penPendingShiftAngleSnap: this.host.getPendingShiftAngleSnap(),
      penPendingLastClient: this.host.getPendingLastClient()
    });
  }

  private committedOutgoingHandleSvg(): {
    anchorX: number;
    anchorY: number;
    hx: number;
    hy: number;
  } | null {
    return computePenCommittedOutgoingHandleSvg({
      currentToolIsPen: this.host.ports.getCurrentTool() === 'pen',
      isPenSessionActive: this.host.isPenSessionActive(),
      penPointerSvg: this.host.getPointerSvg(),
      penPendingShowsCurvePreview: this.penPendingShowsCurvePreview,
      segments: this.host.segments
    });
  }
}
