import { Component, inject } from '@angular/core';
import {
  PaintSwatchPopoverComponent,
  type PaintSwatchMode
} from '../paint-swatch-popover/paint-swatch-popover.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { SelectionPaintUiService } from '../../services/selection-paint-ui.service';
import type { EditableGradientModel } from '../../models/svg-gradient';

/**
 * Compact fill/stroke swatches for the tool strip.
 *
 * - **Empty selection:** edits **Creation paint defaults** (next-draw only).
 * - **With selection:** edits **Selection** paint via the same apply path as Colors
 *   (also dual-writes defaults). Gradient modes stay hidden — Colors owns gradients.
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
  readonly paint = inject(SelectionPaintUiService);

  groupAriaLabel(): string {
    return this.paint.hasSelection() ? 'Selection fill and stroke' : 'Creation paint defaults';
  }

  /** Solid / none / gradient preview — rail does not expose gradient mode tabs. */
  fillMode(): PaintSwatchMode {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.fillSwatchMode(shape);
    const f = this.defaults.fill();
    return !f || f.toLowerCase() === 'none' ? 'none' : 'solid';
  }

  strokeMode(): PaintSwatchMode {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.strokeSwatchMode(shape);
    const s = this.defaults.stroke();
    return !s || s.toLowerCase() === 'none' ? 'none' : 'solid';
  }

  fillEmpty(): boolean {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.allSelectedLackFill(shape);
    return this.fillMode() === 'none';
  }

  strokeEmpty(): boolean {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.allSelectedLackStroke(shape);
    return this.strokeMode() === 'none';
  }

  fillPickerColor(): string {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.fillPickerColor(shape);
    const f = this.defaults.fill();
    return !f || f.toLowerCase() === 'none' ? '#000000' : f;
  }

  strokePickerColor(): string {
    const shape = this.paint.selectedShape();
    if (shape) return this.paint.strokePickerColor(shape);
    const s = this.defaults.stroke();
    return !s || s.toLowerCase() === 'none' ? '#000000' : s;
  }

  fillGradientModel(): EditableGradientModel | null {
    const shape = this.paint.selectedShape();
    return shape ? this.paint.gradientModelForShape(shape, 'fill') : null;
  }

  strokeGradientModel(): EditableGradientModel | null {
    const shape = this.paint.selectedShape();
    return shape ? this.paint.gradientModelForShape(shape, 'stroke') : null;
  }

  fillIndeterminate(): boolean {
    return this.paint.hasSelection() && this.paint.fillPaintMixed();
  }

  strokeIndeterminate(): boolean {
    return this.paint.hasSelection() && this.paint.strokePaintMixed();
  }

  fillDisabled(): boolean {
    if (!this.paint.hasSelection()) return false;
    const shape = this.paint.selectedShape();
    if (!shape) return true;
    if (this.paint.anySelectedShapeLocked()) return true;
    if (!this.paint.supportsFill(shape)) return true;
    return this.paint.isPatternFill(shape);
  }

  strokeDisabled(): boolean {
    if (!this.paint.hasSelection()) return false;
    if (this.paint.anySelectedShapeLocked()) return true;
    const shape = this.paint.selectedShape();
    return shape ? this.paint.isPatternStroke(shape) : true;
  }

  onFillPaintModeChange(mode: PaintSwatchMode): void {
    if (mode === 'linear' || mode === 'radial') return;
    if (this.paint.hasSelection()) {
      this.paint.onFillPaintModeChange(mode);
      return;
    }
    this.chromeApply.applyCreationFillPaintMode(mode);
  }

  onStrokePaintModeChange(mode: PaintSwatchMode): void {
    if (mode === 'linear' || mode === 'radial') return;
    if (this.paint.hasSelection()) {
      this.paint.onStrokePaintModeChange(mode);
      return;
    }
    this.chromeApply.applyCreationStrokePaintMode(mode);
  }

  onFillChange(color: string): void {
    if (this.paint.hasSelection()) {
      this.paint.onFillColorChange(color);
      return;
    }
    this.chromeApply.applyCreationFillDefault(color);
  }

  onStrokeChange(color: string): void {
    if (this.paint.hasSelection()) {
      this.paint.onStrokeColorChange(color);
      return;
    }
    this.chromeApply.applyCreationStrokeDefault(color);
  }
}
