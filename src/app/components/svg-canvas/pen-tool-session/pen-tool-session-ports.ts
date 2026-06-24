import type { CanvasAdapterContext } from '../../../tools/canvas-adapter-context';
import type { PenToolSessionPathNodeOverlayPort } from './pen-tool-session-path-node-overlay.port';
import type {
  PenToolSessionHistoryPort,
  PenToolSessionShapeSelectionPort,
  PenToolSessionSvgPort
} from './pen-tool-session-svg.port';

export type PenDiscardReason = 'tool switch' | 'document replace/load';

/**
 * Narrow seam for {@link PenToolSession}: DOM/view mapping, **History** / **Selection** / **Live tree**
 * effects, and pen-specific **Chrome** hooks — implemented by the **Canvas adapter**.
 */
export interface PenToolSessionPorts extends CanvasAdapterContext {
  pathNodeOverlay: PenToolSessionPathNodeOverlayPort;
  isPenAltCurveMode(): boolean;
  setPenAltCurveMode(enabled: boolean): void;
  svgBboxToOverlayPixels(bbox: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parseOverlayViewBox(): { vbMinX: number; vbMinY: number; vbW: number; vbH: number } | null;
  /** `window.confirm` for discarding in-progress pen path. */
  confirmDiscardInProgressPath(reason: PenDiscardReason): boolean;
  svgManipulation: PenToolSessionSvgPort;
  shapeSelection: PenToolSessionShapeSelectionPort;
  editorHistory: PenToolSessionHistoryPort;
  penBackspaceShortcutShouldDefer(): boolean;
  setLastBbox(bbox: { x: number; y: number; width: number; height: number } | null): void;
  clearHighlightRectCache(): void;
  getPenPathInsertToleranceSvg(): number;
  getPathDForId(pathId: string): string | null;
  /** Apply committed insert edit (history, selection, overlays). */
  commitPenInsertOnExistingPath(pathId: string, oldD: string, newD: string, insertedMoveSegIndex?: number): void;
  clearPenPostInsertAnchorOverlay(): void;
  /** Idle pen: user starts a new stroke on empty canvas — clear prior selection so path topology follows. */
  clearSelectionForPenBackgroundStroke(): void;
  /**
   * After pen closes into `node-edit-selector`, the gesture still delivers a primary `click` that
   * often targets the root `<svg>` (no `id`); the canvas treats that as an empty hit and clears
   * selection and would exit path-node edit. Call once when committing a closed path so both are
   * suppressed briefly.
   */
  armPenClosePostNodeEditEmptyClickSelectionGuard(): void;
}
