import type { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import { registerDefaultToolDescriptors } from './register-default-tool-descriptors';
import type { ToolRegistryService } from './tool-registry.service';

/** App-startup hook: register tool UI descriptors and attach the canvas-bound registrar. */
export function registerDefaultTools(
  registry: ToolRegistryService,
  canvasBoundRegistrar: CanvasBoundToolRegistrar
): void {
  registerDefaultToolDescriptors(registry);
  canvasBoundRegistrar.attach(registry);
}
