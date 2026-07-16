import { describe, it, expect, beforeEach } from 'vitest';
import { Type } from '@angular/core';
import { DockPanelRegistryService } from './dock-panel-registry.service';
import type { DockPanelDescriptor } from './dock-panel-descriptor';

class StubPanelComponent {}

function makeDescriptor(id: string, order: number): DockPanelDescriptor {
  return {
    id,
    label: id,
    order,
    availability: 'always-available',
    component: StubPanelComponent as Type<unknown>,
    headerTestId: `dock-section-${id}`,
    areaTestId: `editor-${id}-area`,
    ariaLabel: id
  };
}

describe('DockPanelRegistryService', () => {
  let registry: DockPanelRegistryService;

  beforeEach(() => {
    registry = new DockPanelRegistryService();
  });

  it('registers panels and exposes them via panels signal sorted by order', () => {
    registry.register(makeDescriptor('layers', 6));
    registry.register(makeDescriptor('properties', 2));
    expect(registry.panels()).toHaveLength(2);
    expect(registry.panels().map((p) => p.id)).toEqual(['properties', 'layers']);
    expect(registry.get('properties')?.label).toBe('properties');
  });

  it('replaces a panel when registering the same id again', () => {
    registry.register(makeDescriptor('layers', 1));
    registry.register({ ...makeDescriptor('layers', 1), label: 'Layers panel' });
    expect(registry.panels()).toHaveLength(1);
    expect(registry.get('layers')?.label).toBe('Layers panel');
  });

  it('unregisters panels', () => {
    registry.register(makeDescriptor('pathOps', 7));
    registry.unregister('pathOps');
    expect(registry.has('pathOps')).toBe(false);
    expect(registry.panels()).toHaveLength(0);
  });

  it('returns default panel id from first ordered panel', () => {
    expect(registry.getDefaultPanelId()).toBe('properties');
    registry.register(makeDescriptor('layers', 1));
    expect(registry.getDefaultPanelId()).toBe('layers');
  });
});
