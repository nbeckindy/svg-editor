import { Injectable, signal } from '@angular/core';

export type EditorTool =
  | 'selector'
  | 'node-edit-selector'
  | 'zoom'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'pen';

const CREATION_TOOLS: ReadonlySet<EditorTool> = new Set(['rect', 'ellipse', 'line']);

@Injectable({
  providedIn: 'root'
})
export class EditorToolService {
  readonly currentTool = signal<EditorTool>('selector');
  readonly snapEnabled = signal<boolean>(false);

  setTool(tool: EditorTool): void {
    this.currentTool.set(tool);
  }

  getCurrentTool(): EditorTool {
    return this.currentTool();
  }

  setSnapEnabled(enabled: boolean): void {
    this.snapEnabled.set(enabled);
  }

  toggleSnap(): void {
    this.snapEnabled.update((enabled) => !enabled);
  }

  isSnapEnabled(): boolean {
    return this.snapEnabled();
  }

  isCreationTool(tool?: EditorTool): boolean {
    return CREATION_TOOLS.has(tool ?? this.currentTool());
  }
}
