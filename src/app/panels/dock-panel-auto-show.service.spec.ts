import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';
import { DockPanelAutoShowService } from './dock-panel-auto-show.service';
import { DockPanelRegistryService } from './dock-panel-registry.service';
import { EditorToolService } from '../services/editor-tool.service';
import { ShapeSelectionService } from '../services/shape-selection.service';
import type { DockPanelDescriptor } from './dock-panel-descriptor';
import { pathOpsMultiPathRelevance } from './dock-panel-relevance';

class StubPanelComponent {}

function makeDescriptor(
  id: string,
  order: number,
  relevantTools?: DockPanelDescriptor['relevantTools'],
  isRelevantWhen?: DockPanelDescriptor['isRelevantWhen']
): DockPanelDescriptor {
  return {
    id,
    label: id,
    order,
    availability: 'selection-aware',
    component: StubPanelComponent as Type<unknown>,
    headerTestId: `dock-section-${id}`,
    areaTestId: `editor-${id}-area`,
    ariaLabel: id,
    relevantTools,
    isRelevantWhen
  };
}

describe('DockPanelAutoShowService', () => {
  let service: DockPanelAutoShowService;
  let registry: DockPanelRegistryService;
  let editorTool: EditorToolService;
  let shapeSelection: ShapeSelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DockPanelAutoShowService, DockPanelRegistryService, EditorToolService, ShapeSelectionService]
    });
    service = TestBed.inject(DockPanelAutoShowService);
    registry = TestBed.inject(DockPanelRegistryService);
    editorTool = TestBed.inject(EditorToolService);
    shapeSelection = TestBed.inject(ShapeSelectionService);

    registry.register(makeDescriptor('properties', 1));
    registry.register(makeDescriptor('layers', 2));
    registry.register(makeDescriptor('pathOps', 3, ['selector'], pathOpsMultiPathRelevance));
  });

  it('suggests path ops when selector has two paths selected', () => {
    editorTool.setTool('selector');
    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);

    expect(service.suggestedPanelId()).toBe('pathOps');
    expect(service.shouldAutoExpand('pathOps', false)).toBe(true);
  });

  it('does not suggest path ops for a single path', () => {
    editorTool.setTool('selector');
    shapeSelection.selectShape({
      id: 'p1',
      type: 'path',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });

    expect(service.suggestedPanelId()).toBeNull();
    expect(service.shouldAutoExpand(null, false)).toBe(false);
  });

  it('does not suggest path ops outside selector tool', () => {
    editorTool.setTool('pen');
    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);

    expect(service.suggestedPanelId()).toBeNull();
  });

  it('preserves manual section collapse until tool or selection changes', () => {
    editorTool.setTool('selector');
    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);

    service.recordManualCollapse('pathOps');
    expect(service.shouldAutoExpand('pathOps', false)).toBe(false);

    shapeSelection.selectShapes([
      { id: 'p1', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p2', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 },
      { id: 'p3', type: 'path', fill: '#000', stroke: undefined, strokeWidth: 0, opacity: 1 }
    ]);

    expect(service.shouldAutoExpand('pathOps', false)).toBe(true);
  });

  it('does not auto-expand when the section is already expanded', () => {
    expect(service.shouldAutoExpand('pathOps', true)).toBe(false);
  });
});
