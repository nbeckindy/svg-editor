import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  OrientationGridComponent,
  type OrientationPoint
} from '../orientation-grid/orientation-grid.component';
import { RectCreationDefaultsService } from '../../services/rect-creation-defaults.service';

@Component({
  selector: 'app-rect-tool-context',
  imports: [OrientationGridComponent],
  templateUrl: './rect-tool-context.component.html',
  styleUrl: './rect-tool-context.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RectToolContextComponent {
  readonly defaults = inject(RectCreationDefaultsService);

  onOrientationSelect(point: OrientationPoint): void {
    this.defaults.setOrientation(point);
  }

  onWidthChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const n = Number.parseFloat(raw);
    this.defaults.setWidth(n);
  }

  onHeightChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const n = Number.parseFloat(raw);
    this.defaults.setHeight(n);
  }

  onCornerChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const n = Number.parseFloat(raw);
    this.defaults.setCornerRadius(n);
  }
}
