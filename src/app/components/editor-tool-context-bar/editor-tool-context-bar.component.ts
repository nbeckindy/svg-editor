import { Component, inject } from '@angular/core';
import { EditorToolService } from '../../services/editor-tool.service';

@Component({
  selector: 'app-editor-tool-context-bar',
  standalone: true,
  templateUrl: './editor-tool-context-bar.component.html',
  styleUrl: './editor-tool-context-bar.component.css'
})
export class EditorToolContextBarComponent {
  readonly editorTool = inject(EditorToolService);
}
