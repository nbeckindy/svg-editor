import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { SvgDebugPanelComponent } from './components/svg-debug-panel/svg-debug-panel.component';
import { EditorDockPanel } from './components/editor-dock-panel';
import { EditorTopBarComponent } from './components/editor-top-bar/editor-top-bar.component';
import { EditorToolContextBarComponent } from './components/editor-tool-context-bar/editor-tool-context-bar.component';
import { EditorLeftRailComponent } from './components/editor-left-rail/editor-left-rail.component';
import { EditorRightDockComponent } from './components/editor-right-dock/editor-right-dock.component';
import { SvgManipulationService } from './services/svg-manipulation.service';
import { ShapeSelectionService } from './services/shape-selection.service';
import { EditorHistoryService } from './services/editor-history.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    EditorTopBarComponent,
    EditorToolContextBarComponent,
    EditorLeftRailComponent,
    SvgCanvasComponent,
    EditorRightDockComponent,
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
  activeDockPanel: EditorDockPanel = 'properties';
  /** Session-only; resets on full page reload (expanded). */
  readonly dockCollapsed = signal(false);

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
