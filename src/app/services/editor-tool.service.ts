import { Injectable, inject, signal } from '@angular/core';
import { ToolRegistryService } from '../tools/tool-registry.service';

export type EditorTool =
  | 'selector'
  | 'node-edit-selector'
  | 'eyedropper'
  | 'zoom'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'pen';

@Injectable({
  providedIn: 'root'
})
export class EditorToolService {
  private readonly toolRegistry = inject(ToolRegistryService);

  readonly currentTool = signal<EditorTool>('selector');
  readonly gridSnapEnabled = signal<boolean>(false);
  readonly shapeSnapEnabled = signal<boolean>(false);

  setTool(tool: EditorTool): void {
    this.currentTool.set(tool);
  }

  getCurrentTool(): EditorTool {
    return this.currentTool();
  }

  setGridSnapEnabled(enabled: boolean): void {
    this.gridSnapEnabled.set(enabled);
  }

  toggleGridSnap(): void {
    this.gridSnapEnabled.update((enabled) => !enabled);
  }

  isGridSnapEnabled(): boolean {
    return this.gridSnapEnabled();
  }

  setShapeSnapEnabled(enabled: boolean): void {
    this.shapeSnapEnabled.set(enabled);
  }

  toggleShapeSnap(): void {
    this.shapeSnapEnabled.update((enabled) => !enabled);
  }

  isShapeSnapEnabled(): boolean {
    return this.shapeSnapEnabled();
  }

  isCreationTool(tool?: EditorTool): boolean {
    return this.toolRegistry.isCreationTool(tool ?? this.currentTool());
  }
}
