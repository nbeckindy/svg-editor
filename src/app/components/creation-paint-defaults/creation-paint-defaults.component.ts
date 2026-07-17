import { Component, inject } from '@angular/core';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';

/**
 * Compact **Creation paint defaults** for the tool strip.
 * Updates next-draw defaults only — never Selection paint (ADR 0003).
 */
@Component({
  selector: 'app-creation-paint-defaults',
  imports: [ColorPickerComponent],
  templateUrl: './creation-paint-defaults.component.html',
  styleUrl: './creation-paint-defaults.component.css'
})
export class CreationPaintDefaultsComponent {
  private readonly chromeApply = inject(ChromeEditorApplyService);
  readonly defaults = inject(DrawingStyleDefaultsService);

  fillEmpty(): boolean {
    const f = this.defaults.fill();
    return !f || f.toLowerCase() === 'none';
  }

  strokeEmpty(): boolean {
    const s = this.defaults.stroke();
    return !s || s.toLowerCase() === 'none';
  }

  onFillChange(color: string): void {
    this.chromeApply.applyCreationFillDefault(color);
  }

  onStrokeChange(color: string): void {
    this.chromeApply.applyCreationStrokeDefault(color);
  }

  onStrokeWidthChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const width = parseFloat(raw);
    this.chromeApply.applyCreationStrokeWidthDefault(width);
  }
}
