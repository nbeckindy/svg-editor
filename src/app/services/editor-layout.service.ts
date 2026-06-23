import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { EditorDockPanel } from '../components/editor-dock-panel';
import { DockPanelAutoShowService } from '../panels/dock-panel-auto-show.service';

/** Session shell layout: dock tab, collapse, and track widths (resets on full reload). */
@Injectable({
  providedIn: 'root'
})
export class EditorLayoutService {
  private readonly dockAutoShow = inject(DockPanelAutoShowService);

  readonly activeDockPanel = signal<EditorDockPanel>('properties');
  readonly dockCollapsed = signal(false);
  readonly leftRailCollapsed = signal(false);

  /** Expanded right-dock track width in px (matches `--editor-right-dock-width` default). */
  readonly rightDockExpandedWidthPx = signal(320);
  /** Collapsed right-dock strip width in px (matches `--editor-right-dock-collapsed-width`). */
  readonly rightDockCollapsedWidthPx = signal(36);
  /** Left tool rail width in px (matches `--editor-left-rail-width` default). */
  readonly leftRailWidthPx = signal(72);

  readonly effectiveRightDockWidthPx = computed(() =>
    this.dockCollapsed() ? this.rightDockCollapsedWidthPx() : this.rightDockExpandedWidthPx()
  );

  readonly effectiveLeftRailWidthPx = computed(() =>
    this.leftRailCollapsed() ? 0 : this.leftRailWidthPx()
  );

  constructor() {
    effect(() => {
      const suggested = this.dockAutoShow.suggestedPanelId();
      const current = this.activeDockPanel();
      if (suggested && this.dockAutoShow.shouldAutoSwitch(current, suggested)) {
        this.activeDockPanel.set(suggested);
      }
    });
  }

  selectDockPanel(panel: EditorDockPanel): void {
    this.activeDockPanel.set(panel);
    this.dockAutoShow.recordManualSelection(panel);
  }

  setDockCollapsed(collapsed: boolean): void {
    this.dockCollapsed.set(collapsed);
  }

  collapseDock(): void {
    this.setDockCollapsed(true);
  }

  expandDock(): void {
    this.setDockCollapsed(false);
  }

  setLeftRailCollapsed(collapsed: boolean): void {
    this.leftRailCollapsed.set(collapsed);
  }
}
