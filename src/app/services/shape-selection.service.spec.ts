import { TestBed } from '@angular/core/testing';
import { editorPortTestProviders } from '../testing/editor-port-test-providers';
import { ShapeSelectionService } from './shape-selection.service';
import { ShapeProperties } from '../models/shape-properties.interface';

describe('ShapeSelectionService', () => {
  let service: ShapeSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: editorPortTestProviders });
    service = TestBed.inject(ShapeSelectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with no selection', () => {
    expect(service.getSelectedShape()).toBeNull();
    expect(service.getSelectedShapes()).toEqual([]);
  });

  it('should select a shape (selectedShapes has one, selectShape replaces)', () => {
    const testShape: ShapeProperties = {
      id: 'test-circle',
      type: 'circle',
      fill: '#FF0000',
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 1
    };

    service.selectShape(testShape);

    const selected = service.getSelectedShape();
    expect(selected?.id).toBe('test-circle');
    expect(selected?.type).toBe('circle');
    expect(selected?.fill).toBe('#FF0000');
    expect(service.getSelectedShapes()).toHaveLength(1);
    expect(service.getSelectedShapes()[0].id).toBe('test-circle');
  });

  it('should replace selection when selectShape is called with another shape', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShape(shapeA);
    service.selectShape(shapeB);
    expect(service.getSelectedShapes()).toHaveLength(1);
    expect(service.getSelectedShape()?.id).toBe('b');
  });

  it('should select multiple shapes with selectShapes', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShapes([shapeA, shapeB]);
    expect(service.getSelectedShapes()).toHaveLength(2);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('replaceSelection should match selectShapes', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.replaceSelection([shapeA, shapeB]);
    expect(service.selectionCount()).toBe(2);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('selectionCount tracks selectedShapes', () => {
    expect(service.selectionCount()).toBe(0);
    service.selectShape({ id: 'x', type: 'rect', fill: '#000' });
    expect(service.selectionCount()).toBe(1);
    service.clearSelection();
    expect(service.selectionCount()).toBe(0);
  });

  it('mergeShapesIntoSelection should add only new ids', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    const shapeC: ShapeProperties = { id: 'c', type: 'rect', fill: '#00f' };
    service.selectShape(shapeA);
    service.mergeShapesIntoSelection([shapeB, shapeA, shapeC]);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('mergeShapesIntoSelection should no-op when all already selected', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    service.selectShape(shapeA);
    service.mergeShapesIntoSelection([shapeA]);
    expect(service.getSelectedShapes()).toHaveLength(1);
  });

  it('should toggle shape into selection when not selected', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShape(shapeA);
    service.toggleShapeInSelection(shapeB);
    expect(service.getSelectedShapes()).toHaveLength(2);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
    expect(service.isShapeSelected('a')).toBe(true);
    expect(service.isShapeSelected('b')).toBe(true);
  });

  it('should toggle shape out of selection when already selected', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShape(shapeA);
    service.toggleShapeInSelection(shapeB);
    service.toggleShapeInSelection(shapeA);
    expect(service.getSelectedShapes()).toHaveLength(1);
    expect(service.getSelectedShapes()[0].id).toBe('b');
    expect(service.isShapeSelected('a')).toBe(false);
    expect(service.isShapeSelected('b')).toBe(true);
  });

  it('toggleShapeGroupInSelection should merge missing group members', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'rect', fill: '#0f0' };
    const shapeC: ShapeProperties = { id: 'c', type: 'rect', fill: '#00f' };
    service.selectShape(shapeA);
    service.toggleShapeGroupInSelection([shapeB, shapeC]);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('toggleShapeGroupInSelection should remove all group members when fully selected', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'rect', fill: '#0f0' };
    service.selectShapes([shapeA, shapeB]);
    service.toggleShapeGroupInSelection([shapeA, shapeB]);
    expect(service.getSelectedShapes()).toEqual([]);
  });

  it('toggleShapeGroupInSelection with partial group membership should merge the rest', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const shapeB: ShapeProperties = { id: 'b', type: 'rect', fill: '#0f0' };
    service.selectShape(shapeA);
    service.toggleShapeGroupInSelection([shapeA, shapeB]);
    expect(service.getSelectedShapes().map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('should have empty selection when last shape is toggled out', () => {
    const shapeA: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    service.selectShape(shapeA);
    service.toggleShapeInSelection(shapeA);
    expect(service.getSelectedShapes()).toEqual([]);
    expect(service.getSelectedShape()).toBeNull();
    expect(service.isShapeSelected('a')).toBe(false);
  });

  it('should report isShapeSelected correctly', () => {
    expect(service.isShapeSelected('x')).toBe(false);
    const shape: ShapeProperties = { id: 'x', type: 'rect', fill: '#000' };
    service.selectShape(shape);
    expect(service.isShapeSelected('x')).toBe(true);
    expect(service.isShapeSelected('y')).toBe(false);
  });

  it('should return currently selected shape', () => {
    const testShape: ShapeProperties = {
      id: 'test-rect',
      type: 'rect',
      fill: '#00FF00'
    };

    service.selectShape(testShape);
    const selected = service.getSelectedShape();

    expect(selected).not.toBeNull();
    expect(selected?.id).toBe('test-rect');
    expect(selected?.type).toBe('rect');
  });

  it('should clear selection', () => {
    const testShape: ShapeProperties = {
      id: 'test-shape',
      type: 'polygon',
      fill: '#0000FF'
    };

    service.selectShape(testShape);
    expect(service.getSelectedShape()).not.toBeNull();
    expect(service.getSelectedShapes()).toHaveLength(1);

    service.clearSelection();
    expect(service.getSelectedShape()).toBeNull();
    expect(service.getSelectedShapes()).toEqual([]);
  });

  it('should update selected shape properties', () => {
    const testShape: ShapeProperties = {
      id: 'test-ellipse',
      type: 'ellipse',
      fill: '#FFFF00',
      opacity: 1
    };

    service.selectShape(testShape);
    service.updateSelectedShape({ fill: '#FF00FF', opacity: 0.5 });

    const updated = service.getSelectedShape();
    expect(updated?.fill).toBe('#FF00FF');
    expect(updated?.opacity).toBe(0.5);
    expect(updated?.id).toBe('test-ellipse'); // Other properties unchanged
    expect(updated?.type).toBe('ellipse');
  });

  it('updateSelectedShape updates only the first shape when multiple are selected', () => {
    const a: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const b: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShapes([a, b]);
    service.updateSelectedShape({ fill: '#00f' });
    expect(service.getSelectedShapes()).toEqual([
      { ...a, fill: '#00f' },
      b
    ]);
  });

  it('patchAllSelected merges updates into every selected shape', () => {
    const a: ShapeProperties = { id: 'a', type: 'rect', fill: '#f00' };
    const b: ShapeProperties = { id: 'b', type: 'circle', fill: '#0f0' };
    service.selectShapes([a, b]);
    service.patchAllSelected({ opacity: 0.4 });
    expect(service.getSelectedShapes()).toEqual([
      { ...a, opacity: 0.4 },
      { ...b, opacity: 0.4 }
    ]);
  });

  it('should not update if no shape is selected', () => {
    service.clearSelection();
    service.updateSelectedShape({ fill: '#FFFFFF' });
    
    expect(service.getSelectedShape()).toBeNull();
  });

  it('should update signal when selection changes (selectedShape is first of selectedShapes)', () => {
    const testShape: ShapeProperties = {
      id: 'signal-test',
      type: 'path',
      fill: '#123456'
    };

    expect(service.selectedShape()).toBeNull();
    expect(service.selectedShapes()).toEqual([]);

    service.selectShape(testShape);

    expect(service.selectedShape()).toEqual(testShape);
    expect(service.selectedShapes()).toHaveLength(1);

    service.clearSelection();
    expect(service.selectedShape()).toBeNull();
    expect(service.selectedShapes()).toEqual([]);
  });
});
