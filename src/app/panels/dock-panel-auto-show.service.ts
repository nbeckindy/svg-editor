import { computed, effect, inject, Injectable } from '@angular/core';
import type { EditorDockPanel } from '../components/editor-dock-panel';
import { EditorToolService } from '../services/editor-tool.service';
import { ShapeSelectionService } from '../services/shape-selection.service';
import type { DockPanelId } from './dock-panel-descriptor';
import { DockPanelRegistryService } from './dock-panel-registry.service';
import {
  dockPanelContextKey,
  suggestDockPanelId,
  type DockPanelRelevanceContext
} from './dock-panel-relevance';

@Injectable({
  providedIn: 'root'
})
export class DockPanelAutoShowService {
  private readonly editorTool = inject(EditorToolService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly registry = inject(DockPanelRegistryService);

  private manualPanelId: EditorDockPanel | null = null;
  private manualContextKey: string | null = null;

  readonly relevanceContext = computed((): DockPanelRelevanceContext => {
    const shapes = this.shapeSelection.selectedShapes();
    return {
      currentTool: this.editorTool.currentTool(),
      selectedShapeCount: shapes.length,
      selectedPathCount: shapes.filter((shape) => shape.type === 'path').length
    };
  });

  readonly suggestedPanelId = computed((): DockPanelId | null => {
    return suggestDockPanelId(this.registry.panels(), this.relevanceContext());
  });

  constructor() {
    let lastContextKey = '';
    effect(() => {
      const contextKey = this.currentContextKey();
      if (contextKey !== lastContextKey) {
        if (this.manualContextKey !== null && this.manualContextKey !== contextKey) {
          this.manualPanelId = null;
          this.manualContextKey = null;
        }
        lastContextKey = contextKey;
      }
    });
  }

  shouldAutoSwitch(currentPanel: EditorDockPanel, suggested: DockPanelId | null): boolean {
    if (!suggested || suggested === currentPanel) {
      return false;
    }
    if (this.manualPanelId === currentPanel && this.manualContextKey === this.currentContextKey()) {
      return false;
    }
    return true;
  }

  recordManualSelection(panelId: EditorDockPanel): void {
    this.manualPanelId = panelId;
    this.manualContextKey = this.currentContextKey();
  }

  private currentContextKey(): string {
    const shapes = this.shapeSelection.selectedShapes();
    return dockPanelContextKey(
      this.relevanceContext(),
      shapes.map((shape) => shape.id)
    );
  }
}
