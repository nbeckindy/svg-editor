import { Component, computed, inject, input, output } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { EditorDockPanel } from '../editor-dock-panel';
import { DockPanelRegistryService } from '../../panels/dock-panel-registry.service';

@Component({
  selector: 'app-editor-right-dock',
  imports: [NgComponentOutlet],
  templateUrl: './editor-right-dock.component.html',
  styleUrl: './editor-right-dock.component.css'
})
export class EditorRightDockComponent {
  private readonly dockPanelRegistry = inject(DockPanelRegistryService);

  readonly activeDockPanel = input.required<EditorDockPanel>();
  readonly activeDockPanelChange = output<EditorDockPanel>();

  readonly dockCollapsed = input<boolean>(false);
  readonly dockCollapsedChange = output<boolean>();

  readonly dockPanels = this.dockPanelRegistry.panels;

  readonly tabGridColumns = computed(() => {
    const count = this.dockPanels().length;
    return count > 0 ? `repeat(${count}, minmax(0, 1fr))` : '1fr';
  });

  isPanelInactive(panelId: EditorDockPanel): boolean {
    return this.activeDockPanel() !== panelId;
  }

  collapseDock(): void {
    this.dockCollapsedChange.emit(true);
  }

  expandDock(): void {
    this.dockCollapsedChange.emit(false);
  }
}
