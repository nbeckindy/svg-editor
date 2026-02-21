import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.css'
})
export class ColorPickerComponent {
  readonly color = input<string>('#000000');
  readonly colorChange = output<string>();

  onColorChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const value = inputEl.value;
    this.colorChange.emit(value);
  }

  onTextChange(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const value = inputEl.value;
    if (/^#[0-9A-F]{6}$/i.test(value)) {
      this.colorChange.emit(value);
    }
  }
}
