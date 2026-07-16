import { describe, it, expect } from 'vitest';
import {
  isDockPanelRelevant,
  pathOpsMultiPathRelevance,
  suggestDockPanelId,
  type DockPanelRelevanceContext
} from './dock-panel-relevance';
import type { DockPanelDescriptor } from './dock-panel-descriptor';

function ctx(overrides: Partial<DockPanelRelevanceContext> = {}): DockPanelRelevanceContext {
  return {
    currentTool: 'selector',
    selectedShapeCount: 0,
    selectedPathCount: 0,
    ...overrides
  };
}

function panel(id: string, order: number, relevantTools?: DockPanelDescriptor['relevantTools']): DockPanelDescriptor {
  return {
    id,
    label: id,
    order,
    availability: 'selection-aware',
    component: class {},
    headerTestId: `dock-section-${id}`,
    areaTestId: `editor-${id}-area`,
    ariaLabel: id,
    relevantTools,
    isRelevantWhen: id === 'pathOps' ? pathOpsMultiPathRelevance : undefined
  };
}

describe('dock panel relevance', () => {
  it('suggests the last matching panel in registration order', () => {
    const panels = [panel('properties', 1), panel('layers', 2), panel('pathOps', 3, ['selector'])];
    expect(suggestDockPanelId(panels, ctx({ selectedPathCount: 2 }))).toBe('pathOps');
    expect(suggestDockPanelId(panels, ctx({ selectedPathCount: 1 }))).toBeNull();
  });

  it('requires relevantTools and isRelevantWhen together', () => {
    const pathOps = panel('pathOps', 7, ['selector']);
    expect(isDockPanelRelevant(pathOps, ctx({ selectedPathCount: 2 }))).toBe(true);
    expect(isDockPanelRelevant(pathOps, ctx({ currentTool: 'pen', selectedPathCount: 2 }))).toBe(false);
    expect(isDockPanelRelevant(pathOps, ctx({ selectedPathCount: 1 }))).toBe(false);
  });
});
