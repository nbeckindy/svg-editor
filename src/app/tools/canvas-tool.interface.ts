import type { Type } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { CanvasSvgPoint, CanvasToolHost } from './canvas-tool-host.interface';

/**
 * Contract for a canvas tool registered in the tool registry.
 * Optional input handlers return `true` when the event is consumed.
 */
export interface CanvasTool {
  readonly toolId: EditorTool;

  onActivate(host: CanvasToolHost): void;
  onDeactivate(): void;

  onPointerDown?(event: PointerEvent, svgPoint: CanvasSvgPoint): boolean;
  onPointerMove?(event: PointerEvent, svgPoint: CanvasSvgPoint): void;
  onPointerUp?(event: PointerEvent, svgPoint: CanvasSvgPoint): void;
  onClick?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean;
  onKeyDown?(event: KeyboardEvent): boolean;

  /** Optional component for tool-specific context bar chrome. */
  readonly contextBarComponent?: Type<unknown>;
  /** Optional component for tool-specific right-dock inspector UI. */
  readonly inspectorComponent?: Type<unknown>;
}
