import { describe, it, expect } from 'vitest';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import { registerDefaultTools } from './register-default-tools';
import { ToolRegistryService } from './tool-registry.service';

describe('registerDefaultTools', () => {
  it('attaches registry to canvas-bound registrar and registers tool descriptors', () => {
    const registry = new ToolRegistryService();
    const registrar = new CanvasBoundToolRegistrar(registry);
    registerDefaultTools(registry, registrar);

    expect(registry.has('rect')).toBe(false);
    expect(registry.getDescriptor('rect')).toBeDefined();
  });

  it('still binds creation tools through the registrar', () => {
    const registry = new ToolRegistryService();
    const registrar = new CanvasBoundToolRegistrar(registry);
    registerDefaultTools(registry, registrar);

    const creation = new CreationGesture();
    registrar.registerCreationTools(
      creation,
      () => ({
        pointer: {} as never,
        doc: {} as never,
        transformDoc: {} as never,
        snap: {} as never
      }),
      () => true
    );

    expect(registry.has('rect')).toBe(true);
  });
});
