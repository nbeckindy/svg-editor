import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class ShapeSelectionService {
  private selectedShapeSubject = new BehaviorSubject<ShapeProperties | null>(null);
  public selectedShape$: Observable<ShapeProperties | null> = this.selectedShapeSubject.asObservable();

  /**
   * Select a shape and emit its properties
   */
  selectShape(shape: ShapeProperties): void {
    this.selectedShapeSubject.next(shape);
  }

  /**
   * Clear current selection
   */
  clearSelection(): void {
    this.selectedShapeSubject.next(null);
  }

  /**
   * Get currently selected shape
   */
  getSelectedShape(): ShapeProperties | null {
    return this.selectedShapeSubject.value;
  }

  /**
   * Update selected shape properties
   */
  updateSelectedShape(updates: Partial<ShapeProperties>): void {
    const current = this.selectedShapeSubject.value;
    if (current) {
      this.selectedShapeSubject.next({ ...current, ...updates });
    }
  }
}
