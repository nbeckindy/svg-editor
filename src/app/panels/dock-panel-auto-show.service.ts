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

/**
 * Relevance-driven auto-expand for dock stack sections.
 * Suggests a section (e.g. Path Ops) so the layout can expand it and scroll it into view
 * instead of switching exclusive tabs.
 */
@Injectable({
  providedIn: 'root'
})
export class DockPanelAutoShowService {
  private readonly editorTool = inject(EditorToolService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly registry = inject(DockPanelRegistryService);

  /** Section the user manually collapsed; suppress auto-expand until context changes. */
  private manuallyCollapsedId: EditorDockPanel | null = null;
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
          this.manuallyCollapsedId = null;
          this.manualContextKey = null;
        }
        lastContextKey = contextKey;
      }
    });
  }

  /**
   * Whether layout should expand {@link suggested} (and typically scroll it into view).
   * Returns false when already expanded, or when the user collapsed that section
   * in the current tool/selection context.
   */
  shouldAutoExpand(suggested: DockPanelId | null, isCurrentlyExpanded: boolean): boolean {
    if (!suggested || isCurrentlyExpanded) {
      return false;
    }
    if (this.manuallyCollapsedId === suggested && this.manualContextKey === this.currentContextKey()) {
      return false;
    }
    return true;
  }

  recordManualCollapse(panelId: EditorDockPanel): void {
    this.manuallyCollapsedId = panelId;
    this.manualContextKey = this.currentContextKey();
  }

  recordManualExpand(panelId: EditorDockPanel): void {
    if (this.manuallyCollapsedId === panelId) {
      this.manuallyCollapsedId = null;
      this.manualContextKey = null;
    }
  }

  private currentContextKey(): string {
    const shapes = this.shapeSelection.selectedShapes();
    return dockPanelContextKey(
      this.relevanceContext(),
      shapes.map((shape) => shape.id)
    );
  }
}
