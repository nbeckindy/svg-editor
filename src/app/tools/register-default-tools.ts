import type { CanvasBoundToolRegistrar } from './canvas-bound-tool-registrar.service';
import type { ToolRegistryService } from './tool-registry.service';

/** App-startup hook: attach the tool registry to the canvas-bound registrar. */
export function registerDefaultTools(
  registry: ToolRegistryService,
  canvasBoundRegistrar: CanvasBoundToolRegistrar
): void {
  canvasBoundRegistrar.attach(registry);
}
