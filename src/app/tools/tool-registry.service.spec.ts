import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistryService } from './tool-registry.service';
import type { CanvasTool } from './canvas-tool.interface';
import type { CanvasToolHost } from './canvas-tool-host.interface';

function makeTool(toolId: CanvasTool['toolId']): CanvasTool {
  return {
    toolId,
    onActivate: () => {},
    onDeactivate: () => {}
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
      onActivate: (_host: CanvasToolHost) => {}
    };
    registry.register(first);
    registry.register(second);
    expect(registry.get('rect')).toBe(second);
  });
});
