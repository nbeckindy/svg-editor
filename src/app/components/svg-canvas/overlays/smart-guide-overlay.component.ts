import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';
import type { SmartGuideLineOverlay } from './canvas-guide-overlay.model';

@Component({
  selector: 'g[app-smart-guide-overlay]',
  templateUrl: './smart-guide-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class SmartGuideOverlayComponent {
  readonly verticalLines = input<readonly SmartGuideLineOverlay[]>([]);
  readonly horizontalLines = input<readonly SmartGuideLineOverlay[]>([]);
}
