import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconPaletteComponent } from './components/icon-palette/icon-palette.component';
import { ToolStripComponent } from './components/tool-strip/tool-strip.component';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';
import { SvgDebugPanelComponent } from './components/svg-debug-panel/svg-debug-panel.component';
import { LayersPanelComponent } from './components/layers-panel/layers-panel.component';
import { SvgManipulationService } from './services/svg-manipulation.service';
import { ShapeSelectionService } from './services/shape-selection.service';
import { EditorHistoryService } from './services/editor-history.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ToolStripComponent,
    IconPaletteComponent,
    SvgCanvasComponent,
    LayersPanelComponent,
    PropertiesPanelComponent,
    SvgDebugPanelComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class AppComponent {
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);

  svgContent: string = '';
  uploadedFileName: string = '';
  activeDockPanel: 'properties' | 'layers' = 'properties';

  private static readonly DEFAULT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"></svg>';

  onNewCanvas(): void {
    if (this.editorHistory.canUndo() &&
        !window.confirm('You have unsaved changes. Create a new document?')) {
      return;
    }
    this.shapeSelection.clearSelection();
    this.svgManipulation.clearHighlight();
    this.editorHistory.clear();
    this.svgContent = '';
    this.uploadedFileName = '';
    queueMicrotask(() => {
      this.svgContent = AppComponent.DEFAULT_SVG;
    });
  }

  onSVGLoaded(content: string): void {
    this.svgContent = content;
  }

  setActiveDockPanel(panel: 'properties' | 'layers'): void {
    this.activeDockPanel = panel;
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
