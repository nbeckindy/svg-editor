import { Injectable, signal } from '@angular/core';
import type { ClipboardPayload, ClipboardShapeSnapshot } from '../models/clipboard-payload';

export type { ClipboardPayload, ClipboardShapeSnapshot } from '../models/clipboard-payload';

const PASTE_OFFSET_STEP = 10;

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly payload = signal<ClipboardPayload | null>(null);
  private pasteCount = 0;

  set(payload: ClipboardPayload): void {
    this.payload.set({
      shapes: payload.shapes.map((shape: ClipboardShapeSnapshot) => ({ ...shape }))
    });
    this.pasteCount = 0;
  }

  get(): ClipboardPayload | null {
    const value = this.payload();
    if (!value) return null;
    return {
      shapes: value.shapes.map((shape: ClipboardShapeSnapshot) => ({ ...shape }))
    };
  }

  clear(): void {
    this.payload.set(null);
    this.pasteCount = 0;
  }

  hasContent(): boolean {
    const value = this.payload();
    return !!value && value.shapes.length > 0;
  }

  nextPasteOffset(): { dx: number; dy: number } {
    this.pasteCount += 1;
    const delta = this.pasteCount * PASTE_OFFSET_STEP;
    return { dx: delta, dy: delta };
  }
}
