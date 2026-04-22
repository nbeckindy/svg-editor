import { Injectable, signal } from '@angular/core';

export type EditorTool = 'selector' | 'zoom' | 'pan' | 'rect' | 'ellipse' | 'line';

const CREATION_TOOLS: ReadonlySet<EditorTool> = new Set(['rect', 'ellipse', 'line']);

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

  isCreationTool(tool?: EditorTool): boolean {
    return CREATION_TOOLS.has(tool ?? this.currentTool());
  }
}
