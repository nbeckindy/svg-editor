import { Injectable, signal } from '@angular/core';

export type EditorTool = 'selector' | 'zoom' | 'pan';

@Injectable({
  providedIn: 'root'
})
export class EditorToolService {
  readonly currentTool = signal<EditorTool>('selector');

  setTool(tool: EditorTool): void {
    this.currentTool.set(tool);
  }

  getCurrentTool(): EditorTool {
    return this.currentTool();
  }
}
