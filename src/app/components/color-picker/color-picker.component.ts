import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="color-picker">
      <input
        type="color"
        [value]="color"
        (input)="onColorChange($event)"
        class="color-input">
      <input
        type="text"
        [value]="color"
        (input)="onTextChange($event)"
        class="color-text"
        placeholder="#000000">
    </div>
  `,
  styles: [`
    .color-picker {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .color-input {
      width: 50px;
      height: 40px;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .color-text {
      flex: 1;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
    }
  `]
})
export class ColorPickerComponent {
  @Input() color: string = '#000000';
  @Output() colorChange = new EventEmitter<string>();

  onColorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.color = input.value;
    this.colorChange.emit(this.color);
  }

  onTextChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    // Validate hex color
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      this.color = value;
      this.colorChange.emit(this.color);
    }
  }
}
