import { describe, it, expect, vi } from 'vitest';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import {
  handleSelectorCanvasClick,
  type SelectorCanvasClickDeps
} from './selector-canvas-click';

function rectProps(id: string): ShapeProperties {
  return { id, type: 'rect', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function groupProps(id: string): ShapeProperties {
  return { id, type: 'g', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 };
}

function makeClickDeps(over: Partial<SelectorCanvasClickDeps> = {}): SelectorCanvasClickDeps {
  return {
    getSvgInstance: () => null,
    getNearestGroupAncestorId: () => null,
    isGroupAClipMaskCarrier: () => false,
    getShapeProperties: (el) => rectProps(el.id),
    getShapePropertiesInSameClipGroup: (el) => [rectProps(el.id)],
    selectShapes: vi.fn(),
    toggleShapeGroupInSelection: vi.fn(),
    clearSelection: vi.fn(),
    clearHighlight: vi.fn(),
    getDrilledIntoGroupId: () => null,
    setDrilledIntoGroupId: vi.fn(),
    consumeSelectionMarqueeJustEnded: () => false,
    shouldSkipEmptyHitSelectionClear: () => false,
    ...over
  };
}

describe('handleSelectorCanvasClick', () => {
  it('consumes click when selection marquee just ended', () => {
    const deps = makeClickDeps({ consumeSelectionMarqueeJustEnded: () => true });
    const selectShapes = vi.spyOn(deps, 'selectShapes');

    const consumed = handleSelectorCanvasClick(
      { target: document.createElement('div') } as unknown as MouseEvent,
      deps
    );

    expect(consumed).toBe(true);
    expect(selectShapes).not.toHaveBeenCalled();
  });

  it('clears selection and highlight on empty hit', () => {
    const deps = makeClickDeps();
    const clearSelection = vi.spyOn(deps, 'clearSelection');
    const clearHighlight = vi.spyOn(deps, 'clearHighlight');
    const setDrilled = vi.spyOn(deps, 'setDrilledIntoGroupId');

    handleSelectorCanvasClick({ target: document.createElement('svg') } as unknown as MouseEvent, deps);

    expect(clearSelection).toHaveBeenCalled();
    expect(clearHighlight).toHaveBeenCalled();
    expect(setDrilled).toHaveBeenCalledWith(null);
  });

  it('skips clearSelection on empty hit when pen-close guard is active', () => {
    const deps = makeClickDeps({ shouldSkipEmptyHitSelectionClear: () => true });
    const clearSelection = vi.spyOn(deps, 'clearSelection');

    handleSelectorCanvasClick({ target: document.createElement('svg') } as unknown as MouseEvent, deps);

    expect(clearSelection).not.toHaveBeenCalled();
  });

  it('selects leaf shape when no group ancestor', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'leaf';
    const selectShapes = vi.fn();
    const deps = makeClickDeps({
      getSvgInstance: () => ({
        findOne: (sel) => (sel === '#leaf' ? (child as unknown as SVGElement) : undefined)
      }),
      getNearestGroupAncestorId: () => null,
      getShapePropertiesInSameClipGroup: () => [rectProps('leaf')],
      selectShapes
    });

    handleSelectorCanvasClick({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).toHaveBeenCalledWith([rectProps('leaf')]);
  });

  it('selects group ancestor instead of leaf when not drilled in', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.id = 'grp';
    const selectShapes = vi.fn();
    const setDrilled = vi.fn();
    const deps = makeClickDeps({
      getSvgInstance: () => ({
        findOne: (sel) => {
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

    handleSelectorCanvasClick({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).toHaveBeenCalledWith([groupProps('grp')]);
    expect(setDrilled).toHaveBeenCalledWith(null);
  });

  it('selects drilled-in child when drilledIntoGroupId matches ancestor', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const selectShapes = vi.fn();
    const deps = makeClickDeps({
      getSvgInstance: () => ({
        findOne: (sel) => (sel === '#child' ? (child as unknown as SVGElement) : undefined)
      }),
      getNearestGroupAncestorId: () => 'grp',
      getDrilledIntoGroupId: () => 'grp',
      getShapePropertiesInSameClipGroup: () => [rectProps('child')],
      selectShapes
    });

    handleSelectorCanvasClick({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).toHaveBeenCalledWith([rectProps('child')]);
  });

  it('bypasses clip-carrier group and selects leaf', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const selectShapes = vi.fn();
    const deps = makeClickDeps({
      getSvgInstance: () => ({
        findOne: (sel) => (sel === '#child' ? (child as unknown as SVGElement) : undefined)
      }),
      getNearestGroupAncestorId: () => 'clip-g',
      isGroupAClipMaskCarrier: (id) => id === 'clip-g',
      getShapePropertiesInSameClipGroup: () => [rectProps('child')],
      selectShapes
    });

    handleSelectorCanvasClick({ target: child } as unknown as MouseEvent, deps);

    expect(selectShapes).toHaveBeenCalledWith([rectProps('child')]);
  });

  it('toggles selection with shift modifier', () => {
    const child = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    child.id = 'child';
    const toggle = vi.fn();
    const deps = makeClickDeps({
      getSvgInstance: () => ({
        findOne: (sel) => (sel === '#child' ? (child as unknown as SVGElement) : undefined)
      }),
      getShapePropertiesInSameClipGroup: () => [rectProps('child')],
      toggleShapeGroupInSelection: toggle
    });

    handleSelectorCanvasClick(
      { target: child, shiftKey: true } as unknown as MouseEvent,
      deps
    );

    expect(toggle).toHaveBeenCalledWith([rectProps('child')]);
  });
});
