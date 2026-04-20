import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { IconPaletteComponent } from './components/icon-palette/icon-palette.component';
import { ToolStripComponent } from './components/tool-strip/tool-strip.component';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';
import { SvgDebugPanelComponent } from './components/svg-debug-panel/svg-debug-panel.component';
import { LayersPanelComponent } from './components/layers-panel/layers-panel.component';
import { SvgManipulationService } from './services/svg-manipulation.service';

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
    <div class="app-container" data-testid="app-root">
      <header>
        <h1>Angular SVG Editor</h1>
      </header>

      <div class="toolbar-row" data-testid="editor-toolbar">
        <app-tool-strip data-testid="editor-tool-strip"></app-tool-strip>
        <button
          type="button"
          class="new-canvas-btn"
          data-testid="new-canvas-button"
          (click)="onNewCanvas()">
          New
        </button>
        <app-file-upload data-testid="editor-file-upload" (svgLoaded)="onSVGLoaded($event)" (fileNameLoaded)="uploadedFileName = $event"></app-file-upload>
        <button
          type="button"
          class="download-button"
          data-testid="download-svg-button"
          [disabled]="!svgContent"
          (click)="downloadSvg()">
          Download SVG
        </button>
        <app-icon-palette data-testid="editor-icon-palette" (svgLoaded)="onSVGLoaded($event)"></app-icon-palette>
      </div>

      <div class="main-content" data-testid="editor-main">
        <div class="main-row">
          <div class="canvas-area" data-testid="editor-canvas-area">
            <app-svg-canvas data-testid="editor-svg-canvas" [svgContent]="svgContent"></app-svg-canvas>
          </div>
          <div class="layers-area" data-testid="editor-layers-area">
            <app-layers-panel data-testid="editor-layers-panel"></app-layers-panel>
          </div>
          <div class="properties-area" data-testid="editor-properties-area">
            <app-properties-panel data-testid="editor-properties-panel"></app-properties-panel>
          </div>
        </div>
        <div class="debug-strip" data-testid="editor-debug-strip">
          <app-svg-debug-panel data-testid="editor-svg-debug-panel"></app-svg-debug-panel>
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
    .toolbar-row .new-canvas-btn {
      padding: 10px 20px;
      background-color: #1976D2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      align-self: center;
      white-space: nowrap;
    }
    .toolbar-row .new-canvas-btn:hover {
      background-color: #1565C0;
    }
    .toolbar-row .download-button {
      padding: 10px 20px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      align-self: center;
      white-space: nowrap;
    }
    .toolbar-row .download-button:hover:not(:disabled) {
      background-color: #388E3C;
    }
    .toolbar-row .download-button:disabled {
      background-color: #ccc;
      color: #888;
      cursor: not-allowed;
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
  private readonly svgManipulation = inject(SvgManipulationService);

  svgContent: string = '';
  uploadedFileName: string = '';

  private static readonly DEFAULT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"></svg>';

  onNewCanvas(): void {
    this.svgContent = '';
    this.uploadedFileName = '';
    queueMicrotask(() => {
      this.svgContent = AppComponent.DEFAULT_SVG;
    });
  }

  onSVGLoaded(content: string): void {
    this.svgContent = content;
  }

  downloadSvg(): void {
    const svgText = this.svgManipulation.exportSVG();
    if (!svgText) return;

    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.uploadedFileName || 'document.svg';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
