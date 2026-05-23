import { ChangeDetectorRef, ElementRef, Signal } from '@angular/core';
import { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorHistoryService } from '../../../services/editor-history.service';
import { SnapCandidateShape, SnapService } from '../../../services/snap.service';

/** Overlay + coordinate mapping for pointer-driven editor chrome. */
export interface PointerOverlayPort {
  cdr: ChangeDetectorRef;
  highlightOverlayContainer: Signal<ElementRef<HTMLElement> | undefined>;
  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null;
  svgBboxToOverlayPixels(bbox: Rect): Rect;
  invalidateHighlightCache(): void;
  setLastBbox(bbox: Rect | null): void;
}

/** Live tree + selection + undo stack (gesture commits). */
export interface DocumentSelectionPort {
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
}

/**
 * **Document** + **Selection** + **History** for translate / resize / rotate / skew gestures only.
 * Today mirrors {@link DocumentSelectionPort}; later refactors narrow this **interface** while
 * creation and marquee keep using `doc`.
 */
export interface TransformGestureDocPort {
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
}

/** Snap policy for pointer gestures. */
export interface SnapSessionPort {
  snap: SnapService;
  getSmartGuideCandidates(): SnapCandidateShape[];
  isSnapTemporarilyDisabled(): boolean;
}

/** Stable seam passed into gesture modules (pointer vs document vs snap). */
export interface GestureRuntimeContext {
  pointer: PointerOverlayPort;
  doc: DocumentSelectionPort;
  /** Drag / resize / rotate / skew: use this instead of {@link DocumentSelectionPort} on `doc`. */
  transformDoc: TransformGestureDocPort;
  snap: SnapSessionPort;
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export type GhostPreviewFragment = {
  outerGroup: SvgJsElement;
  nestedSvg: Svg;
  worldToUnion: SvgJsElement;
};
