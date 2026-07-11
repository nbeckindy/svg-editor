import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';

@Component({
  selector: 'g[app-pen-preview-overlay]',
  templateUrl: './pen-preview-overlay.component.html',
  styleUrl: './pen-preview-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class PenPreviewOverlayComponent {
  readonly stroke = input.required<string>();
  readonly strokeWidth = input.required<number>();

  readonly penInsertOnPathPreviewPathD = input<string | null>(null);
  readonly penSessionPreviewPathD = input<string | null>(null);
  readonly penCurvePreviewPathD = input<string | null>(null);
  readonly penFirstAnchorMirroredHandleDragActive = input(false);
  readonly penColocatedTipMirroredHandleDragActive = input(false);
  readonly penCurveHandleOverlays = input<readonly { cx: number; cy: number }[]>([]);
  readonly penRubberBandOverlay = input<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  readonly penOutgoingHandleGuideOverlay = input<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  readonly penOutgoingHandleKnobOverlay = input<{ cx: number; cy: number } | null>(null);
  readonly penContinuationGhostPathD = input<string | null>(null);
  readonly penCloseTargetHoverOverlay = input<{ cx: number; cy: number } | null>(null);
  readonly penOpenPathContinueHoverOverlay = input<{ cx: number; cy: number } | null>(null);
}
