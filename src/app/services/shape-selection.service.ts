import { Injectable, signal, computed } from '@angular/core';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class ShapeSelectionService {
  readonly selectedShapes = signal<ShapeProperties[]>([]);
  readonly selectedShape = computed(() => {
    const shapes = this.selectedShapes();
    return shapes.length > 0 ? shapes[0] : null;
  });

  /**
   * Select a single shape (replaces current selection)
   */
  selectShape(shape: ShapeProperties): void {
    this.selectedShapes.set([shape]);
  }

  /**
   * Replace selection with multiple shapes (marquee select).
   */
  selectShapes(shapes: ShapeProperties[]): void {
    this.selectedShapes.set([...shapes]);
  }

  /**
   * Add shapes that are not already selected (Shift + marquee). Preserves existing order, appends new ids in `shapes` order.
   */
  mergeShapesIntoSelection(shapes: ShapeProperties[]): void {
    if (shapes.length === 0) return;
    const current = this.selectedShapes();
    const seen = new Set(current.map((s) => s.id));
    const added = shapes.filter((s) => !seen.has(s.id));
    if (added.length === 0) return;
    this.selectedShapes.set([...current, ...added]);
  }

  /**
   * Clear current selection
   */
  clearSelection(): void {
    this.selectedShapes.set([]);
  }

  /**
   * Add shape to selection if not selected; remove if already selected
   */
  toggleShapeInSelection(shape: ShapeProperties): void {
    const current = this.selectedShapes();
    const index = current.findIndex((s) => s.id === shape.id);
    if (index >= 0) {
      const next = current.slice(0, index).concat(current.slice(index + 1));
      this.selectedShapes.set(next);
    } else {
      this.selectedShapes.set([...current, shape]);
    }
  }

  /**
   * Whether the shape with the given id is in the current selection
   */
  isShapeSelected(id: string): boolean {
    return this.selectedShapes().some((s) => s.id === id);
  }

  /**
   * Get currently selected shape (first of selection, for backward compatibility)
   */
  getSelectedShape(): ShapeProperties | null {
    return this.selectedShape();
  }

  /**
   * Get all currently selected shapes
   */
  getSelectedShapes(): ShapeProperties[] {
    return this.selectedShapes();
  }

  /**
   * Update selected shape properties (updates first shape only)
   */
  updateSelectedShape(updates: Partial<ShapeProperties>): void {
    const current = this.selectedShapes();
    if (current.length > 0) {
      const updated = { ...current[0], ...updates };
      this.selectedShapes.set([updated, ...current.slice(1)]);
    }
  }
}
