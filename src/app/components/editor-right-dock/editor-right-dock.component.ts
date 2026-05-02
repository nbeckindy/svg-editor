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
}
