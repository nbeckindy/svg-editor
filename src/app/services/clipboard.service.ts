import { Injectable, signal } from '@angular/core';

export interface ClipboardShapeSnapshot {
  id: string;
  markup: string;
  insertionIndex?: number;
}

export interface ClipboardPayload {
  shapes: ClipboardShapeSnapshot[];
}

const PASTE_OFFSET_STEP = 10;

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly payload = signal<ClipboardPayload | null>(null);
  private pasteCount = 0;

  set(payload: ClipboardPayload): void {
    this.payload.set({
      shapes: payload.shapes.map((shape) => ({ ...shape }))
    });
    this.pasteCount = 0;
  }

  get(): ClipboardPayload | null {
    const value = this.payload();
    if (!value) return null;
    return {
      shapes: value.shapes.map((shape) => ({ ...shape }))
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
