import { ChangeDetectorRef, ElementRef, Signal } from '@angular/core';
import { Svg, Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorHistoryService } from '../../../services/editor-history.service';
import { CanvasViewService } from '../../../services/canvas-view.service';

export interface GestureContext {
  svgManipulation: SvgManipulationService;
  shapeSelection: ShapeSelectionService;
  editorHistory: EditorHistoryService;
  canvasView: CanvasViewService;
  cdr: ChangeDetectorRef;
  svgContainer: Signal<ElementRef<HTMLElement> | undefined>;
  zoomWrapper: Signal<ElementRef<HTMLElement> | undefined>;
  highlightOverlayContainer: Signal<ElementRef<HTMLElement> | undefined>;
  overlayViewBox: string;

  clientToEditorSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null;
  svgBboxToOverlayPixels(bbox: Rect): Rect;
  invalidateHighlightCache(): void;
  setLastBbox(bbox: Rect | null): void;
}

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export type GhostPreviewFragment = {
  outerGroup: SvgJsElement;
  nestedSvg: Svg;
  worldToUnion: SvgJsElement;
};
