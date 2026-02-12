import { Component } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [AsyncPipe],
  template: `
    <div class="tool-strip">
      <button
        type="button"
        class="tool-btn"
        [class.active]="(currentTool$ | async) === 'selector'"
        (click)="setTool('selector')"
        title="Selector">
        Selector
      </button>
      <button
        type="button"
        class="tool-btn"
        [class.active]="(currentTool$ | async) === 'zoom'"
        (click)="setTool('zoom')"
        title="Zoom">
        Zoom
      </button>
    </div>
  `,
  styles: [`
    .tool-strip {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .tool-btn {
      padding: 8px 14px;
      font-size: 14px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fff;
      color: #333;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .tool-btn:hover {
      background: #f5f5f5;
      border-color: #999;
    }
    .tool-btn.active {
      background: #1976D2;
      border-color: #1976D2;
      color: white;
    }
  `]
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
