import { Component, computed, inject } from '@angular/core';
import { EditorToolService } from '../../services/editor-tool.service';

@Component({
  selector: 'app-editor-tool-context-bar',
  standalone: true,
  templateUrl: './editor-tool-context-bar.component.html',
  styleUrl: './editor-tool-context-bar.component.css'
})
export class EditorToolContextBarComponent {
  readonly editorTool = inject(EditorToolService);

  /** Shown when Pen tool is active (h76: discoverable alternate Q/S/T mode). */
  readonly penCurveModeHint = computed(() => {
    if (this.editorTool.currentTool() !== 'pen') return '';
    if (this.editorTool.penAltCurveMode()) {
      return 'Alternate curve on (Q after M/L, smooth S after C, smooth T after Q). Turn off for cubic (C) only.';
    }
    return 'Default: cubic (C). Hold Control while dragging a new point, or turn on Alt curve. (⌘/Ctrl still bypasses snap.)';
  });

  togglePenAltCurveMode(): void {
    this.editorTool.setPenAltCurveMode(!this.editorTool.penAltCurveMode());
  }
}
