import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';
import type { GridLineOverlay } from './canvas-guide-overlay.model';

@Component({
  selector: 'g[app-grid-overlay]',
  templateUrl: './grid-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class GridOverlayComponent {
  readonly visible = input(false);
  readonly verticalLines = input<readonly GridLineOverlay[]>([]);
  readonly horizontalLines = input<readonly GridLineOverlay[]>([]);
}
