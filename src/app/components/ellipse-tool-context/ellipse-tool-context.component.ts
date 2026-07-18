import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  OrientationGridComponent,
  type OrientationPoint
} from '../orientation-grid/orientation-grid.component';
import { EllipseCreationDefaultsService } from '../../services/ellipse-creation-defaults.service';

@Component({
  selector: 'app-ellipse-tool-context',
  imports: [OrientationGridComponent],
  templateUrl: './ellipse-tool-context.component.html',
  styleUrl: './ellipse-tool-context.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EllipseToolContextComponent {
  readonly defaults = inject(EllipseCreationDefaultsService);

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
}
