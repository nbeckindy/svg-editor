import type { PenToolSession } from './pen-tool-session/pen-tool-session';

/**
 * Pen preview getters for **Editor chrome** — keeps {@link SvgCanvasComponent} from proxying
 * every {@link PenToolSession} overlay field.
 */
export class PenToolChromeReadout {
  constructor(private readonly penTool: PenToolSession) {}

  get penFinishFeedbackMessage(): string | null {
    return this.penTool.penFinishFeedbackMessage;
  }

  get penSessionPreviewPathD(): string | null {
    return this.penTool.penSessionPreviewPathD;
  }

  get penInsertOnPathPreviewPathD(): string | null {
    return this.penTool.penInsertOnPathPreviewPathD;
  }

  get penInsertOnPathNodeAffordanceOverlay() {
    return this.penTool.penInsertOnPathNodeAffordanceOverlay;
  }

  get penCurvePreviewPathD(): string | null {
    return this.penTool.penCurvePreviewPathD;
  }

  get penFirstAnchorMirroredHandleDragActive(): boolean {
    return this.penTool.penFirstAnchorMirroredHandleDragActive;
  }

  get penColocatedTipMirroredHandleDragActive(): boolean {
    return this.penTool.penColocatedTipMirroredHandleDragActive;
  }

  get penCurveHandleOverlays(): { cx: number; cy: number }[] {
    return this.penTool.penCurveHandleOverlays;
  }

  get penPendingCurveHandleGuideOverlays(): { x1: number; y1: number; x2: number; y2: number }[] {
    return this.penTool.penPendingCurveHandleGuideOverlays;
  }

  get penRubberBandOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return this.penTool.penRubberBandOverlay;
  }

  get penOutgoingHandleGuideOverlay(): { x1: number; y1: number; x2: number; y2: number } | null {
    return this.penTool.penOutgoingHandleGuideOverlay;
  }

  get penOutgoingHandleKnobOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penOutgoingHandleKnobOverlay;
  }

  get penCloseTargetHoverOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penCloseTargetHoverOverlay;
  }

  get penOpenPathContinueHoverOverlay(): { cx: number; cy: number } | null {
    return this.penTool.penOpenPathContinueHoverOverlay;
  }

  get penContinuationGhostPathD(): string | null {
    return this.penTool.penContinuationGhostPathD;
  }

  get penPostInsertAnchorOverlays(): { cx: number; cy: number }[] {
    return this.penTool.penPostInsertAnchorOverlays;
  }

  get penSessionPathNodeOverlays() {
    return this.penTool.penSessionPathNodeOverlays;
  }

  get penSessionPathOutlineOverlayD(): string | null {
    return this.penTool.penSessionPathOutlineOverlayD;
  }
}
