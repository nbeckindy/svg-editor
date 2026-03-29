import { Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TEST_ICONS, TestIcon } from '../../data/test-icons';
import {
  brocSvg,
  lemonSqueezeSvg,
  photoNgMobileSvg,
  svgFutureSvg
} from '../../data/data-svg-strings';

const DATA_SVG_ICONS: TestIcon[] = [
  { id: '201806-photo-ng-mobile', label: 'Photo NG mobile', svg: photoNgMobileSvg },
  { id: 'broc', label: 'Broc', svg: brocSvg },
  { id: 'lemon-squeeze', label: 'Lemon squeeze', svg: lemonSqueezeSvg },
  { id: 'svg-future', label: 'SVG future', svg: svgFutureSvg }
];

@Component({
  selector: 'app-icon-palette',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icon-palette.component.html',
  styleUrl: './icon-palette.component.css'
})
export class IconPaletteComponent {
  readonly svgLoaded = output<string>();

  icons: TestIcon[] = [...TEST_ICONS, ...DATA_SVG_ICONS];

  constructor(private sanitizer: DomSanitizer) {}

  private injectTestMarker(svg: string): string {
    const marker = '<!--svg-editor-test-icon-->';
    // Some bundled SVGs start with an XML declaration (`<?xml ...?>`). Putting a comment
    // before that declaration can break DOMParser parsing. Insert after the XML declaration.
    const xmlDeclMatch = svg.match(/^\s*<\?xml[\s\S]*?\?>/i);
    if (xmlDeclMatch) {
      const decl = xmlDeclMatch[0];
      const end = decl.length; // match starts at 0 (because of ^\s*)
      return `${svg.slice(0, end)}\n${marker}${svg.slice(end)}`;
    }
    return `${marker}${svg}`;
  }

  getSafeSvg(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  selectIcon(icon: TestIcon): void {
    this.svgLoaded.emit(this.injectTestMarker(icon.svg));
  }
}
