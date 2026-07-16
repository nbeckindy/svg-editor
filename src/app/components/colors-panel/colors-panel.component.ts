import { Component, inject } from '@angular/core';
import { GradientFillEditorComponent } from '../gradient-fill-editor/gradient-fill-editor.component';
import { PaintSwatchPopoverComponent } from '../paint-swatch-popover/paint-swatch-popover.component';
import { SelectionPaintUiService } from '../../services/selection-paint-ui.service';

@Component({
  selector: 'app-colors-panel',
  imports: [PaintSwatchPopoverComponent, GradientFillEditorComponent],
  templateUrl: './colors-panel.component.html',
  styleUrl: './colors-panel.component.css'
})
export class ColorsPanelComponent {
  readonly paint = inject(SelectionPaintUiService);
}
