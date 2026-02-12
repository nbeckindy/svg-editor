import { Injectable } from '@angular/core';
import { SvgManipulationService } from './svg-manipulation.service';

@Injectable({
  providedIn: 'root'
})
export class CanvasViewService {
  scale = 1;
  panX = 0;
  panY = 0;

  constructor(private svgManipulation: SvgManipulationService) {}

  /**
   * Reset zoom state when a new SVG is loaded. Does not touch the SVG element.
   */
  init(): void {
    this.resetZoom();
  }

  resetZoom(): void {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /**
   * Convert screen click to SVG coordinates using wrapper rect and current pan/scale.
   */
  screenToSvg(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } | null {
    if (this.scale <= 0) return null;
    return {
      x: (clientX - rect.left - this.panX) / this.scale,
      y: (clientY - rect.top - this.panY) / this.scale
    };
  }

  /**
   * Zoom in 2x centered on the given SVG point. Only updates pan/scale; does not modify the SVG.
   */
  zoomInAt(svgX: number, svgY: number): void {
    const newScale = this.scale * 2;
    this.panX = this.panX + svgX * (this.scale - newScale);
    this.panY = this.panY + svgY * (this.scale - newScale);
    this.scale = newScale;
  }

  /**
   * Whether an SVG is loaded (zoom is meaningful).
   */
  isInitialized(): boolean {
    return this.svgManipulation.getSVGInstance() != null;
  }
}
