import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import type { RulerTickOverlay } from './ruler-overlay.model';

@Component({
  selector: 'app-ruler-overlay',
  templateUrl: './ruler-overlay.component.html',
  styleUrl: './ruler-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RulerOverlayComponent {
  readonly rulerSize = input(24);
  readonly wrapperWidth = input(0);
  readonly horizontalTicks = input<readonly RulerTickOverlay[]>([]);
  readonly verticalTicks = input<readonly RulerTickOverlay[]>([]);

  readonly rulerLeftEl = viewChild<ElementRef<HTMLElement>>('rulerLeft');
}
