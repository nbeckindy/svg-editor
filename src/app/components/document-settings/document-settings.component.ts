import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DOCUMENT_SETTINGS_SVG_PORT } from '../../services/manipulation-port-tokens';
import { EditorHistoryService } from '../../services/editor-history.service';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { OrientationGridComponent } from '../orientation-grid/orientation-grid.component';
import { ArtboardResizeAnchor } from '../../models/artboard.model';
import { ArtboardSizeCommand, ArtboardBackgroundCommand } from '../../models/editor-commands';

@Component({
  selector: 'app-document-settings',
  imports: [FormsModule, ColorPickerComponent, OrientationGridComponent],
  templateUrl: './document-settings.component.html',
  styleUrl: './document-settings.component.css',
  host: {
    'data-testid': 'document-settings-panel',
    class: 'document-settings-panel-host'
  }
})
export class DocumentSettingsComponent {
  private readonly svg = inject(DOCUMENT_SETTINGS_SVG_PORT);
  private readonly editorHistory = inject(EditorHistoryService);

  readonly artboard = this.svg.artboard;
  readonly artboardResizeAnchor = this.svg.artboardResizeAnchor;

  readonly MIN_DIMENSION = 1;
  readonly MAX_DIMENSION = 10000;

  onWidthChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!this.isValidDimension(value)) return;
    const ab = this.artboard();
    const cmd = new ArtboardSizeCommand(
      this.svg,
      ab.width,
      ab.height,
      ab.minX,
      ab.minY,
      value,
      ab.height
    );
    this.editorHistory.pushAndExecute(cmd);
  }

  onHeightChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!this.isValidDimension(value)) return;
    const ab = this.artboard();
    const cmd = new ArtboardSizeCommand(
      this.svg,
      ab.width,
      ab.height,
      ab.minX,
      ab.minY,
      ab.width,
      value
    );
    this.editorHistory.pushAndExecute(cmd);
  }

  onResizeAnchorSelect(anchor: ArtboardResizeAnchor): void {
    this.svg.setArtboardResizeAnchor(anchor);
  }

  onBackgroundColorChange(color: string): void {
    const ab = this.artboard();
    const cmd = new ArtboardBackgroundCommand(this.svg, ab.backgroundColor, color);
    this.editorHistory.pushAndExecute(cmd);
  }

  private isValidDimension(value: number): boolean {
    return Number.isFinite(value) && value >= this.MIN_DIMENSION && value <= this.MAX_DIMENSION;
  }
}
