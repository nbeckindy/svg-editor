import { Injectable } from '@angular/core';
import type { CreationGesture } from '../components/svg-canvas/gestures/creation-gesture';
import type { GestureRuntimeContext } from '../components/svg-canvas/gestures/gesture-context';
import { registerCreationCanvasTools } from './creation-canvas-tool';
import { registerPenCanvasTool, type PenCanvasToolDeps } from './pen-canvas-tool';
import { registerSelectorCanvasTools, type SelectorCanvasToolDeps } from './selector-canvas-tool';
import { registerEyedropperCanvasTool, type EyedropperCanvasToolDeps } from './eyedropper-canvas-tool';
import { registerPanCanvasTool, type PanCanvasToolDeps } from './pan-canvas-tool';
import { registerTextCanvasTool, type TextCanvasToolDeps } from './text-canvas-tool';
import { registerZoomCanvasTool, type ZoomCanvasToolDeps } from './zoom-canvas-tool';
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
  private penToolRegistered = false;
  private selectorToolsRegistered = false;
  private viewUtilityToolsRegistered = false;

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

  registerPenTool(getDeps: () => PenCanvasToolDeps): void {
    if (this.penToolRegistered) return;
    registerPenCanvasTool(this.registry, getDeps);
    this.penToolRegistered = true;
  }

  registerSelectorTools(getDeps: () => SelectorCanvasToolDeps): void {
    if (this.selectorToolsRegistered) return;
    registerSelectorCanvasTools(this.registry, getDeps);
    this.selectorToolsRegistered = true;
  }

  registerViewUtilityTools(deps: {
    getZoomDeps: () => ZoomCanvasToolDeps;
    getPanDeps: () => PanCanvasToolDeps;
    getTextDeps: () => TextCanvasToolDeps;
    getEyedropperDeps: () => EyedropperCanvasToolDeps;
  }): void {
    if (this.viewUtilityToolsRegistered) return;
    registerZoomCanvasTool(this.registry, deps.getZoomDeps);
    registerPanCanvasTool(this.registry, deps.getPanDeps);
    registerTextCanvasTool(this.registry, deps.getTextDeps);
    registerEyedropperCanvasTool(this.registry, deps.getEyedropperDeps);
    this.viewUtilityToolsRegistered = true;
  }
}
