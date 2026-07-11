import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistryService } from './tool-registry.service';
import type { ToolDescriptor } from './tool-descriptor';
import type { CanvasTool } from './canvas-tool.interface';

function makeTool(toolId: CanvasTool['toolId']): CanvasTool {
  return {
    toolId,
    onActivate: () => {},
    onDeactivate: () => {}
  };
}

import { registerDefaultToolDescriptors } from './register-default-tool-descriptors';

function makeDescriptor(id: ToolDescriptor['id'], over: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    id,
    label: id,
    title: id,
    icon: 'cursor-default-outline',
    stripTestId: `tool-${id}`,
    ariaLabel: id,
    stripGroup: 'selection-view',
    stripGroupLabel: 'Selection and view',
    order: 0,
    interactionKind: 'navigation',
    ...over
  };
}

describe('ToolRegistryService', () => {
  let registry: ToolRegistryService;

  beforeEach(() => {
    registry = new ToolRegistryService();
  });

  it('registers and retrieves tools by EditorTool id', () => {
    const rectTool = makeTool('rect');
    registry.register(rectTool);
    expect(registry.get('rect')).toBe(rectTool);
    expect(registry.has('rect')).toBe(true);
  });

  it('returns undefined for unregistered tools', () => {
    expect(registry.get('ellipse')).toBeUndefined();
    expect(registry.has('ellipse')).toBe(false);
  });

  it('unregisters tools', () => {
    registry.register(makeTool('line'));
    registry.unregister('line');
    expect(registry.get('line')).toBeUndefined();
  });

  it('replaces a tool when registering the same id again', () => {
    const first = makeTool('rect');
    const second: CanvasTool = {
      ...makeTool('rect'),
      onActivate: () => {}
    };
    registry.register(first);
    registry.register(second);
    expect(registry.get('rect')).toBe(second);
  });

  it('exposes strip groups sorted by order', () => {
    registerDefaultToolDescriptors(registry);
    const groups = registry.stripGroups();
    expect(groups.length).toBe(2);
    expect(groups[0]?.id).toBe('selection-view');
    expect(groups[0]?.descriptors.length).toBe(5);
    expect(groups[1]?.id).toBe('creation');
    expect(groups[1]?.descriptors.map((d) => d.id)).toEqual([
      'rect',
      'ellipse',
      'line',
      'text',
      'pen'
    ]);
  });

  it('classifies tools via descriptor metadata', () => {
    registry.registerDescriptor(makeDescriptor('rect', { interactionKind: 'creation' }));
    registry.registerDescriptor(
      makeDescriptor('selector', { selectorInteraction: true, keepsPathNodeTopology: true })
    );
    expect(registry.isCreationTool('rect')).toBe(true);
    expect(registry.isSelectorInteractionTool('selector')).toBe(true);
    expect(registry.keepsPathNodeTopology('selector')).toBe(true);
  });
});
