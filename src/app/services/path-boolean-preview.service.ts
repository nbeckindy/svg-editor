import { Injectable, inject, signal } from '@angular/core';
import type { BooleanOp } from '../models/path-boolean';
import { PathBooleanGeometryService } from './path-boolean-geometry.service';

@Injectable({
  providedIn: 'root'
})
export class PathBooleanPreviewService {
  private readonly geometry = inject(PathBooleanGeometryService);

  readonly previewOp = signal<BooleanOp | null>(null);
  readonly previewOperandIds = signal<readonly string[]>([]);
  readonly previewRootUserD = signal<string | null>(null);

  setPreview(op: BooleanOp, operandIds: readonly string[]): void {
    this.previewOp.set(op);
    this.previewOperandIds.set([...operandIds]);
    this.recomputePreviewD();
  }

  clearPreview(): void {
    this.previewOp.set(null);
    this.previewOperandIds.set([]);
    this.previewRootUserD.set(null);
  }

  private recomputePreviewD(): void {
    const op = this.previewOp();
    const ids = [...this.previewOperandIds()];
    if (!op || ids.length < 2) {
      this.previewRootUserD.set(null);
      return;
    }

    const port = this.geometry.createGeometryPort();
    if (!port) {
      this.previewRootUserD.set(null);
      return;
    }

    const d =
      op === 'union'
        ? this.geometry.unionLocalD(ids, port)
        : op === 'subtract'
          ? this.geometry.subtractLocalD(ids, port)
          : this.geometry.intersectLocalD(ids, port);
    this.previewRootUserD.set(d);
  }
}
