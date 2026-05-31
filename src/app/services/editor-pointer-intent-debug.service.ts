import { Injectable, signal } from '@angular/core';

/** Last sampled pointer + predicted primary-button behavior on the editor canvas (debug HUD). */
export type EditorPointerIntentSnapshot = {
  clientX: number;
  clientY: number;
  sampledAtMs: number;
  /** What the UI should show per tool CSS / viewport rules (best-effort). */
  expectedCursorLine: string;
  /** One-line summary for the strip. */
  primaryLine: string;
  /** Extra lines (monospace block). */
  detailLines: string[];
};

@Injectable({ providedIn: 'root' })
export class EditorPointerIntentDebugService {
  readonly snapshot = signal<EditorPointerIntentSnapshot | null>(null);

  publish(snapshot: EditorPointerIntentSnapshot): void {
    this.snapshot.set(snapshot);
  }
}
