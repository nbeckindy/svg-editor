import type { CanvasAdapterContext } from '../../../tools/canvas-adapter-context';
import type { EditorCommand } from '../../../models/editor-command';
import type { ShapeProperties } from '../../../models/shape-properties.interface';
import type { Svg } from '@svgdotjs/svg.js';
import type { PathNodeEditCommandBridgeService } from '../../../services/path-node-edit-command-bridge.service';

/** History seam for {@link PathNodeEditSession}. */
export interface PathNodeEditSessionHistoryPort {
  pushAndExecute(command: EditorCommand): void;
}

/** Selection seam for {@link PathNodeEditSession}. */
export interface PathNodeEditSessionShapeSelectionPort {
  selectShape(shape: ShapeProperties): void;
}

/** SVG seam for path node editing, overlay mapping, and handle-link metadata. */
export interface PathNodeEditSessionSvgPort {
  getSVGInstance(): Svg | null;
  isElementOrAncestorLocked(shapeId: string): boolean;
  getPathNodeHandleLinkRaw(pathId: string): string | null;
  setPathNodeHandleLinkRaw(pathId: string, raw: string | null): void;
  mapPathLocalToRootUser(pathId: string, lx: number, ly: number): { x: number; y: number };
  mapRootUserToPathLocal(pathId: string, rx: number, ry: number): { x: number; y: number } | null;
  updatePathData(pathId: string, d: string): void;
  getShapeBBox(shapeId: string): { x: number; y: number; width: number; height: number } | null;
  getShapeProperties(el: unknown): ShapeProperties;
}

/**
 * Narrow seam for {@link PathNodeEditSession}: DOM/view mapping, **History** / **Selection** / **Live tree**
 * effects, and path-node **Chrome** hooks — implemented by the **Canvas adapter**.
 */
export interface PathNodeEditSessionPorts extends CanvasAdapterContext {
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  svgManipulation: PathNodeEditSessionSvgPort;
  shapeSelection: PathNodeEditSessionShapeSelectionPort;
  editorHistory: PathNodeEditSessionHistoryPort;
  pathNodeEditBridge: PathNodeEditCommandBridgeService;
  getDrilledIntoGroupId(): string | null;
  setDrilledIntoGroupId(id: string | null): void;
  setLastBbox(bbox: { x: number; y: number; width: number; height: number } | null): void;
  clearHighlightRectCache(): void;
}
