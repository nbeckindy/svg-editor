import { TestBed } from '@angular/core/testing';
import { ShapeSelectionService } from './shape-selection.service';
import { ShapeProperties } from '../models/shape-properties.interface';

describe('ShapeSelectionService', () => {
  let service: ShapeSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShapeSelectionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with no selection', () => {
    expect(service.getSelectedShape()).toBeNull();
  });

  it('should select a shape', () => {
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

    service.clearSelection();
    expect(service.getSelectedShape()).toBeNull();
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

  it('should not update if no shape is selected', () => {
    service.clearSelection();
    service.updateSelectedShape({ fill: '#FFFFFF' });
    
    expect(service.getSelectedShape()).toBeNull();
  });

  it('should emit updates through observable', () => {
    const testShape: ShapeProperties = {
      id: 'observable-test',
      type: 'path',
      fill: '#123456'
    };

    const emissions: (ShapeProperties | null)[] = [];
    const subscription = service.selectedShape$.subscribe(shape => {
      emissions.push(shape);
    });

    service.selectShape(testShape);
    
    expect(emissions.length).toBe(2); // Initial null + new selection
    expect(emissions[0]).toBeNull();
    expect(emissions[1]).toEqual(testShape);
    
    subscription.unsubscribe();
  });
});
