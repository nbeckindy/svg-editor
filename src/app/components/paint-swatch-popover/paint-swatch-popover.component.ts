import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { EditableGradientModel, cssGradientPreviewFromModel } from '../../models/svg-gradient';

export type PaintSwatchTarget = 'fill' | 'stroke';
export type PaintSwatchMode = 'solid' | 'linear' | 'radial' | 'none';

@Component({
  selector: 'app-paint-swatch-popover',
  imports: [CommonModule, MatIconModule, ColorPickerComponent],
  templateUrl: './paint-swatch-popover.component.html',
  styleUrl: './paint-swatch-popover.component.css'
})
export class PaintSwatchPopoverComponent {
  readonly target = input<PaintSwatchTarget>('fill');
  readonly mode = input<PaintSwatchMode>('solid');
  readonly color = input<string>('#000000');
  readonly gradientModel = input<EditableGradientModel | null>(null);
  /** True when paint is `none` / absent. */
  readonly empty = input(false);
  /** Mixed selection with differing paint values. */
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  /** Disables linear/radial tabs (mixed paint, pattern, etc.). */
  readonly gradientModesDisabled = input(false);

  readonly paintModeChange = output<PaintSwatchMode>();
  readonly colorChange = output<string>();

  readonly noPaintLabel = computed(() => (this.target() === 'fill' ? 'No fill' : 'No stroke'));

  readonly swatchBackground = computed(() => {
    const m = this.mode();
    if (m === 'linear' || m === 'radial') {
      const model = this.gradientModel();
      if (model) return cssGradientPreviewFromModel(model);
      return m === 'radial'
        ? 'radial-gradient(circle, #ffffff 0%, #000000 100%)'
        : 'linear-gradient(90deg, #ffffff 0%, #000000 100%)';
    }
    return null;
  });

  readonly activeModeTab = computed(() => this.mode());

  onModeTabClick(mode: PaintSwatchMode, event: Event): void {
    if (this.disabled()) return;
    if (mode === 'linear' || mode === 'radial') {
      if (this.gradientModesDisabled()) return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (mode === this.mode()) return;
    this.paintModeChange.emit(mode);
  }

  onSolidColorChange(value: string): void {
    if (this.disabled()) return;
    this.colorChange.emit(value);
  }
}
