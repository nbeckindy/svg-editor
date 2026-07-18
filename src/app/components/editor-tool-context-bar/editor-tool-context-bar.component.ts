import { Component, inject } from '@angular/core';
import { EditorToolService } from '../../services/editor-tool.service';
import { PathNodeAnchorToolsComponent } from '../path-node-anchor-tools/path-node-anchor-tools.component';
import { RectToolContextComponent } from '../rect-tool-context/rect-tool-context.component';

@Component({
  selector: 'app-editor-tool-context-bar',
  imports: [PathNodeAnchorToolsComponent, RectToolContextComponent],
  templateUrl: './editor-tool-context-bar.component.html',
  styleUrl: './editor-tool-context-bar.component.css'
})
export class EditorToolContextBarComponent {
  readonly editorTool = inject(EditorToolService);
}
