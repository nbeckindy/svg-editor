import { Injectable, inject, signal } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../models/shape-properties.interface';
import { ShapeSelectionService } from './shape-selection.service';
import { SvgManipulationService } from './svg-manipulation.service';

export interface SelectionUnionBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReconcileFromLiveTreeOptions {
  onUnionBboxUpdated?: (bbox: SelectionUnionBbox | null) => void;
}

/** Canvas-specific hooks run around history-driven selection reconcile. */
export interface HistoryRevisionSideEffects {
  beforeReconcile?: () => void;
  onUnionBboxUpdated?: (bbox: SelectionUnionBbox | null) => void;
  afterReconcile?: () => void;
}

/**
 * Centralizes refreshing **Selection** shape snapshots from the **Live tree** after History
 * mutations. Commands should update selection directly when practical; this service is the
 * single reconcile path when the DOM is the source of truth (undo/redo, chrome apply sync).
 */
@Injectable({ providedIn: 'root' })
export class SelectionReconcileService {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly svg = inject(SvgManipulationService);

  /** Bumped after each successful reconcile for optional downstream reactions. */
  readonly reconciledAt = signal(0);

  /**
   * Re-read shape properties for the current selection ids from the live SVG DOM and replace
   * selection snapshots. Returns refreshed shapes, or null when reconcile was skipped.
   */
  reconcileFromLiveTree(options?: ReconcileFromLiveTreeOptions): ShapeProperties[] | null {
    const svg = this.svg.getSVGInstance();
    if (!svg) return null;

    const selected = this.shapeSelection.getSelectedShapes();
    if (selected.length === 0) return null;

    const refreshed = selected.map((shape) => {
      const el = svg.findOne(`#${shape.id}`) as SvgJsElement | undefined;
      return el ? this.svg.getShapeProperties(el) : shape;
    });

    this.shapeSelection.selectShapes(refreshed);
    this.reconciledAt.update((n) => n + 1);

    const ids = refreshed.map((shape) => shape.id);
    const unionBbox = this.svg.getUnionBBox(ids) ?? null;
    options?.onUnionBboxUpdated?.(unionBbox);

    return refreshed;
  }

  /** Entry point for undo/redo: run canvas side effects, then reconcile on the next microtask. */
  onHistoryRevision(sideEffects?: HistoryRevisionSideEffects): void {
    sideEffects?.beforeReconcile?.();
    queueMicrotask(() => {
      this.reconcileFromLiveTree({
        onUnionBboxUpdated: sideEffects?.onUnionBboxUpdated
      });
      sideEffects?.afterReconcile?.();
    });
  }
}
