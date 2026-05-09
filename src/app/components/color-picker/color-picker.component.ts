import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** Parse user HEX input to normalized `#rrggbb` or null if invalid/incomplete. */
export function parseHexColorInput(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) {
    return s.toLowerCase();
  }
  return null;
}

@Component({
  selector: 'app-color-picker',
  imports: [CommonModule, FormsModule],
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.css'
})
export class ColorPickerComponent {
  readonly color = input<string>('#000000');
  /** True when there is no solid paint (shows slash swatch). */
  readonly empty = input(false);
  /** When true, shows a mixed state until the user picks a color (multi-selection with differing values). */
  readonly indeterminate = input(false);
  /** When true, popover shows a control to clear paint (`none`). */
  readonly clearable = input(false);
  readonly colorChange = output<string>();

  /** Draft HEX while the popover is open (no inline rail). */
  readonly hexDraft = signal('');

  nativePickerValue(): string {
    const parsed = parseHexColorInput(this.color());
    if (parsed) return parsed;
    return '#000000';
  }

  onDetailsToggle(ev: Event): void {
    const el = ev.target as HTMLDetailsElement;
    if (!el.open) return;
    if (this.indeterminate() || this.empty()) {
      this.hexDraft.set('');
    } else {
      const parsed = parseHexColorInput(this.color());
      this.hexDraft.set(parsed ? parsed.toUpperCase() : '');
    }
  }

  onNativeColorInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.hexDraft.set(v.toUpperCase());
    this.colorChange.emit(v);
  }

  onHexModelChange(raw: string): void {
    this.hexDraft.set(raw);
    const parsed = parseHexColorInput(raw);
    if (parsed) {
      this.colorChange.emit(parsed);
    }
  }

  onClear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.colorChange.emit('none');
    const det = (event.currentTarget as HTMLElement).closest('details');
    det?.removeAttribute('open');
  }
}
