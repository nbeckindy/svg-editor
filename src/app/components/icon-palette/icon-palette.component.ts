import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TEST_ICONS, TestIcon } from '../../data/test-icons';

@Component({
  selector: 'app-icon-palette',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="palette-container">
      <h3 class="palette-heading">Test icons</h3>
      <div class="icon-grid">
        @for (icon of icons; track icon.id) {
          <button
            type="button"
            class="icon-item"
            (click)="selectIcon(icon)"
            [title]="icon.label">
            <span class="icon-preview" [innerHTML]="getSafeSvg(icon.svg)"></span>
            <span class="icon-label">{{ icon.label }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
    }
    .palette-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .palette-heading {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      flex-shrink: 0;
    }
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 12px;
      align-content: start;
      flex: 1;
      min-height: 0;
    }
    .icon-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease;
    }
    .icon-item:hover {
      border-color: #2196F3;
      background-color: #e3f2fd;
    }
    .icon-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }
    .icon-preview ::ng-deep svg {
      width: 32px;
      height: 32px;
    }
    .icon-label {
      font-size: 12px;
      color: #555;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
    }
  `]
})
export class IconPaletteComponent {
  @Output() svgLoaded = new EventEmitter<string>();

  icons = TEST_ICONS;

  constructor(private sanitizer: DomSanitizer) {}

  getSafeSvg(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  selectIcon(icon: TestIcon): void {
    this.svgLoaded.emit(icon.svg);
  }
}
