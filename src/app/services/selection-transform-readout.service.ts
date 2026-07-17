import { Injectable, computed, inject } from '@angular/core';
import { Element as SvgJsElement, Matrix } from '@svgdotjs/svg.js';
import { ShapeSelectionService } from './shape-selection.service';
import { SELECTION_TRANSFORM_READOUT_SVG_PORT } from './manipulation-port-tokens';
import { EditorHistoryService } from './editor-history.service';
import {
  ROTATION_MIXED_EPS_DEG,
  SKEW_MIXED_EPS_DEG,
  isFinitePositiveDim,
  rotationDeg0To360FromMatrix,
  rotationDiffDeg,
  skewDegFromMatrix
} from '../utils/selection-transform-matrix';

/** Chrome readout for **Selection** cumulative transforms (union bbox + per-element matrix), not canvas gesture preview. */
@Injectable({
  providedIn: 'root'
})
export class SelectionTransformReadoutService {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly svg = inject(SELECTION_TRANSFORM_READOUT_SVG_PORT);
  private readonly editorHistory = inject(EditorHistoryService);

  /**
   * Matrix-derived skew angles (degrees). Approximate when rotation and skew are combined.
   * `skewX ≈ atan2(c, a)`, `skewY ≈ atan2(b, d)` in root transform space.
   */
  readonly selectionSkewReadout = computed(() => {
    this.editorHistory.revision();
    this.svg.documentRevision();

    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length === 0) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const svg = this.svg.getSVGInstance();
    if (!svg) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const pairs: { sx: number; sy: number }[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!el || typeof el.matrix !== 'function') continue;
      const m = el.matrix() as Matrix;
      const { skewX, skewY } = skewDegFromMatrix(m);
      if (!Number.isFinite(skewX) || !Number.isFinite(skewY)) continue;
      pairs.push({ sx: skewX, sy: skewY });
    }

    if (pairs.length === 0) {
      return { skewX: '—' as const, skewY: '—' as const };
    }

    const fmt = (n: number) => `${n.toFixed(1)}°`;
    const sx0 = pairs[0].sx;
    const sy0 = pairs[0].sy;
    const skewX =
      shapes.length > 1 && pairs.some((p) => Math.abs(p.sx - sx0) > SKEW_MIXED_EPS_DEG)
        ? ('Mixed' as const)
        : fmt(sx0);
    const skewY =
      shapes.length > 1 && pairs.some((p) => Math.abs(p.sy - sy0) > SKEW_MIXED_EPS_DEG)
        ? ('Mixed' as const)
        : fmt(sy0);
    return { skewX, skewY };
  });

  /**
   * Read-only X/Y/W/H from union bbox in root SVG user space (`getUnionBBox`), and R from
   * per-element matrix rotation. Multi-select: union bbox; R is **Mixed** when per-shape angles differ.
   */
  readonly selectionTransformReadout = computed(() => {
    this.editorHistory.revision();
    this.svg.documentRevision();

    const dash = '—' as const;
    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length === 0) {
      return { x: dash, y: dash, w: dash, h: dash, r: dash };
    }

    const ids = shapes.map((s) => s.id);
    const union = this.svg.getUnionBBox(ids);
    const fmtNum = (n: number) => n.toFixed(1);

    const xStr = union ? fmtNum(union.x) : dash;
    const yStr = union ? fmtNum(union.y) : dash;
    const wStr = union ? fmtNum(union.width) : dash;
    const hStr = union ? fmtNum(union.height) : dash;

    const svg = this.svg.getSVGInstance();
    if (!svg) {
      return { x: xStr, y: yStr, w: wStr, h: hStr, r: dash };
    }

    const angles: number[] = [];
    for (const s of shapes) {
      const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
      if (!el || typeof el.matrix !== 'function') continue;
      const m = el.matrix() as Matrix;
      const deg = rotationDeg0To360FromMatrix(m);
      if (!Number.isFinite(deg)) continue;
      angles.push(deg);
    }

    let rStr: string = dash;
    if (angles.length > 0) {
      const r0 = angles[0];
      const eps = ROTATION_MIXED_EPS_DEG;
      const mixed =
        shapes.length > 1 && angles.some((deg) => rotationDiffDeg(deg, r0) > eps);
      rStr = mixed ? 'Mixed' : `${fmtNum(r0)}°`;
    }

    return { x: xStr, y: yStr, w: wStr, h: hStr, r: rStr };
  });

  /**
   * Numeric X/Y/W/H and rotation for bbox inputs (union bbox in root SVG user space).
   * When the union is missing or degenerate, inputs are shown disabled (`ok: false`).
   */
  readonly selectionBBoxFieldModel = computed(() => {
    this.editorHistory.revision();
    this.svg.documentRevision();

    const shapes = this.shapeSelection.selectedShapes();
    if (shapes.length === 0) {
      return null;
    }

    const ids = shapes.map((s) => s.id);
    const union = this.svg.getUnionBBox(ids);
    if (!union || !isFinitePositiveDim(union.width) || !isFinitePositiveDim(union.height)) {
      return { ok: false as const, ids };
    }

    const svg = this.svg.getSVGInstance();
    let rDeg: number | null = null;
    let rMixed = false;
    if (svg) {
      const angles: number[] = [];
      for (const s of shapes) {
        const el = svg.findOne(`#${s.id}`) as SvgJsElement | undefined;
        if (!el || typeof el.matrix !== 'function') continue;
        const m = el.matrix() as Matrix;
        const deg = rotationDeg0To360FromMatrix(m);
        if (!Number.isFinite(deg)) continue;
        angles.push(deg);
      }
      if (angles.length > 0) {
        const r0 = angles[0];
        const eps = ROTATION_MIXED_EPS_DEG;
        rMixed = shapes.length > 1 && angles.some((deg) => rotationDiffDeg(deg, r0) > eps);
        rDeg = rMixed ? null : r0;
      }
    }

    return {
      ok: true as const,
      ids,
      union,
      x: union.x,
      y: union.y,
      w: union.width,
      h: union.height,
      rDeg,
      rMixed
    };
  });
}
