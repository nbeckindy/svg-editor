import { Component, inject } from '@angular/core';
import { GradientFillEditorComponent } from '../gradient-fill-editor/gradient-fill-editor.component';
import { PaintSwatchPopoverComponent } from '../paint-swatch-popover/paint-swatch-popover.component';
import { SelectionPaintUiService } from '../../services/selection-paint-ui.service';

@Component({
  selector: 'app-stroke-panel',
  imports: [PaintSwatchPopoverComponent, GradientFillEditorComponent],
  templateUrl: './stroke-panel.component.html',
  styleUrl: './stroke-panel.component.css'
})
export class StrokePanelComponent {
  readonly paint = inject(SelectionPaintUiService);
}
