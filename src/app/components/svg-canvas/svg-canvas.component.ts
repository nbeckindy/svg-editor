import { Component, Input, AfterViewInit, ViewChild, ElementRef, OnChanges } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Element as SVGElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { CanvasViewService } from '../../services/canvas-view.service';

@Component({
  selector: 'app-svg-canvas',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <div class="canvas-container" [class.zoom-mode]="(editorTool.currentTool$ | async) === 'zoom'">
      <div class="svg-canvas" (click)="onCanvasClick($event)">
        <div
          #svgContainer
          class="svg-zoom-wrapper"
          [style.transform]="'translate(' + canvasView.panX + 'px,' + canvasView.panY + 'px) scale(' + canvasView.scale + ')'"
          style="transform-origin: 0 0">
        </div>
      </div>
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
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .svg-zoom-wrapper {
      display: inline-block;
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
    .canvas-container.zoom-mode {
      cursor: zoom-in;
    }
  `]
})
export class SvgCanvasComponent implements AfterViewInit, OnChanges {
  @Input() svgContent: string = '';
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLElement>;

  constructor(
    private svgManipulation: SvgManipulationService,
    private shapeSelection: ShapeSelectionService,
    public editorTool: EditorToolService,
    public canvasView: CanvasViewService
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
    this.canvasView.init();
  }

  onCanvasClick(event: MouseEvent): void {
    if (this.editorTool.getCurrentTool() === 'zoom') {
      if (!this.svgContent || !this.canvasView.isInitialized()) return;
      const rect = this.svgContainer.nativeElement.getBoundingClientRect();
      const point = this.canvasView.screenToSvg(event.clientX, event.clientY, rect);
      if (point) {
        this.canvasView.zoomInAt(point.x, point.y);
      }
      return;
    }

    const target = event.target as Element;
    if (target.tagName !== 'svg') {
      const svgElement = this.svgManipulation.getSVGInstance()?.findOne(`#${target.id}`) as SVGElement;
      if (svgElement) {
        const properties = this.svgManipulation.getShapeProperties(svgElement);
        this.shapeSelection.selectShape(properties);
        this.svgManipulation.highlightShape(properties.id);
      }
    } else {
      this.shapeSelection.clearSelection();
      this.svgManipulation.clearHighlight();
    }
  }
}
