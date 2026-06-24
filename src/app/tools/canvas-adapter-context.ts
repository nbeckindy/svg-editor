import type { EditorTool } from '../services/editor-tool.service';

/** Document-space point on the editor SVG canvas. */
export type CanvasSvgPoint = { readonly x: number; readonly y: number };

/** Client/viewport → editor SVG user-space mapping. */
export interface CanvasAdapterCoordinates {
  clientToEditorSvgPoint(clientX: number, clientY: number): CanvasSvgPoint | null;
}

/** Active tool and change detection for canvas adapters. */
export interface CanvasAdapterToolState {
  markForCheck(): void;
  getCurrentTool(): EditorTool;
  setTool(tool: EditorTool): void;
}

/** DOM hit-test surface shared by tools and orchestrators. */
export interface CanvasAdapterDocumentSurface {
  getMainSvgElement(): SVGSVGElement | null;
  isEditorContentShapeTarget(target: Element | null): boolean;
}

/** True when SVG content is loaded and the canvas view is initialized. */
export interface CanvasAdapterReadiness {
  isCanvasReady(): boolean;
}

/**
 * Coordinate, tool-state, document-surface, and readiness slices shared by `CanvasToolHost`,
 * `PenToolSessionPorts`, pointer/keyboard seams, and `*CanvasToolDeps` getters.
 */
export type CanvasAdapterContext = CanvasAdapterToolState &
  CanvasAdapterCoordinates &
  CanvasAdapterDocumentSurface &
  CanvasAdapterReadiness;
