import { Component, inject } from '@angular/core';
import {
  PaintSwatchPopoverComponent,
  type PaintSwatchMode
} from '../paint-swatch-popover/paint-swatch-popover.component';
import {
  creationFillPaintMode,
  creationStrokePaintMode
} from '../../models/drawing-style-defaults';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';

/**
 * Compact **Creation paint defaults** for the tool strip.
 * Updates next-draw defaults only — never Selection paint (ADR 0003).
 */
@Component({
  selector: 'app-creation-paint-defaults',
  imports: [PaintSwatchPopoverComponent],
  templateUrl: './creation-paint-defaults.component.html',
  styleUrl: './creation-paint-defaults.component.css'
})
export class CreationPaintDefaultsComponent {
  private readonly chromeApply = inject(ChromeEditorApplyService);
  readonly defaults = inject(DrawingStyleDefaultsService);

  fillMode(): PaintSwatchMode {
    return creationFillPaintMode(this.defaults.defaults());
  }

  strokeMode(): PaintSwatchMode {
    return creationStrokePaintMode(this.defaults.defaults());
  }

  fillEmpty(): boolean {
    return this.fillMode() === 'none';
  }

  strokeEmpty(): boolean {
    return this.strokeMode() === 'none';
  }

  fillPickerColor(): string {
    const f = this.defaults.fill();
    return !f || f.toLowerCase() === 'none' ? '#000000' : f;
  }

  strokePickerColor(): string {
    const s = this.defaults.stroke();
    return !s || s.toLowerCase() === 'none' ? '#000000' : s;
  }

  onFillPaintModeChange(mode: PaintSwatchMode): void {
    this.chromeApply.applyCreationFillPaintMode(mode);
  }

  onStrokePaintModeChange(mode: PaintSwatchMode): void {
    this.chromeApply.applyCreationStrokePaintMode(mode);
  }

  onFillChange(color: string): void {
    this.chromeApply.applyCreationFillDefault(color);
  }

  onStrokeChange(color: string): void {
    this.chromeApply.applyCreationStrokeDefault(color);
  }
}
