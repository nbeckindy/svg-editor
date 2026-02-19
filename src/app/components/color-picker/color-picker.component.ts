import { Component, EventEmitter, Input, Output } from '@angular/core';
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
