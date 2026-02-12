import { Component, Input, AfterViewInit, ViewChild, ElementRef, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Element as SVGElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-container">
      <div #svgContainer class="svg-canvas" (click)="onCanvasClick($event)"></div>
      @if (!svgContent) {
        <div class="placeholder">
          <p>Load an SVG file to begin editing</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      background: white;
    }
    .svg-canvas {
      width: 100%;
      height: 100%;
    }
    .placeholder {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #999;
    }
    :host ::ng-deep .selected-shape {
      outline: 2px dashed #2196F3;
      outline-offset: 2px;
    }
  `]
})
export class SvgCanvasComponent implements AfterViewInit, OnChanges {
  @Input() svgContent: string = '';
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLElement>;

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService
  ) {}

  ngAfterViewInit(): void {
    if (this.svgContent) {
      this.initializeSVG();
    }
  }

  ngOnChanges(): void {
    if (this.svgContainer && this.svgContent) {
      this.initializeSVG();
    }
  }

  private initializeSVG(): void {
    this.svgManipulation.initializeSVG(this.svgContainer.nativeElement, this.svgContent);
  }

  onCanvasClick(event: MouseEvent): void {
    const target = event.target as Element;
    
    // Check if clicked element is a shape
    if (target.tagName !== 'svg') {
      const svgElement = this.svgManipulation.getSVGInstance()?.findOne(`#${target.id}`) as SVGElement;
      if (svgElement) {
        const properties = this.svgManipulation.getShapeProperties(svgElement);
        this.shapeSelection.selectShape(properties);
        this.svgManipulation.highlightShape(properties.id);
      }
    } else {
      // Clicked on canvas background
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
    }
  }
}
