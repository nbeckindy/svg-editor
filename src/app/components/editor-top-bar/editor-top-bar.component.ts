import { Component, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { EditorToolService } from '../../services/editor-tool.service';

@Component({
  selector: 'app-editor-top-bar',
  standalone: true,
  imports: [],
  templateUrl: './editor-top-bar.component.html',
  styleUrl: './editor-top-bar.component.css',
  host: {
    '(document:click)': 'onDocumentClick($event)'
  }
})
export class EditorTopBarComponent {
  readonly hasSvgContent = input(false);
  readonly newCanvas = output<void>();
  readonly download = output<void>();

  readonly editorTool = inject(EditorToolService);
  readonly snapMenuOpen = signal(false);

  private readonly snapRoot = viewChild<ElementRef<HTMLElement>>('snapRoot');

  toggleSnapMenu(): void {
    this.snapMenuOpen.update((open) => !open);
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.snapMenuOpen()) return;
    const root = this.snapRoot()?.nativeElement;
    if (root?.contains(event.target as Node)) return;
    this.snapMenuOpen.set(false);
  }

  onGridSnapCheckbox(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editorTool.setGridSnapEnabled(checked);
  }

  onShapeSnapCheckbox(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.editorTool.setShapeSnapEnabled(checked);
  }
}
