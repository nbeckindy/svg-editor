import { inject, Injectable, signal } from '@angular/core';
import { SvgEditorDocumentService } from './svg-editor-document.service';

/** Minimum zoom (1/64 ≈ 1.56%); mirrors default `zoomToFitRect` maxScale of 64. */
export const CANVAS_MIN_ZOOM_SCALE = 1 / 64;

@Injectable({
  providedIn: 'root'
})
export class CanvasViewService {
  private readonly doc = inject(SvgEditorDocumentService);

  readonly scale = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);

  /**
   * Reset zoom state when a new SVG is loaded. Does not touch the SVG element.
   */
  init(): void {
    this.resetZoom();
  }

  resetZoom(): void {
    this.scale.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  /**
   * Pan the view by the given screen-space delta. Does not modify the SVG.
   */
  panBy(dx: number, dy: number): void {
    this.panX.update(v => v + dx);
    this.panY.update(v => v + dy);
  }

  /**
   * Set the pan offset directly (e.g. when dragging to a new position).
   */
  setPan(x: number, y: number): void {
    this.panX.set(x);
    this.panY.set(y);
  }

  /**
   * Convert screen position to **layout** coordinates inside the zoomed SVG host (same space as
   * zoom marquee: 0..wrapperWidth before parent `scale`, pan is already in `rect` from transforms).
   * Do not subtract pan here — `rect` from `getBoundingClientRect()` on the host inside
   * `.svg-zoom-wrapper` already includes `translate(panX, panY) scale(scale)`.
   */
  screenToSvg(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } | null {
    const scale = this.scale();
    if (scale <= 0) return null;
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale
    };
  }

  /**
   * Zoom in 2x centered on the given SVG point. Only updates pan/scale; does not modify the SVG.
   */
  zoomInAt(svgX: number, svgY: number): void {
    const scale = this.scale();
    const newScale = scale * 2;
    this.panX.update(v => v + svgX * (scale - newScale));
    this.panY.update(v => v + svgY * (scale - newScale));
    this.scale.set(newScale);
  }

  /**
   * Apply a continuous zoom factor centered on the given SVG-layout point.
   * Used for wheel / pinch-to-zoom where the factor is derived from delta
   * (e.g. `Math.pow(1.002, -deltaY)`). Clamps at {@link CANVAS_MIN_ZOOM_SCALE}.
   */
  zoomByAt(factor: number, svgX: number, svgY: number): void {
    const scale = this.scale();
    const newScale = Math.max(CANVAS_MIN_ZOOM_SCALE, scale * factor);
    this.panX.update(v => v + svgX * (scale - newScale));
    this.panY.update(v => v + svgY * (scale - newScale));
    this.scale.set(newScale);
  }

  /**
   * Zoom out 2x centered on the given SVG point. Stops at {@link CANVAS_MIN_ZOOM_SCALE}.
   */
  zoomOutAt(svgX: number, svgY: number): void {
    const scale = this.scale();
    if (scale <= CANVAS_MIN_ZOOM_SCALE) return;
    const newScale = Math.max(CANVAS_MIN_ZOOM_SCALE, scale / 2);
    this.panX.update(v => v + svgX * (scale - newScale));
    this.panY.update(v => v + svgY * (scale - newScale));
    this.scale.set(newScale);
  }

  /**
   * Zoom and pan so the given SVG rectangle fits and is centered in the viewport.
   * `fitFraction` (default 1) shrinks the effective viewport used for scale only, leaving margin
   * around the fitted content (e.g. 0.9 uses 90% of width/height for the fit calculation).
   */
  zoomToFitRect(
    svgX: number,
    svgY: number,
    svgW: number,
    svgH: number,
    viewportW: number,
    viewportH: number,
    maxScale = 64,
    fitFraction = 1
  ): void {
    if (viewportW <= 0 || viewportH <= 0 || svgW <= 0 || svgH <= 0) return;
    const frac = Math.min(1, Math.max(0.05, fitFraction));
    const vw = viewportW * frac;
    const vh = viewportH * frac;
    let scale = Math.min(vw / svgW, vh / svgH);
    scale = Math.max(CANVAS_MIN_ZOOM_SCALE, Math.min(scale, maxScale));
    this.scale.set(scale);
    this.panX.set(viewportW / 2 - (svgX + svgW / 2) * scale);
    this.panY.set(viewportH / 2 - (svgY + svgH / 2) * scale);
  }

  /**
   * Whether an SVG is loaded (zoom is meaningful).
   */
  isInitialized(): boolean {
    return this.doc.getSVGInstance() != null;
  }
}
