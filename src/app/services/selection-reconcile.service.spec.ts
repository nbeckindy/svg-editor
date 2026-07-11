import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { SelectionReconcileService } from './selection-reconcile.service';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';
import type { ShapeProperties } from '../models/shape-properties.interface';

describe('SelectionReconcileService', () => {
  let service: SelectionReconcileService;
  const selectedShapesSignal = signal<ShapeProperties[]>([]);

  const shapeSelectionMock = {
    getSelectedShapes: () => selectedShapesSignal(),
    selectShapes: vi.fn((next: ShapeProperties[]) => selectedShapesSignal.set(next))
  };

  const svgMock = {
    getSVGInstance: vi.fn(),
    getShapeProperties: vi.fn(),
    getUnionBBox: vi.fn()
  };

  beforeEach(() => {
    selectedShapesSignal.set([]);
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        SelectionReconcileService,
        { provide: ShapeSelectionService, useValue: shapeSelectionMock },
        { provide: SvgManipulationService, useValue: svgMock }
      ]
    });

    service = TestBed.inject(SelectionReconcileService);
  });

  it('returns null when there is no SVG instance', () => {
    selectedShapesSignal.set([{ id: 's1', type: 'rect', fill: '#000' }]);
    svgMock.getSVGInstance.mockReturnValue(null);

    expect(service.reconcileFromLiveTree()).toBeNull();
    expect(shapeSelectionMock.selectShapes).not.toHaveBeenCalled();
  });

  it('returns null when selection is empty', () => {
    svgMock.getSVGInstance.mockReturnValue({ findOne: vi.fn() });

    expect(service.reconcileFromLiveTree()).toBeNull();
    expect(shapeSelectionMock.selectShapes).not.toHaveBeenCalled();
  });

  it('refreshes selected shape properties from the live DOM', () => {
    const stale: ShapeProperties = {
      id: 'r1',
      type: 'rect',
      fill: '#000',
      stroke: '#111',
      strokeWidth: 1
    };
    selectedShapesSignal.set([stale]);

    const domEl = { node: {} };
    const svg = { findOne: vi.fn(() => domEl) };
    svgMock.getSVGInstance.mockReturnValue(svg);
    const refreshed: ShapeProperties = {
      id: 'r1',
      type: 'rect',
      fill: '#f00',
      stroke: '#111',
      strokeWidth: 2
    };
    svgMock.getShapeProperties.mockReturnValue(refreshed);
    svgMock.getUnionBBox.mockReturnValue({ x: 0, y: 0, width: 10, height: 10 });

    const result = service.reconcileFromLiveTree();
    expect(svg.findOne).toHaveBeenCalledWith('#r1');
    expect(shapeSelectionMock.selectShapes).toHaveBeenCalledWith([refreshed]);
    expect(result).toEqual([refreshed]);
    expect(service.reconciledAt()).toBe(1);
    expect(svgMock.getUnionBBox).toHaveBeenCalledWith(['r1']);
  });

  it('keeps stale snapshot when DOM node is missing', () => {
    const stale: ShapeProperties = { id: 'gone', type: 'rect', fill: '#000' };
    selectedShapesSignal.set([stale]);
    svgMock.getSVGInstance.mockReturnValue({ findOne: vi.fn(() => undefined) });
    svgMock.getUnionBBox.mockReturnValue(null);

    const result = service.reconcileFromLiveTree();
    expect(shapeSelectionMock.selectShapes).toHaveBeenCalledWith([stale]);
    expect(result).toEqual([stale]);
  });

  it('invokes onUnionBboxUpdated with union bbox hint', () => {
    selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#000' }]);
    const bbox = { x: 1, y: 2, width: 3, height: 4 };
    svgMock.getSVGInstance.mockReturnValue({ findOne: vi.fn(() => ({ node: {} })) });
    svgMock.getShapeProperties.mockReturnValue({ id: 'r1', type: 'rect', fill: '#000' });
    svgMock.getUnionBBox.mockReturnValue(bbox);
    const onUnionBboxUpdated = vi.fn();

    service.reconcileFromLiveTree({ onUnionBboxUpdated });
    expect(onUnionBboxUpdated).toHaveBeenCalledWith(bbox);
  });

  it('onHistoryRevision runs side effects around microtask reconcile', async () => {
    selectedShapesSignal.set([{ id: 'r1', type: 'rect', fill: '#000' }]);
    svgMock.getSVGInstance.mockReturnValue({ findOne: vi.fn(() => ({ node: {} })) });
    svgMock.getShapeProperties.mockReturnValue({ id: 'r1', type: 'rect', fill: '#0f0' });
    svgMock.getUnionBBox.mockReturnValue(null);

    const beforeReconcile = vi.fn();
    const afterReconcile = vi.fn();
    const onUnionBboxUpdated = vi.fn();

    service.onHistoryRevision({ beforeReconcile, afterReconcile, onUnionBboxUpdated });
    expect(beforeReconcile).toHaveBeenCalled();
    expect(shapeSelectionMock.selectShapes).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(shapeSelectionMock.selectShapes).toHaveBeenCalled();
    expect(onUnionBboxUpdated).toHaveBeenCalledWith(null);
    expect(afterReconcile).toHaveBeenCalled();
  });
});
