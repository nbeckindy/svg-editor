import { describe, it, expect } from 'vitest';
import { registerDefaultTools } from './register-default-tools';
import { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import { ToolRegistryService } from './tool-registry.service';
import { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';

describe('registerDefaultTools', () => {
  it('attaches registry to canvas-bound registrar for deferred tool binding', () => {
    const registry = new ToolRegistryService();
    const registrar = new CanvasBoundToolRegistrar();
    registerDefaultTools(registry, registrar);

    const creation = new CreationGesture();
    registrar.registerCreationTools(creation, () => ({
      pointer: {} as never,
      doc: {} as never,
      transformDoc: {} as never,
      snap: {} as never
    }), () => true);

    expect(registry.has('rect')).toBe(true);
  });
});
