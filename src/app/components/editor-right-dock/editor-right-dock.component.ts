import { Component, input, output } from '@angular/core';
import { LayersPanelComponent } from '../layers-panel/layers-panel.component';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { EditorDockPanel } from '../editor-dock-panel';

@Component({
  selector: 'app-editor-right-dock',
  standalone: true,
  imports: [PropertiesPanelComponent, LayersPanelComponent],
  templateUrl: './editor-right-dock.component.html',
  styleUrl: './editor-right-dock.component.css'
})
export class EditorRightDockComponent {
  readonly activeDockPanel = input.required<EditorDockPanel>();
  readonly activeDockPanelChange = output<EditorDockPanel>();

  readonly dockCollapsed = input<boolean>(false);
  readonly dockCollapsedChange = output<boolean>();

  readonly layersInactive = (): boolean => this.activeDockPanel() !== 'layers';
  readonly propertiesInactive = (): boolean => this.activeDockPanel() !== 'properties';

  collapseDock(): void {
    this.dockCollapsedChange.emit(true);
  }

  expandDock(): void {
    this.dockCollapsedChange.emit(false);
  }
}
