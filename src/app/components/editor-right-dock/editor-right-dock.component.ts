import { Component, computed, inject } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { EditorDockPanel } from '../editor-dock-panel';
import { DockPanelRegistryService } from '../../panels/dock-panel-registry.service';
import { EditorLayoutService } from '../../services/editor-layout.service';

@Component({
  selector: 'app-editor-right-dock',
  imports: [NgComponentOutlet],
  templateUrl: './editor-right-dock.component.html',
  styleUrl: './editor-right-dock.component.css'
})
export class EditorRightDockComponent {
  protected readonly layout = inject(EditorLayoutService);
  private readonly dockPanelRegistry = inject(DockPanelRegistryService);

  readonly dockPanels = this.dockPanelRegistry.panels;

  readonly tabGridColumns = computed(() => {
    const count = this.dockPanels().length;
    return count > 0 ? `repeat(${count}, minmax(0, 1fr))` : '1fr';
  });

  isPanelInactive(panelId: EditorDockPanel): boolean {
    return this.layout.activeDockPanel() !== panelId;
  }
}
