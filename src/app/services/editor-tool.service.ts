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
  /** Pen: hold Control while dragging to author Q / S / T instead of cubic (svg-editor-h76). */
  readonly penAltCurveMode = signal<boolean>(false);

  setTool(tool: EditorTool): void {
    if (tool !== 'pen') {
      this.penAltCurveMode.set(false);
    }
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

  setPenAltCurveMode(enabled: boolean): void {
    this.penAltCurveMode.set(enabled);
  }

  isPenAltCurveMode(): boolean {
    return this.penAltCurveMode();
  }

  isCreationTool(tool?: EditorTool): boolean {
    const id = tool ?? this.currentTool();
    if (this.toolRegistry.getDescriptor(id)) {
      return this.toolRegistry.isCreationTool(id);
    }
    return id === 'rect' || id === 'ellipse' || id === 'line';
  }
}
