import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { ColorPickerComponent } from '../color-picker/color-picker.component';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.css'
})
export class PropertiesPanelComponent {
  private shapeSelectionService = inject(ShapeSelectionService);
  readonly selectedShape = this.shapeSelectionService.selectedShape;
  private svgManipulationService = inject(SvgManipulationService);

  onFillColorChange(color: string): void {
    const shape = this.selectedShape();
    if (shape) {
      this.svgManipulationService.updateFillColor(shape.id, color);
      this.shapeSelectionService.updateSelectedShape({ fill: color });
    }
  }

  onStrokeColorChange(color: string): void {
    const shape = this.selectedShape();
    if (shape) {
      if (color === 'none' || color === '') {
        this.svgManipulationService.removeStroke(shape.id);
        this.shapeSelectionService.updateSelectedShape({ stroke: undefined, strokeWidth: 0 });
      } else {
        const width = shape.strokeWidth || 1;
        this.svgManipulationService.updateStrokeColor(shape.id, color);
        this.shapeSelectionService.updateSelectedShape({ stroke: color });
      }
    }
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    const shape = this.selectedShape();
    if (shape) {
      if (width === 0) {
        this.svgManipulationService.removeStroke(shape.id);
        this.shapeSelectionService.updateSelectedShape({ strokeWidth: 0 });
      } else {
        const color = shape.stroke || '#000000';
        this.svgManipulationService.addStroke(shape.id, color, width);
        this.shapeSelectionService.updateSelectedShape({ strokeWidth: width });
      }
    }
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    const shape = this.selectedShape();
    if (shape) {
      this.svgManipulationService.updateOpacity(shape.id, opacity);
      this.shapeSelectionService.updateSelectedShape({ opacity });
    }
  }

  onClearSelection(): void {
    this.shapeSelectionService.clearSelection();
    this.svgManipulationService.clearHighlight();
  }
}
