import { Component } from '@angular/core';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [],
  templateUrl: './tool-strip.component.html',
  styleUrl: './tool-strip.component.css'
})
export class ToolStripComponent {
  constructor(public editorTool: EditorToolService) {}

  setTool(tool: EditorTool): void {
    this.editorTool.setTool(tool);
  }
}
