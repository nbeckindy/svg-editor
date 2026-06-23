import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';
import type { MultiSelectionOutlineRect, OverlayRect } from './overlay-rect.model';

@Component({
  selector: 'g[app-selection-overlay]',
  templateUrl: './selection-overlay.component.html',
  styleUrl: './selection-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class SelectionOverlayComponent {
  readonly hideHighlight = input(false);
  readonly highlightRect = input<OverlayRect | null>(null);
  readonly isRotatingSelection = input(false);
  readonly multiSelectionOutlineRects = input<readonly MultiSelectionOutlineRect[]>([]);
  readonly selectionRotateHighlightTransform = input<(rect: OverlayRect) => string>(() => '');
  readonly showResizeHandles = input(false);
  readonly showSkewHandles = input(false);
  readonly handleRadius = input(0);
  readonly skewEdgeOutset = input(0);
  readonly rotateHandleOffset = input(0);
}
