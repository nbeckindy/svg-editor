import type { CanvasAdapterContext } from './canvas-adapter-context';

export type { CanvasAdapterContext, CanvasSvgPoint } from './canvas-adapter-context';

/**
 * Shared adapter-context slice for canvas tool wiring.
 *
 * Registered tools do **not** receive a host with full services — each `*-canvas-tool.ts`
 * declares a narrow `*CanvasToolDeps` getter with only the ports and actions that tool
 * needs (see `.cursor/rules/canvas-tools-ports.mdc`).
 *
 * `CanvasToolHost` remains a named alias for the coordinate / tool-state / document-surface
 * slices reused across port bundles; it intentionally excludes `SvgManipulationService`,
 * `ShapeSelectionService`, and `EditorHistoryService` so tool registration stays on typed
 * deps getters rather than a wide integration surface.
 */
export type CanvasToolHost = CanvasAdapterContext;
