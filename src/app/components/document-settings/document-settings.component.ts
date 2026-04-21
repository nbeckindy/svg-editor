import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { ArtboardSizeCommand, ArtboardBackgroundCommand } from '../../models/editor-commands';

@Component({
  selector: 'app-document-settings',
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './document-settings.component.html',
  styleUrl: './document-settings.component.css'
})
export class DocumentSettingsComponent {
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly editorHistory = inject(EditorHistoryService);

  readonly artboard = this.svgManipulation.artboard;
  readonly hasDocument = computed(() => this.svgManipulation.getSVGInstance() != null);

  readonly MIN_DIMENSION = 1;
  readonly MAX_DIMENSION = 10000;

  onWidthChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!this.isValidDimension(value)) return;
    const ab = this.artboard();
    const cmd = new ArtboardSizeCommand(this.svgManipulation, ab.width, ab.height, value, ab.height);
    this.editorHistory.pushAndExecute(cmd);
  }

  onHeightChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!this.isValidDimension(value)) return;
    const ab = this.artboard();
    const cmd = new ArtboardSizeCommand(this.svgManipulation, ab.width, ab.height, ab.width, value);
    this.editorHistory.pushAndExecute(cmd);
  }

  onBackgroundColorChange(color: string): void {
    const ab = this.artboard();
    const cmd = new ArtboardBackgroundCommand(this.svgManipulation, ab.backgroundColor, color);
    this.editorHistory.pushAndExecute(cmd);
  }

  private isValidDimension(value: number): boolean {
    return Number.isFinite(value) && value >= this.MIN_DIMENSION && value <= this.MAX_DIMENSION;
  }
}
