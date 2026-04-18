import { Component } from '@angular/core';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';
import { EditorHistoryService } from '../../services/editor-history.service';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [],
  templateUrl: './tool-strip.component.html',
  styleUrl: './tool-strip.component.css'
})
export class ToolStripComponent {
  constructor(
    public editorTool: EditorToolService,
    public editorHistory: EditorHistoryService
  ) {}

  setTool(tool: EditorTool): void {
    this.editorTool.setTool(tool);
  }

  onUndo(): void {
    this.editorHistory.undo();
  }

  onRedo(): void {
    this.editorHistory.redo();
  }
}
