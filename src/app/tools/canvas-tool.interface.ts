import type { Type } from '@angular/core';
import type { EditorTool } from '../services/editor-tool.service';
import type { CanvasSvgPoint } from './canvas-adapter-context';

/**
 * Contract for a canvas tool registered in the tool registry.
 * Optional input handlers return `true` when the event is consumed.
 */
export interface CanvasTool {
  readonly toolId: EditorTool;

  onActivate?(): void;
  onDeactivate?(): void;

  onPointerDown?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean;
  /** Return `false` to allow router fall-through (e.g. idle pen hover cursor). */
  onPointerMove?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean | void;
  /** Return `false` when the tool did not handle the event. */
  onPointerUp?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean | void;
  onClick?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean;
  onDoubleClick?(event: MouseEvent, svgPoint: CanvasSvgPoint): boolean | void;
  onKeyDown?(event: KeyboardEvent): boolean;

  /** Optional component for tool-specific context bar chrome. */
  readonly contextBarComponent?: Type<unknown>;
  /** Optional component for tool-specific right-dock inspector UI. */
  readonly inspectorComponent?: Type<unknown>;
}
