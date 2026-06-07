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

  /** Shown when Pen tool is active (h76: discoverable alternate smooth S/T mode; Q after M/L temporarily cubic). */
  readonly penCurveModeHint = computed(() => {
    if (this.editorTool.currentTool() !== 'pen') return '';
    if (this.editorTool.penAltCurveMode()) {
      return 'Alternate curve on (smooth S after C, smooth T after Q). Quadratic Q after M/L is temporarily off — new segments use cubic C.';
    }
    return 'Default: cubic (C). First segment: press–drag from empty canvas (then click to place the end anchor), or click a second point then drag. Turn on Alt curve for smooth S/T after existing curves. (⌘/Ctrl still bypasses snap.)';
  });

  togglePenAltCurveMode(): void {
    this.editorTool.setPenAltCurveMode(!this.editorTool.penAltCurveMode());
  }
}
