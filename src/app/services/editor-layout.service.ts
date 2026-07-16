import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { EditorDockPanel } from '../components/editor-dock-panel';
import { DockPanelAutoShowService } from '../panels/dock-panel-auto-show.service';
import { DockPanelRegistryService } from '../panels/dock-panel-registry.service';

/** Session shell layout: dock stack expand/collapse, rail widths (resets on full reload). */
@Injectable({
  providedIn: 'root'
})
export class EditorLayoutService {
  private readonly dockAutoShow = inject(DockPanelAutoShowService);
  private readonly dockPanelRegistry = inject(DockPanelRegistryService);

  private readonly sectionExpandedMap = signal<ReadonlyMap<string, boolean>>(new Map());
  /** Section id to scroll into view; right dock consumes and clears. */
  private readonly scrollRequestId = signal<EditorDockPanel | null>(null);

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

  readonly pendingScrollSectionId = this.scrollRequestId.asReadonly();

  constructor() {
    this.syncSectionDefaultsFromRegistry();

    effect(() => {
      // Re-seed when the registry gains or loses sections.
      this.dockPanelRegistry.panels();
      this.syncSectionDefaultsFromRegistry();
    });

    effect(() => {
      const suggested = this.dockAutoShow.suggestedPanelId();
      const expanded = suggested ? this.isSectionExpanded(suggested) : false;
      if (suggested && this.dockAutoShow.shouldAutoExpand(suggested, expanded)) {
        this.expandSection(suggested, { scrollIntoView: true, fromAutoShow: true });
      }
    });
  }

  isSectionExpanded(panelId: EditorDockPanel): boolean {
    return this.sectionExpandedMap().get(panelId) ?? false;
  }

  toggleSection(panelId: EditorDockPanel): void {
    if (this.isSectionExpanded(panelId)) {
      this.collapseSection(panelId);
    } else {
      this.expandSection(panelId, { scrollIntoView: false });
    }
  }

  expandSection(
    panelId: EditorDockPanel,
    options: { scrollIntoView?: boolean; fromAutoShow?: boolean } = {}
  ): void {
    this.setSectionExpanded(panelId, true);
    if (!options.fromAutoShow) {
      this.dockAutoShow.recordManualExpand(panelId);
    }
    if (options.scrollIntoView) {
      this.scrollRequestId.set(panelId);
    }
  }

  collapseSection(panelId: EditorDockPanel): void {
    this.setSectionExpanded(panelId, false);
    this.dockAutoShow.recordManualCollapse(panelId);
  }

  /** Right dock calls after scrolling so the request is not applied twice. */
  clearScrollRequest(): void {
    this.scrollRequestId.set(null);
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

  private syncSectionDefaultsFromRegistry(): void {
    const panels = this.dockPanelRegistry.panels();
    if (panels.length === 0) {
      return;
    }
    const prev = this.sectionExpandedMap();
    const next = new Map(prev);
    let changed = false;
    for (const panel of panels) {
      if (!next.has(panel.id)) {
        next.set(panel.id, panel.defaultExpanded ?? true);
        changed = true;
      }
    }
    for (const id of [...next.keys()]) {
      if (!panels.some((panel) => panel.id === id)) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this.sectionExpandedMap.set(next);
    }
  }

  private setSectionExpanded(panelId: EditorDockPanel, expanded: boolean): void {
    this.sectionExpandedMap.update((prev) => {
      const next = new Map(prev);
      next.set(panelId, expanded);
      return next;
    });
  }
}
