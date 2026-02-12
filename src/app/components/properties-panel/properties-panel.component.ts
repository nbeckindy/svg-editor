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
  template: `
    <div class="properties-panel">
      <div class="panel-header">
        <h3>Properties</h3>
      </div>
      
      @if (selectedShape) {
        <div class="properties-content">
          <div class="property-group">
            <label class="property-label">Shape Type</label>
            <div class="property-value readonly">{{ selectedShape.type }}</div>
          </div>

          <div class="property-group">
            <label class="property-label">ID</label>
            <div class="property-value readonly">{{ selectedShape.id }}</div>
          </div>

          <div class="property-group">
            <label class="property-label" for="fill-color">Fill Color</label>
            <div class="color-input-group">
              <app-color-picker
                [color]="selectedShape.fill || '#000000'"
                (colorChange)="onFillColorChange($event)">
              </app-color-picker>
            </div>
          </div>

          <div class="property-group">
            <label class="property-label" for="stroke-color">Stroke Color</label>
            <div class="color-input-group">
              <app-color-picker
                [color]="selectedShape.stroke || '#000000'"
                (colorChange)="onStrokeColorChange($event)">
              </app-color-picker>
            </div>
          </div>

          <div class="property-group">
            <label class="property-label" for="stroke-width">Stroke Width</label>
            <div class="range-input-group">
              <input 
                type="range" 
                id="stroke-width"
                class="range-slider"
                min="0"
                max="20"
                step="0.5"
                [value]="selectedShape.strokeWidth || 0"
                (input)="onStrokeWidthChange($event)">
              <input 
                type="number" 
                class="range-number"
                min="0"
                max="100"
                step="0.5"
                [value]="selectedShape.strokeWidth || 0"
                (change)="onStrokeWidthChange($event)">
            </div>
          </div>

          <div class="property-group">
            <label class="property-label" for="opacity">Opacity</label>
            <div class="range-input-group">
              <input 
                type="range" 
                id="opacity"
                class="range-slider"
                min="0"
                max="1"
                step="0.01"
                [value]="selectedShape.opacity || 1"
                (input)="onOpacityChange($event)">
              <input 
                type="number" 
                class="range-number"
                min="0"
                max="1"
                step="0.01"
                [value]="selectedShape.opacity || 1"
                (change)="onOpacityChange($event)">
            </div>
          </div>

          <div class="panel-actions">
            <button class="btn-secondary" (click)="onClearSelection()">
              Clear Selection
            </button>
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <p>No shape selected</p>
          <p class="hint">Click on a shape in the canvas to edit its properties</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .properties-panel {
      background: #f5f5f5;
      border-left: 1px solid #ddd;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      padding: 16px;
      background: #fff;
      border-bottom: 1px solid #ddd;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }

    .properties-content {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }

    .property-group {
      margin-bottom: 20px;
    }

    .property-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #555;
      margin-bottom: 8px;
    }

    .property-value {
      padding: 8px 12px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      color: #333;
    }

    .property-value.readonly {
      background: #fafafa;
      color: #666;
    }

    .color-input-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .color-picker {
      width: 50px;
      height: 38px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      padding: 2px;
    }

    .color-text {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: 'Courier New', monospace;
    }

    .range-input-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .range-slider {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: #ddd;
      outline: none;
      -webkit-appearance: none;
    }

    .range-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #2196F3;
      cursor: pointer;
    }

    .range-slider::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #2196F3;
      cursor: pointer;
      border: none;
    }

    .range-number {
      width: 70px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      text-align: center;
    }

    .panel-actions {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
    }

    .btn-secondary {
      width: 100%;
      padding: 10px 16px;
      background: #fff;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .btn-secondary:hover {
      background: #f5f5f5;
      border-color: #999;
      color: #333;
    }

    .empty-state {
      padding: 40px 16px;
      text-align: center;
      color: #999;
    }

    .empty-state p {
      margin: 8px 0;
    }

    .empty-state .hint {
      font-size: 13px;
      color: #bbb;
    }

    input[type="color"]::-webkit-color-swatch-wrapper {
      padding: 0;
    }

    input[type="color"]::-webkit-color-swatch {
      border: none;
      border-radius: 2px;
    }
  `]
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
