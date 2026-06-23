import { describe, it, expect, beforeEach } from 'vitest';
import { Type } from '@angular/core';
import { DockPanelRegistryService } from './dock-panel-registry.service';
import type { DockPanelDescriptor } from './dock-panel-descriptor';

class StubPanelComponent {}

function makeDescriptor(id: string): DockPanelDescriptor {
  return {
    id,
    label: id,
    component: StubPanelComponent as Type<unknown>,
    tabTestId: `dock-tab-${id}`,
    areaTestId: `editor-${id}-area`,
    ariaLabel: id
  };
}

describe('DockPanelRegistryService', () => {
  let registry: DockPanelRegistryService;

  beforeEach(() => {
    registry = new DockPanelRegistryService();
  });

  it('registers panels and exposes them via panels signal', () => {
    registry.register(makeDescriptor('properties'));
    registry.register(makeDescriptor('layers'));
    expect(registry.panels()).toHaveLength(2);
    expect(registry.get('properties')?.label).toBe('properties');
  });

  it('replaces a panel when registering the same id again', () => {
    registry.register(makeDescriptor('layers'));
    registry.register({ ...makeDescriptor('layers'), label: 'Layers panel' });
    expect(registry.panels()).toHaveLength(1);
    expect(registry.get('layers')?.label).toBe('Layers panel');
  });

  it('unregisters panels', () => {
    registry.register(makeDescriptor('pathOps'));
    registry.unregister('pathOps');
    expect(registry.has('pathOps')).toBe(false);
    expect(registry.panels()).toHaveLength(0);
  });

  it('returns default panel id from first registration order', () => {
    expect(registry.getDefaultPanelId()).toBe('properties');
    registry.register(makeDescriptor('layers'));
    expect(registry.getDefaultPanelId()).toBe('layers');
  });
});
