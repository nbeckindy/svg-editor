import { Component, output } from '@angular/core';
import { IconPaletteComponent } from '../icon-palette/icon-palette.component';
import { ToolStripComponent } from '../tool-strip/tool-strip.component';

@Component({
  selector: 'app-editor-left-rail',
  standalone: true,
  imports: [ToolStripComponent, IconPaletteComponent],
  templateUrl: './editor-left-rail.component.html',
  styleUrl: './editor-left-rail.component.css'
})
export class EditorLeftRailComponent {
  readonly svgLoaded = output<string>();
}
