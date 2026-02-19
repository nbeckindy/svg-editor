import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
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
export class PropertiesPanelComponent implements OnInit, OnDestroy {
  selectedShape: ShapeProperties | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    private shapeSelectionService: ShapeSelectionService,
    private svgManipulationService: SvgManipulationService
  ) {}

  ngOnInit(): void {
    this.shapeSelectionService.selectedShape$
      .pipe(takeUntil(this.destroy$))
      .subscribe(shape => {
        this.selectedShape = shape;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFillColorChange(color: string): void {
    if (this.selectedShape) {
      this.svgManipulationService.updateFillColor(this.selectedShape.id, color);
      this.shapeSelectionService.updateSelectedShape({ fill: color });
    }
  }

  onStrokeColorChange(color: string): void {
    if (this.selectedShape) {
      if (color === 'none' || color === '') {
        this.svgManipulationService.removeStroke(this.selectedShape.id);
        this.shapeSelectionService.updateSelectedShape({ stroke: undefined, strokeWidth: 0 });
      } else {
        const width = this.selectedShape.strokeWidth || 1;
        this.svgManipulationService.updateStrokeColor(this.selectedShape.id, color);
        this.shapeSelectionService.updateSelectedShape({ stroke: color });
      }
    }
  }

  onStrokeWidthChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const width = parseFloat(target.value);
    
    if (this.selectedShape) {
      if (width === 0) {
        this.svgManipulationService.removeStroke(this.selectedShape.id);
        this.shapeSelectionService.updateSelectedShape({ strokeWidth: 0 });
      } else {
        const color = this.selectedShape.stroke || '#000000';
        this.svgManipulationService.addStroke(this.selectedShape.id, color, width);
        this.shapeSelectionService.updateSelectedShape({ strokeWidth: width });
      }
    }
  }

  onOpacityChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const opacity = parseFloat(target.value);
    
    if (this.selectedShape) {
      this.svgManipulationService.updateOpacity(this.selectedShape.id, opacity);
      this.shapeSelectionService.updateSelectedShape({ opacity });
    }
  }

  onClearSelection(): void {
    this.shapeSelectionService.clearSelection();
    this.svgManipulationService.clearHighlight();
  }
}
