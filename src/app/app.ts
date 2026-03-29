import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { IconPaletteComponent } from './components/icon-palette/icon-palette.component';
import { ToolStripComponent } from './components/tool-strip/tool-strip.component';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';
import { SvgDebugPanelComponent } from './components/svg-debug-panel/svg-debug-panel.component';
import { LayersPanelComponent } from './components/layers-panel/layers-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ToolStripComponent,
    FileUploadComponent,
    IconPaletteComponent,
    SvgCanvasComponent,
    LayersPanelComponent,
    PropertiesPanelComponent,
    SvgDebugPanelComponent
  ],
  template: `
    <div class="app-container">
      <header>
        <h1>Angular SVG Editor</h1>
      </header>

      <div class="toolbar-row">
        <app-tool-strip></app-tool-strip>
        <app-file-upload (svgLoaded)="onSVGLoaded($event)"></app-file-upload>
        <app-icon-palette (svgLoaded)="onSVGLoaded($event)"></app-icon-palette>
      </div>

      <div class="main-content">
        <div class="main-row">
          <div class="canvas-area">
            <app-svg-canvas [svgContent]="svgContent"></app-svg-canvas>
          </div>
          <div class="layers-area">
            <app-layers-panel></app-layers-panel>
          </div>
          <div class="properties-area">
            <app-properties-panel></app-properties-panel>
          </div>
        </div>
        <div class="debug-strip">
          <app-svg-debug-panel></app-svg-debug-panel>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: #1976D2;
      color: white;
      padding: 20px;
      text-align: center;
    }
    header h1 {
      margin: 0;
    }
    .toolbar-row {
      display: flex;
      gap: 20px;
      align-items: stretch;
      padding: 20px;
      min-height: 160px;
    }
    .toolbar-row app-tool-strip {
      flex-shrink: 0;
      align-self: center;
    }
    .toolbar-row app-file-upload {
      flex-shrink: 0;
    }
    .toolbar-row app-icon-palette {
      flex: 1;
      min-width: 0;
    }
    .main-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .main-row {
      display: grid;
      grid-template-columns: 1fr 280px 300px;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .canvas-area {
      padding: 20px;
      overflow: auto;
    }
    .layers-area {
      display: flex;
      min-height: 0;
      overflow: hidden;
      border-left: 1px solid #ddd;
    }
    .layers-area app-layers-panel {
      flex: 1;
      min-height: 0;
    }
    .properties-area {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      border-left: 1px solid #ddd;
    }
    .properties-area app-properties-panel {
      flex: 1;
      min-height: 0;
    }
    .debug-strip {
      flex-shrink: 0;
      border-top: 1px solid #ddd;
    }
  `]
})
export class AppComponent {
  svgContent: string = '';

  onSVGLoaded(content: string): void {
    this.svgContent = content;
  }
}
