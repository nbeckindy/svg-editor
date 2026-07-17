import { Component, computed, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { EditableGradientModel, cssGradientPreviewFromModel } from '../../models/svg-gradient';

export type PaintSwatchTarget = 'fill' | 'stroke';
export type PaintSwatchMode = 'solid' | 'linear' | 'radial' | 'none';
export type PaintSwatchPanelAlign = 'start' | 'end';
/** Where the popover panel opens relative to the swatch. */
export type PaintSwatchPanelPlacement = 'below' | 'aside';

@Component({
  selector: 'app-paint-swatch-popover',
  imports: [MatIconModule, ColorPickerComponent],
  templateUrl: './paint-swatch-popover.component.html',
  styleUrl: './paint-swatch-popover.component.css',
  host: {
    '(document:click)': 'onDocumentClick($event)'
  }
})
export class PaintSwatchPopoverComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly detailsEl = viewChild<ElementRef<HTMLDetailsElement>>('detailsPopover');

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
  /** When false, Linear/Radial tabs are omitted (e.g. creation defaults with no gradient editor). */
  readonly gradientModesVisible = input(true);
  /** Align popover panel to the swatch start (left) or end (right) edge. */
  readonly panelAlign = input<PaintSwatchPanelAlign>('start');
  /** Open panel below the swatch (dock) or to the side (tool strip). */
  readonly panelPlacement = input<PaintSwatchPanelPlacement>('below');

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

  onDetailsToggle(event: Event): void {
    event.stopPropagation();
    const details = event.target as HTMLDetailsElement;
    if (!details.open) {
      this.resetPanelPosition();
      return;
    }
    requestAnimationFrame(() => this.adjustPanelPosition());
  }

  onDocumentClick(event: MouseEvent): void {
    const details = this.detailsEl()?.nativeElement;
    if (!details?.open) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    details.open = false;
    this.resetPanelPosition();
  }

  onModeTabClick(mode: PaintSwatchMode, event: Event): void {
    if (this.disabled()) return;
    if (mode === 'linear' || mode === 'radial') {
      if (!this.gradientModesVisible() || this.gradientModesDisabled()) return;
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

  private adjustPanelPosition(): void {
    const panel = this.host.nativeElement.querySelector('.psp-panel') as HTMLElement | null;
    if (!panel) return;

    panel.style.transform = '';

    const margin = 8;
    const rect = panel.getBoundingClientRect();
    const panelRoot = this.host.nativeElement.closest('.properties-panel') as HTMLElement | null;
    const panelRootRect = panelRoot?.getBoundingClientRect();

    let boundsLeft = margin;
    let boundsRight = window.innerWidth - margin;
    if (panelRootRect) {
      boundsLeft = Math.max(boundsLeft, panelRootRect.left + margin);
      boundsRight = Math.min(boundsRight, panelRootRect.right - margin);
    }

    let translateX = 0;
    if (rect.right > boundsRight) {
      translateX -= rect.right - boundsRight;
    }
    const projectedLeft = rect.left + translateX;
    if (projectedLeft < boundsLeft) {
      translateX += boundsLeft - projectedLeft;
    }

    if (translateX !== 0) {
      panel.style.transform = `translateX(${translateX}px)`;
    }
  }

  private resetPanelPosition(): void {
    const panel = this.host.nativeElement.querySelector('.psp-panel') as HTMLElement | null;
    if (!panel) return;
    panel.style.transform = '';
  }
}
