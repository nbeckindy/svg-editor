import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement, Matrix, Point } from '@svgdotjs/svg.js';
import { computeScaleAnchorFromUnionResize, type ResizeHandle } from '../utils/selection-resize';
import {
  localBBoxToRootUserAabb,
  localPointToRootUser,
  rootUserPointToLocalPoint,
  screenRectToRootSvgUserRect
} from '../utils/svg-screen-user';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import type { SvgSelectionGeometryPort } from './svg-selection-geometry.port';

@Injectable({ providedIn: 'root' })
export class SvgSelectionGeometryService implements SvgSelectionGeometryPort {
  private readonly doc = inject(SvgEditorDocumentService);

  getShapeBBox(
    shapeId: string,
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    const preferScreenBounds = options?.preferScreenBounds !== false;
    if (!this.doc.getSVGInstance()) return null;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement;
    if (!shape?.node) return null;
    const node = shape.node as SVGGraphicsElement;
    const rootSvg = this.doc.getSVGInstance()!.node as SVGSVGElement | null;

    // Painted bounds (default): `getBBox()` ignores clip-path; screen rect matches what the user sees.
    if (
      preferScreenBounds &&
      rootSvg &&
      typeof node.getBoundingClientRect === 'function' &&
      typeof rootSvg.getBoundingClientRect === 'function'
    ) {
      const rr = rootSvg.getBoundingClientRect();
      const sr = node.getBoundingClientRect();
      if (
        rr.width > 0 &&
        rr.height > 0 &&
        sr.width > 0 &&
        sr.height > 0 &&
        Number.isFinite(sr.left) &&
        Number.isFinite(sr.top)
      ) {
        const fromCtm = screenRectToRootSvgUserRect(rootSvg, sr);
        if (fromCtm) {
          return fromCtm;
        }
        // Legacy linear map (wrong for letterboxed `meet` / non-uniform `none`); kept if CTM APIs are missing.
        const vbAttr = rootSvg.getAttribute('viewBox') || this.doc.getDocumentViewBox();
        const parts = vbAttr.split(/\s+/);
        const vbMinX = parts.length >= 4 ? Number(parts[0]) || 0 : 0;
        const vbMinY = parts.length >= 4 ? Number(parts[1]) || 0 : 0;
        const vbW = parts.length >= 4 ? Number(parts[2]) || 100 : 100;
        const vbH = parts.length >= 4 ? Number(parts[3]) || 100 : 100;
        const x = vbMinX + ((sr.left - rr.left) / rr.width) * vbW;
        const y = vbMinY + ((sr.top - rr.top) / rr.height) * vbH;
        const width = (sr.width / rr.width) * vbW;
        const height = (sr.height / rr.height) * vbH;
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          return { x, y, width, height };
        }
      }
    }

    // Local `getBBox()` × `getTransformToElement(root)`: full chain to root SVG user space
    // (parent `<g>` transforms, not only this node’s `transform` — unlike SVG.js `matrixify()`).
    if (rootSvg && typeof node.getBBox === 'function') {
      try {
        const local = node.getBBox();
        const fromDom = localBBoxToRootUserAabb(node, rootSvg, local);
        const isImage = node.tagName?.toLowerCase() === 'image';
        const degenerate = fromDom && (fromDom.width <= 0 || fromDom.height <= 0);
        // Do not use a zero-area `getBBox()` for `<image>` (bitmap not decoded / jsdom); use
        // layout attrs × transform below instead (ADR 0001 layout box for tools).
        if (
          fromDom &&
          Number.isFinite(fromDom.width) &&
          Number.isFinite(fromDom.height) &&
          fromDom.width >= 0 &&
          fromDom.height >= 0 &&
          !(isImage && degenerate)
        ) {
          return fromDom;
        }
      } catch {
        // fall through: e.g. jsdom / detached node
      }
    }

    // `<image>`: x/y/width/height layout box in root user space when `getBBox()` is unusable
    // (decoder, letterbox edge cases, test env). Aligns selection union with the opaque hit box.
    if (rootSvg && node.tagName?.toLowerCase() === 'image') {
      const img = node as SVGImageElement;
      const wAttr = img.getAttribute('width');
      const hAttr = img.getAttribute('height');
      const lw = wAttr != null && wAttr !== '' ? parseFloat(wAttr) : Number.NaN;
      const lh = hAttr != null && hAttr !== '' ? parseFloat(hAttr) : Number.NaN;
      const xAttr = img.getAttribute('x');
      const yAttr = img.getAttribute('y');
      const lx = xAttr != null && xAttr !== '' ? parseFloat(xAttr) : 0;
      const ly = yAttr != null && yAttr !== '' ? parseFloat(yAttr) : 0;
      if (Number.isFinite(lw) && Number.isFinite(lh) && lw > 0 && lh > 0) {
        try {
          const localRect = { x: lx, y: ly, width: lw, height: lh } as DOMRect;
          const aabb = localBBoxToRootUserAabb(img, rootSvg, localRect);
          if (
            aabb &&
            Number.isFinite(aabb.width) &&
            Number.isFinite(aabb.height) &&
            aabb.width > 0 &&
            aabb.height > 0
          ) {
            return aabb;
          }
        } catch {
          /* fall through */
        }
      }
    }

    // svg.js bbox() × matrixify(): fallback when `getTransformToElement` is unavailable (no full
    // ancestor chain), same as before.
    if (typeof shape.bbox === 'function' && typeof shape.matrixify === 'function') {
      try {
        const local = shape.bbox();
        const m = shape.matrixify();
        if (local && typeof local.isNulled === 'function' && !local.isNulled() && m) {
          const tb = local.transform(m);
          const w = tb.width ?? tb.w;
          const h = tb.height ?? tb.h;
          if (Number.isFinite(w) && Number.isFinite(h) && w >= 0 && h >= 0) {
            return { x: tb.x, y: tb.y, width: w, height: h };
          }
        }
      } catch {
        // fall through to native getBBox
      }
    }
    if (typeof node.getBBox !== 'function') return null;
    const bbox = node.getBBox();
    return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
  }

  /**
   * Union of bounding boxes for the given shape ids. Returns null if no valid bboxes.
   * @see getShapeBBox for `options.preferScreenBounds`
   */
  getUnionBBox(
    shapeIds: string[],
    options?: { preferScreenBounds?: boolean }
  ): { x: number; y: number; width: number; height: number } | null {
    const bboxes = shapeIds
      .map((id) => this.getShapeBBox(id, options))
      .filter((b): b is { x: number; y: number; width: number; height: number } => b != null);
    if (bboxes.length === 0) return null;
    if (bboxes.length === 1) return bboxes[0];
    const minX = Math.min(...bboxes.map((b) => b.x));
    const minY = Math.min(...bboxes.map((b) => b.y));
    const maxX = Math.max(...bboxes.map((b) => b.x + b.width));
    const maxY = Math.max(...bboxes.map((b) => b.y + b.height));
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  getSelectionRotationPivot(shapeIds: string[]): { x: number; y: number } | null {
    if (!this.doc.getSVGInstance() || shapeIds.length === 0) return null;
    const pts: { x: number; y: number }[] = [];
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!shape || typeof shape.bbox !== 'function' || typeof shape.matrixify !== 'function') continue;
      try {
        const local = shape.bbox();
        const m = shape.matrixify();
        if (!local || !m) continue;
        const w = local.w ?? local.width;
        const h = local.h ?? local.height;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
        const cx = Number.isFinite(local.cx) ? local.cx : local.x + w / 2;
        const cy = Number.isFinite(local.cy) ? local.cy : local.y + h / 2;
        const v = m.valueOf() as { a: number; b: number; c: number; d: number; e: number; f: number };
        pts.push({
          x: v.a * cx + v.c * cy + v.e,
          y: v.b * cx + v.d * cy + v.f
        });
      } catch {
        /* skip */
      }
    }
    if (pts.length === 0) {
      const u = this.getUnionBBox(shapeIds);
      return u ? { x: u.x + u.width / 2, y: u.y + u.height / 2 } : null;
    }
    const sx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const sy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: sx, y: sy };
  }

  /**
   * Clone each shape's current transform matrix for resize commit (SVG.js).
   */
  snapshotSelectionTransforms(shapeIds: string[]): Map<string, Matrix> {
    const map = new Map<string, Matrix>();
    if (!this.doc.getSVGInstance()) return map;
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (shape && typeof shape.matrix === 'function') {
        map.set(id, shape.matrix().clone());
      }
    }
    return map;
  }

  /**
   * Map path `d` coordinates (element-local) to root SVG user space (selection / viewBox space).
   * Uses DOM `getTransformToElement` when available; otherwise composes `matrixify()` up to the
   * SVG.js document root (covers jsdom and matches parent-`<g>` transforms).
   */
  mapPathLocalToRootUser(shapeId: string, lx: number, ly: number): { x: number; y: number } {
    if (!this.doc.getSVGInstance()) return { x: lx, y: ly };
    const rootSvg = this.doc.getSVGInstance()!.node as SVGSVGElement;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return { x: lx, y: ly };
    const domPt = localPointToRootUser(shape.node as SVGGraphicsElement, rootSvg, lx, ly);
    if (domPt) return domPt;
    try {
      const M = this.composePathLocalToRootMatrix(shapeId);
      if (!M) return { x: lx, y: ly };
      const p = new Point(lx, ly).transform(M);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: lx, y: ly };
      return { x: p.x, y: p.y };
    } catch {
      return { x: lx, y: ly };
    }
  }

  /** Inverse of {@link mapPathLocalToRootUser} for pointer-driven node edits. */
  mapRootUserToPathLocal(shapeId: string, rx: number, ry: number): { x: number; y: number } | null {
    if (!this.doc.getSVGInstance()) return null;
    const rootSvg = this.doc.getSVGInstance()!.node as SVGSVGElement;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return null;
    const domPt = rootUserPointToLocalPoint(shape.node as SVGGraphicsElement, rootSvg, rx, ry);
    if (domPt) return domPt;
    try {
      const M = this.composePathLocalToRootMatrix(shapeId);
      if (!M) return null;
      const inv = M.inverse();
      if (!inv) return null;
      const p = new Point(rx, ry).transform(inv);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      return { x: p.x, y: p.y };
    } catch {
      return null;
    }
  }

  private composePathLocalToRootMatrix(shapeId: string): Matrix | null {
    if (!this.doc.getSVGInstance()) return null;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape || typeof shape.matrixify !== 'function') return null;
    let M = shape.matrixify();
    let parent = shape.parent() as SvgJsElement | undefined;
    while (parent && parent !== this.doc.getSVGInstance() && typeof parent.matrixify === 'function') {
      M = parent.matrixify().multiply(M);
      parent = parent.parent() as SvgJsElement | undefined;
    }
    return M;
  }

  /**
   * Depth-first node list: root first, then `find('*')` order (matches restore walk).
   */
  private getOrderedSubtreeNodes(root: SvgJsElement): SvgJsElement[] {
    const found = root.find('*') as SvgJsElement[];
    const rest = Array.isArray(found) ? found : [];
    return [root, ...rest];
  }

  /**
   * Captures `vector-effect` on each node in every selected subtree (for undo after resize).
   */
  snapshotVectorEffectsForShapes(shapeIds: string[]): Map<string, (string | null)[]> {
    const map = new Map<string, (string | null)[]>();
    if (!this.doc.getSVGInstance()) return map;
    for (const id of shapeIds) {
      const el = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!el) continue;
      const nodes = this.getOrderedSubtreeNodes(el);
      map.set(
        id,
        nodes.map((n) => (n.node as SVGElement).getAttribute('vector-effect'))
      );
    }
    return map;
  }

  /**
   * Restores `vector-effect` attributes from {@link snapshotVectorEffectsForShapes}.
   */
  restoreVectorEffectsForShapeSubtrees(
    shapeIds: string[],
    snapshots: Map<string, (string | null)[]>
  ): void {
    if (!this.doc.getSVGInstance()) return;
    for (const id of shapeIds) {
      const el = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const values = snapshots.get(id);
      if (!el || !values) continue;
      const nodes = this.getOrderedSubtreeNodes(el);
      for (let i = 0; i < Math.min(nodes.length, values.length); i++) {
        const v = values[i];
        const node = nodes[i];
        if (v == null || v === '') {
          node.attr('vector-effect', null);
        } else {
          node.attr('vector-effect', v);
        }
      }
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Removes `vector-effect="non-scaling-stroke"` so stroke width scales with `transform`
   * (default SVG behavior). Overlay chrome keeps non-scaling strokes separately.
   */
  private stripNonScalingStrokeFromShapeSubtrees(shapeIds: string[]): void {
    if (!this.doc.getSVGInstance()) return;
    for (const id of shapeIds) {
      const el = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!el) continue;
      for (const node of this.getOrderedSubtreeNodes(el)) {
        const dom = node.node as SVGElement;
        if (dom.getAttribute('vector-effect') === 'non-scaling-stroke') {
          node.attr('vector-effect', null);
        }
      }
    }
  }

  /**
   * Apply uniform scale about the fixed anchor (opposite corner) for proportional resize.
   * Composes: newMatrix = scale(s,s,ax,ay) * snapshotMatrix
   *
   * **Stroke policy:** scaling stroke with the shape is the product default; any
   * `vector-effect="non-scaling-stroke"` on affected subtrees is cleared so undo can
   * restore it via {@link restoreVectorEffectsForShapeSubtrees}.
   */
  applyUnionScaleFromSnapshot(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>,
    handle: ResizeHandle
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const { sx, sy, ax, ay } = computeScaleAnchorFromUnionResize(handle, unionBefore, unionAfter);
    const eps = 1e-9;
    if (!Number.isFinite(sx) || !Number.isFinite(sy) || Math.abs(sx) < eps || Math.abs(sy) < eps) return;
    const T = new Matrix().scale(sx, sy, ax, ay);
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
    this.stripNonScalingStrokeFromShapeSubtrees(shapeIds);
    this.doc.bumpDocumentRevision();
  }

  applyUnionScaleFromCenter(
    shapeIds: string[],
    unionBefore: { x: number; y: number; width: number; height: number },
    unionAfter: { x: number; y: number; width: number; height: number },
    snapshot: Map<string, Matrix>
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const s = unionAfter.width / unionBefore.width;
    if (!Number.isFinite(s) || s === 0) return;
    const cx = unionBefore.x + unionBefore.width / 2;
    const cy = unionBefore.y + unionBefore.height / 2;
    const T = new Matrix().scale(s, s, cx, cy);
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
    this.stripNonScalingStrokeFromShapeSubtrees(shapeIds);
    this.doc.bumpDocumentRevision();
  }

  /**
   * Apply rotation about a pivot in root SVG user space (same as union bbox / pointer mapping).
   * Composes: newMatrix = rotate(deg,cx,cy) * snapshotMatrix (`angleDeg` in degrees, SVG.js convention).
   */
  applyUnionRotationFromSnapshot(
    shapeIds: string[],
    pivot: { x: number; y: number },
    angleDeg: number,
    snapshot: Map<string, Matrix>
  ): void {
    if (!this.doc.getSVGInstance()) return;
    if (!Number.isFinite(angleDeg)) return;
    const T = new Matrix().rotate(angleDeg, pivot.x, pivot.y);
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      shape.matrix(T.multiply(prev));
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Apply skew about a pivot in root SVG user space: `newMatrix = skew(axis) * snapshotMatrix`.
   */
  applyUnionSkewFromSnapshot(
    shapeIds: string[],
    axis: 'x' | 'y',
    angleDeg: number,
    pivot: { x: number; y: number },
    snapshot: Map<string, Matrix>
  ): void {
    if (!this.doc.getSVGInstance()) return;
    if (!Number.isFinite(angleDeg)) return;
    const T =
      axis === 'x'
        ? new Matrix().skewX(angleDeg, pivot.x, pivot.y)
        : new Matrix().skewY(angleDeg, pivot.x, pivot.y);
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const prev = snapshot.get(id);
      if (!shape || typeof shape.matrix !== 'function' || !prev) continue;
      const next = T.multiply(prev);
      const v = next.valueOf() as { a: number; b: number; c: number; d: number; e: number; f: number };
      if (
        !Number.isFinite(v.a) ||
        !Number.isFinite(v.b) ||
        !Number.isFinite(v.c) ||
        !Number.isFinite(v.d) ||
        !Number.isFinite(v.e) ||
        !Number.isFinite(v.f)
      ) {
        continue;
      }
      shape.matrix(next);
    }
    this.doc.bumpDocumentRevision();
  }

  restoreSelectionTransformsFromSnapshot(shapeIds: string[], snapshot: Map<string, Matrix>): void {
    if (!this.doc.getSVGInstance()) return;
    for (const id of shapeIds) {
      const shape = this.doc.getSVGInstance()!.findOne(`#${id}`) as SvgJsElement | undefined;
      const saved = snapshot.get(id);
      if (shape && saved && typeof shape.matrix === 'function') {
        shape.matrix(saved);
      }
    }
  }

}
