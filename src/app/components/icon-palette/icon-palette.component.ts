import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TEST_ICONS, TestIcon } from '../../data/test-icons';

@Component({
  selector: 'app-icon-palette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icon-palette.component.html',
  styleUrl: './icon-palette.component.css'
})
export class IconPaletteComponent {
  readonly svgLoaded = output<string>();

  icons = TEST_ICONS;

  constructor(private sanitizer: DomSanitizer) {}

  getSafeSvg(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  selectIcon(icon: TestIcon): void {
    this.svgLoaded.emit(icon.svg);
  }
}
