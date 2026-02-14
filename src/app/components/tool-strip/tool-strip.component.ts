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
        title="Zoom (click to zoom in, Alt+click to zoom out)">
        Zoom
      </button>
      <button
        type="button"
        class="tool-btn tool-btn-icon"
        [class.active]="(currentTool$ | async) === 'pan'"
        (click)="setTool('pan')"
        title="Pan (drag to move the canvas)">
        <span class="tool-icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
            <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
            <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-16 0v-2a2 2 0 0 1 4 0"/>
          </svg>
        </span>
        <span class="tool-label">Pan</span>
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
    .tool-btn-icon {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .tool-icon {
      display: inline-flex;
      line-height: 0;
    }
    .tool-icon svg {
      display: block;
    }
    .tool-label {
      font-size: 14px;
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
