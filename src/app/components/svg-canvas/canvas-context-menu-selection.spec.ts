import { describe, it, expect, vi } from 'vitest';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import {
  prepareCanvasContextMenuSelection,
  type CanvasContextMenuSelectionDeps
} from './canvas-context-menu-selection';

function rectProps(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function groupProps(id: string): ShapeProperties {
  return { id, type: 'g', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function makeDeps(over: Partial<CanvasContextMenuSelectionDeps> = {}): CanvasContextMenuSelectionDeps {
  return {
    getSvgInstance: () => null,
    getNearestGroupAncestorId: () => null,
    isGroupAClipMaskCarrier: () => false,
    getShapeProperties: (el) => rectProps(el.id),
    getShapePropertiesInSameClipGroup: (el) => [rectProps(el.id)],
    selectShapes: vi.fn(),
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    getSelectedShapeIds: () => [],
    ...over
  };
}

describe('prepareCanvasContextMenuSelection', () => {
  it('returns hitShape false on empty hit without changing selection', () => {
    const deps = makeDeps();
    const selectShapes = vi.spyOn(deps, 'selectShapes');

    const result = prepareCanvasContextMenuSelection(
      { target: document.createElement('svg') } as unknown as MouseEvent,
      deps
    );

    expect(result.hitShape).toBe(false);
    expect(selectShapes).not.toHaveBeenCalled();
  });

  it('selects unselected shape on shape hit', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const selectShapes = vi.fn();
    const deps = makeDeps({
      getSvgInstance: () => ({
        findOne: (sel: string) => (sel === '#child' ? (child as unknown as SVGElement) : undefined)
      }),
      getShapePropertiesInSameClipGroup: () => [rectProps('child')],
      selectShapes
    });

    const result = prepareCanvasContextMenuSelection(
      { target: child } as unknown as MouseEvent,
      deps
    );

    expect(result.hitShape).toBe(true);
    expect(selectShapes).toHaveBeenCalledWith([rectProps('child')]);
  });

  it('preserves multi-selection when right-clicking an already selected shape', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const selectShapes = vi.fn();
    const deps = makeDeps({
      getSvgInstance: () => ({
        findOne: (sel: string) => (sel === '#child' ? (child as unknown as SVGElement) : undefined)
      }),
      getShapePropertiesInSameClipGroup: () => [rectProps('child')],
      getSelectedShapeIds: () => ['child', 'other'],
      selectShapes
    });

    prepareCanvasContextMenuSelection({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).not.toHaveBeenCalled();
  });

  it('preserves multi-selection when right-clicking a child of a selected group', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const selectShapes = vi.fn();
    const deps = makeDeps({
      getSvgInstance: () => ({
        findOne: (sel: string) => {
          if (sel === '#child') return child as unknown as SVGElement;
          if (sel === '#grp') return { id: 'grp' } as unknown as SVGElement;
          return undefined;
        }
      }),
      getNearestGroupAncestorId: () => 'grp',
      getShapeProperties: () => groupProps('grp'),
      getSelectedShapeIds: () => ['grp'],
      selectShapes
    });

    prepareCanvasContextMenuSelection({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).not.toHaveBeenCalled();
  });

  it('selects group ancestor when not drilled in', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.id = 'grp';
    const selectShapes = vi.fn();
    const setDrilled = vi.fn();
    const deps = makeDeps({
      getSvgInstance: () => ({
        findOne: (sel: string) => {
          if (sel === '#child') return child as unknown as SVGElement;
          if (sel === '#grp') return group as unknown as SVGElement;
          return undefined;
        }
      }),
      getNearestGroupAncestorId: () => 'grp',
      getShapeProperties: () => groupProps('grp'),
      selectShapes,
      setDrilledIntoGroupId: setDrilled
    });

    prepareCanvasContextMenuSelection({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).toHaveBeenCalledWith([groupProps('grp')]);
    expect(setDrilled).toHaveBeenCalledWith(null);
  });
});
