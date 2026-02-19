import { Injectable } from '@angular/core';
import { SVG, Svg, Element as SVGElement } from '@svgdotjs/svg.js';
import { ShapeProperties } from '../models/shape-properties.interface';

@Injectable({
  providedIn: 'root'
})
export class SvgManipulationService {
  private svgInstance: Svg | null = null;

  /**
   * Initialize SVG.js with container and content
   */
  initializeSVG(container: HTMLElement, svgContent: string): void {
    // Clear existing content
    container.innerHTML = '';
    
    // Create SVG instance
    this.svgInstance = SVG().addTo(container).size('100%', '100%');
    
    // Parse and add SVG content
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const svgElement = doc.querySelector('svg');
    
    if (svgElement) {
      container.innerHTML = svgElement.outerHTML;
      this.svgInstance = SVG(container.firstElementChild as SVGSVGElement);
      this.makeShapesClickable();
    }
  }

  /**
   * Make all shapes in SVG clickable
   */
  private makeShapesClickable(): void {
    if (!this.svgInstance) return;

    const shapes = this.svgInstance.find('circle, rect, path, polygon, ellipse, line, polyline');
    shapes.forEach((shape: SVGElement) => {
      shape.css({ cursor: 'pointer' });
      
      // Add unique ID if not present
      if (!shape.id()) {
        shape.id(`shape-${Math.random().toString(36).substr(2, 9)}`);
      }
    });
  }

  /**
   * Get shape properties by element
   */
  getShapeProperties(element: SVGElement): ShapeProperties {
    return {
      id: element.id() || '',
      type: element.type,
      fill: element.attr('fill') || '#000000',
      stroke: element.attr('stroke'),
      strokeWidth: parseFloat(element.attr('stroke-width')) || 0,
      opacity: parseFloat(element.attr('opacity')) || 1
    };
  }

  /**
   * Update fill color of a shape
   */
  updateFillColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.fill(color);
    }
  }

  /**
   * Add stroke to a shape
   */
  addStroke(shapeId: string, color: string, width: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color, width });
    }
  }

  /**
   * Remove stroke from a shape
   */
  removeStroke(shapeId: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke('none');
    }
  }

  /**
   * Update stroke color
   */
  updateStrokeColor(shapeId: string, color: string): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.stroke({ color });
    }
  }

  /**
   * Update opacity of a shape
   */
  updateOpacity(shapeId: string, opacity: number): void {
    if (!this.svgInstance) return;
    
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.opacity(opacity);
    }
  }

  /**
   * Move a shape by dx, dy in SVG coordinate space. Works for rect, circle, ellipse, path, etc.
   */
  translateShape(shapeId: string, dx: number, dy: number): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape && typeof shape.dmove === 'function') {
      shape.dmove(dx, dy);
    }
  }

  /**
   * Show or hide a shape (e.g. hide original during drag, show again on drop).
   */
  setShapeVisibility(shapeId: string, visible: boolean): void {
    if (!this.svgInstance) return;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (shape) {
      shape.attr('visibility', visible ? 'visible' : 'hidden');
    }
  }

  /**
   * Get shape bounding box in SVG coordinate space. Does not modify the SVG.
   */
  getShapeBBox(shapeId: string): { x: number; y: number; width: number; height: number } | null {
    if (!this.svgInstance) return null;
    const shape = this.svgInstance.findOne(`#${shapeId}`) as SVGElement;
    if (!shape?.node) return null;
    const node = shape.node as SVGGraphicsElement;
    if (typeof node.getBBox !== 'function') return null;
    const bbox = node.getBBox();
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  }

  /**
   * Highlight selected shape (no-op: highlight is drawn by canvas overlay, not by modifying SVG).
   */
  highlightShape(_shapeId: string): void {}

  /**
   * Clear shape highlight (no-op: overlay is driven by selection state).
   */
  clearHighlight(): void {}

  /**
   * Export current SVG as string
   */
  exportSVG(): string {
    if (!this.svgInstance) return '';
    return this.svgInstance.svg();
  }

  /**
   * Get SVG instance for direct manipulation
   */
  getSVGInstance(): Svg | null {
    return this.svgInstance;
  }
}
