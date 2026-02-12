import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { IconPaletteComponent } from './components/icon-palette/icon-palette.component';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FileUploadComponent,
    IconPaletteComponent,
    SvgCanvasComponent,
    PropertiesPanelComponent
  ],
  template: `
    <div class="app-container">
      <header>
        <h1>Angular SVG Editor</h1>
      </header>

      <div class="toolbar-row">
        <app-file-upload (svgLoaded)="onSVGLoaded($event)"></app-file-upload>
        <app-icon-palette (svgLoaded)="onSVGLoaded($event)"></app-icon-palette>
      </div>

      <div class="main-content">
        <div class="canvas-area">
          <app-svg-canvas [svgContent]="svgContent"></app-svg-canvas>
        </div>
        <div class="properties-area">
          <app-properties-panel></app-properties-panel>
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
    .toolbar-row app-file-upload {
      flex-shrink: 0;
    }
    .toolbar-row app-icon-palette {
      flex: 1;
      min-width: 0;
    }
    .main-content {
      display: grid;
      grid-template-columns: 1fr 300px;
      flex: 1;
      overflow: hidden;
    }
    .canvas-area {
      padding: 20px;
      overflow: auto;
    }
    .properties-area {
      border-left: 1px solid #ddd;
    }
  `]
})
export class AppComponent {
  svgContent: string = '';

  onSVGLoaded(content: string): void {
    this.svgContent = content;
  }
}
