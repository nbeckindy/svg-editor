import { Component, inject } from '@angular/core';
import { EditorToolService } from '../../services/editor-tool.service';
import { PathNodeAnchorToolsComponent } from '../path-node-anchor-tools/path-node-anchor-tools.component';

@Component({
  selector: 'app-editor-tool-context-bar',
  imports: [PathNodeAnchorToolsComponent],
  templateUrl: './editor-tool-context-bar.component.html',
  styleUrl: './editor-tool-context-bar.component.css'
})
export class EditorToolContextBarComponent {
  readonly editorTool = inject(EditorToolService);
}
