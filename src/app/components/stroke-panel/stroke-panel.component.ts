import { Component, inject } from '@angular/core';
import { SelectionPaintUiService } from '../../services/selection-paint-ui.service';

@Component({
  selector: 'app-stroke-panel',
  imports: [],
  templateUrl: './stroke-panel.component.html',
  styleUrl: './stroke-panel.component.css'
})
export class StrokePanelComponent {
  readonly paint = inject(SelectionPaintUiService);
}
