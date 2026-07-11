import { ChangeDetectionStrategy, Component, input, NO_ERRORS_SCHEMA } from '@angular/core';

@Component({
  selector: 'g[app-boolean-preview-overlay]',
  templateUrl: './boolean-preview-overlay.component.html',
  styleUrl: './boolean-preview-overlay.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [NO_ERRORS_SCHEMA]
})
export class BooleanPreviewOverlayComponent {
  readonly pathBooleanPreviewOverlayD = input<string | null>(null);
}
