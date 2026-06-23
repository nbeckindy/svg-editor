import { Injectable } from '@angular/core';
import type { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import { registerCreationCanvasTools } from './creation-canvas-tool';
import { ToolRegistryService } from './tool-registry.service';

/**
 * Defers canvas-bound {@link CanvasTool} registration until the pointer stack exists.
 * Wired at app startup via {@link registerDefaultTools}; bound when the canvas adapter initializes.
 */
@Injectable({
  providedIn: 'root'
})
export class CanvasBoundToolRegistrar {
  private registry: ToolRegistryService;
  private creationToolsRegistered = false;

  constructor(registry: ToolRegistryService) {
    this.registry = registry;
  }

  /** Called from app startup; keeps the dock-panel registration pattern explicit. */
  attach(registry: ToolRegistryService): void {
    this.registry = registry;
  }

  registerCreationTools(
    creation: CreationGesture,
    getRuntime: () => GestureRuntimeContext,
    isCanvasReady: () => boolean
  ): void {
    if (this.creationToolsRegistered) return;
    registerCreationCanvasTools(this.registry, creation, getRuntime, isCanvasReady);
    this.creationToolsRegistered = true;
  }
}
