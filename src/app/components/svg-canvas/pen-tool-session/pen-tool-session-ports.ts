import type { SvgManipulationService } from '../../../services/svg-manipulation.service';
import type { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { EditorHistoryService } from '../../../services/editor-history.service';
import type { EditorTool } from '../../../services/editor-tool.service';

export type PenDiscardReason = 'tool switch' | 'document replace/load';

/**
 * Narrow seam for {@link PenToolSession}: DOM/view mapping, **History** / **Selection** / **Live tree**
 * effects, and pen-specific **Chrome** hooks — implemented by the **Canvas adapter**.
 */
export interface PenToolSessionPorts {
  markForCheck(): void;
  getCurrentTool(): EditorTool;
  isPenAltCurveMode(): boolean;
  setPenAltCurveMode(enabled: boolean): void;
  setTool(tool: EditorTool): void;
  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null;
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parseOverlayViewBox(): { vbMinX: number; vbMinY: number; vbW: number; vbH: number } | null;
  getMainSvgElement(): SVGSVGElement | null;
  /** `window.confirm` for discarding in-progress pen path. */
  confirmDiscardInProgressPath(reason: PenDiscardReason): boolean;
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  penBackspaceShortcutShouldDefer(): boolean;
  setLastBbox(bbox: { x: number; y: number; width: number; height: number } | null): void;
  clearHighlightRectCache(): void;
  isEditorContentShapeTarget(target: Element | null): boolean;
  getPenPathInsertToleranceSvg(): number;
  getPathDForId(pathId: string): string | null;
  /** Apply committed insert edit (history, selection, overlays). */
  commitPenInsertOnExistingPath(pathId: string, oldD: string, newD: string, insertedMoveSegIndex?: number): void;
  clearPenPostInsertAnchorOverlay(): void;
  /** Idle pen: user starts a new stroke on empty canvas — clear prior selection so path topology follows. */
  clearSelectionForPenBackgroundStroke(): void;
  /** True when SVG content is present and the canvas view is ready for pen input. */
  isCanvasReadyForPenInput(): boolean;
}
