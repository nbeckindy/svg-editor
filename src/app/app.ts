import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SvgCanvasComponent } from './components/svg-canvas/svg-canvas.component';
import { SvgDebugPanelComponent } from './components/svg-debug-panel/svg-debug-panel.component';
import { EditorDockPanel } from './components/editor-dock-panel';
import { EditorTopBarComponent } from './components/editor-top-bar/editor-top-bar.component';
import { EditorToolContextBarComponent } from './components/editor-tool-context-bar/editor-tool-context-bar.component';
import { EditorLeftRailComponent } from './components/editor-left-rail/editor-left-rail.component';
import { EditorRightDockComponent } from './components/editor-right-dock/editor-right-dock.component';
import type { AppRootSvgManipulationPort } from './history/editor-chrome-svg.port';
import { SvgManipulationService } from './services/svg-manipulation.service';
import { ShapeSelectionService } from './services/shape-selection.service';
import { EditorHistoryService } from './services/editor-history.service';
import { DockPanelAutoShowService } from './panels/dock-panel-auto-show.service';

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
  private static readonly DEFAULT_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"></svg>';

  private readonly svg: AppRootSvgManipulationPort = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);
  private readonly dockAutoShow = inject(DockPanelAutoShowService);

  /** Blank 800×600 document on first paint and on full page reload. */
  svgContent: string = AppComponent.DEFAULT_SVG;
  uploadedFileName: string = '';
  readonly activeDockPanel = signal<EditorDockPanel>('properties');
  /** Session-only; resets on full page reload (expanded). */
  readonly dockCollapsed = signal(false);

  constructor() {
    effect(() => {
      const suggested = this.dockAutoShow.suggestedPanelId();
      const current = this.activeDockPanel();
      if (suggested && this.dockAutoShow.shouldAutoSwitch(current, suggested)) {
        this.activeDockPanel.set(suggested);
      }
    });
  }

  onDockPanelChange(panel: EditorDockPanel): void {
    this.activeDockPanel.set(panel);
    this.dockAutoShow.recordManualSelection(panel);
  }

  onNewCanvas(): void {
    if (this.editorHistory.canUndo() &&
        !window.confirm('You have unsaved changes. Create a new document?')) {
      return;
    }
    this.shapeSelection.clearSelection();
    this.svg.clearHighlight();
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
    const policy = this.svg.getSvgExportImagePolicyResult();
    if (policy.blocked) {
      window.alert(policy.blockedReason ?? 'Export is blocked because this document contains images that cannot be saved to a portable SVG file.');
      return;
    }
    if (policy.hasOversizedDataUrl && policy.oversizedConfirmMessage) {
      if (!window.confirm(policy.oversizedConfirmMessage)) {
        return;
      }
    }

    const svgText = this.svg.exportSVG();
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
