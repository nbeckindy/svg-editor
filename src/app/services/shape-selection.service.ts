import { Injectable, signal } from '@angular/core';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class ShapeSelectionService {
  readonly selectedShape = signal<ShapeProperties | null>(null);

  /**
   * Select a shape and update the signal
   */
  selectShape(shape: ShapeProperties): void {
    this.selectedShape.set(shape);
  }

  /**
   * Clear current selection
   */
  clearSelection(): void {
    this.selectedShape.set(null);
  }

  /**
   * Get currently selected shape
   */
  getSelectedShape(): ShapeProperties | null {
    return this.selectedShape();
  }

  /**
   * Update selected shape properties
   */
  updateSelectedShape(updates: Partial<ShapeProperties>): void {
    const current = this.selectedShape();
    if (current) {
      this.selectedShape.set({ ...current, ...updates });
    }
  }
}
