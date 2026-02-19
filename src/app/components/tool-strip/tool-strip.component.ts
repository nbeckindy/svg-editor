import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [AsyncPipe],
  templateUrl: './tool-strip.component.html',
  styleUrl: './tool-strip.component.css'
})
export class ToolStripComponent {
  currentTool$: Observable<EditorTool>;

  constructor(public editorTool: EditorToolService) {
    this.currentTool$ = this.editorTool.currentTool$;
  }

  setTool(tool: EditorTool): void {
    this.editorTool.setTool(tool);
  }
}
