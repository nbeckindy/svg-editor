import {
  Component,
  ElementRef,
  HostListener,
  isDevMode,
  output,
  signal,
  viewChild
} from '@angular/core';
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
  readonly showDevAssetsMenu = isDevMode();
  readonly assetsMenuOpen = signal(false);

  private readonly assetsMenuRoot = viewChild<ElementRef<HTMLElement>>('assetsMenuRoot');

  toggleAssetsMenu(): void {
    this.assetsMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.assetsMenuOpen()) return;
    const root = this.assetsMenuRoot()?.nativeElement;
    if (root?.contains(event.target as Node)) return;
    this.assetsMenuOpen.set(false);
  }
}
