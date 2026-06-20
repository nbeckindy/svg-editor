import { Injectable, inject } from '@angular/core';
import type { Element as SvgJsElement } from '@svgdotjs/svg.js';
import {
  allocateShapeId,
  buildBooleanResultPathMarkup,
  compoundPathUsesEvenoddFillRule,
  concatenatePathOperandsToLocalD,
  computeBooleanGeometry,
  geometryHasHoles,
  geometryIsEmpty,
  geometryToRings,
  pathHasClosedSubpaths,
  rootUserRingsToLocalPathD,
  sortPathIdsByDocumentOrder,
  sortCompoundOperandIdsByDocumentOrder,
  subtractPathGeometries,
  intersectPathGeometries,
  unionPathGeometries,
  type BooleanOp,
  type PathBooleanGeometryPort
} from '../models/path-boolean';
import { SvgManipulationService } from './svg-manipulation.service';

export interface PathBooleanResult {
  resultId: string;
  resultMarkup: string;
  operandIds: string[];
  topmostOperandIndex: number;
}

/** @deprecated Use {@link PathBooleanResult}. */
export type PathBooleanUnionResult = PathBooleanResult;

@Injectable({
  providedIn: 'root'
})
export class PathBooleanGeometryService {
  private readonly svgManipulation = inject(SvgManipulationService);

  createGeometryPort(): PathBooleanGeometryPort | null {
    const svg = this.svgManipulation.getSVGInstance();
    if (!svg) return null;
    return {
      getPathElement: (id) => {
        const node = svg.findOne(`#${id}`)?.node as Element | undefined;
        return node?.tagName.toLowerCase() === 'path' ? node : null;
      },
      getCompoundOperandElement: (id) => {
        const node = svg.findOne(`#${id}`)?.node as Element | undefined;
        const tag = node?.tagName.toLowerCase();
        if (tag === 'path' || tag === 'rect' || tag === 'circle' || tag === 'ellipse') {
          return node ?? null;
        }
        return null;
      },
      getPathD: (id) => {
        const el = svg.findOne(`#${id}`)?.node as Element | undefined;
        return el?.tagName.toLowerCase() === 'path' ? el.getAttribute('d') : null;
      },
      mapPathLocalToRootUser: (id, lx, ly) =>
        this.svgManipulation.mapPathLocalToRootUser(id, lx, ly),
      mapRootUserToPathLocal: (id, rx, ry) =>
        this.svgManipulation.mapRootUserToPathLocal(id, rx, ry)
    };
  }

  private localDForOp(op: BooleanOp, pathIds: string[], port: PathBooleanGeometryPort): string | null {
    if (pathIds.length < 2) return null;
    for (const id of pathIds) {
      const d = port.getPathD(id);
      if (!d || !pathHasClosedSubpaths(d)) return null;
    }
    const rings =
      op === 'union'
        ? unionPathGeometries(pathIds, port)
        : op === 'subtract'
          ? subtractPathGeometries(pathIds, port)
          : intersectPathGeometries(pathIds, port);
    if (!rings) return null;
    return rootUserRingsToLocalPathD(rings);
  }

  /** Returns local `d` for a union of the given path operands, or null when ineligible / empty. */
  unionLocalD(pathIds: string[], port: PathBooleanGeometryPort): string | null {
    return this.localDForOp('union', pathIds, port);
  }

  subtractLocalD(pathIds: string[], port: PathBooleanGeometryPort): string | null {
    return this.localDForOp('subtract', pathIds, port);
  }

  intersectLocalD(pathIds: string[], port: PathBooleanGeometryPort): string | null {
    return this.localDForOp('intersect', pathIds, port);
  }

  /**
   * Compute boolean geometry and build serialized result `<path>` markup.
   * Operands are sorted front-to-back; style is copied from the topmost operand.
   */
  buildBooleanResult(
    op: BooleanOp,
    pathIds: string[],
    port: PathBooleanGeometryPort,
    usedIds: ReadonlySet<string>,
    topmostInsertionIndex: number
  ): PathBooleanResult | null {
    if (pathIds.length < 2) return null;

    const sorted = sortPathIdsByDocumentOrder(pathIds, port);
    for (const id of sorted) {
      const d = port.getPathD(id);
      if (!d || !pathHasClosedSubpaths(d)) return null;
      if (!port.getPathElement(id)) return null;
    }

    const geometry = computeBooleanGeometry(op, sorted, port);
    if (!geometry || geometryIsEmpty(geometry)) return null;

    const rings = geometryToRings(geometry);
    if (rings.length === 0) return null;
    const localD = rootUserRingsToLocalPathD(rings);

    const topmostId = sorted[sorted.length - 1]!;
    const styleSource = port.getPathElement(topmostId);
    if (!styleSource) return null;

    const resultId = allocateShapeId(usedIds);
    const resultMarkup = buildBooleanResultPathMarkup(
      resultId,
      localD,
      styleSource,
      geometryHasHoles(geometry)
    );

    return {
      resultId,
      resultMarkup,
      operandIds: sorted,
      topmostOperandIndex: topmostInsertionIndex
    };
  }

  /**
   * Combine operands into one compound `<path>` (concatenated subpaths, no boolean clip).
   * Style is copied from the topmost operand.
   */
  buildCompoundPathResult(
    pathIds: string[],
    port: PathBooleanGeometryPort,
    usedIds: ReadonlySet<string>,
    topmostInsertionIndex: number
  ): PathBooleanResult | null {
    if (pathIds.length < 2) return null;

    const sorted = sortCompoundOperandIdsByDocumentOrder(pathIds, port);
    for (const id of sorted) {
      if (!port.getCompoundOperandElement(id)) return null;
    }

    const localD = concatenatePathOperandsToLocalD(sorted, port);
    if (!localD) return null;

    const topmostId = sorted[sorted.length - 1]!;
    const styleSource = port.getCompoundOperandElement(topmostId);
    if (!styleSource) return null;

    const resultId = allocateShapeId(usedIds);
    const resultMarkup = buildBooleanResultPathMarkup(
      resultId,
      localD,
      styleSource,
      compoundPathUsesEvenoddFillRule(sorted, port)
    );

    return {
      resultId,
      resultMarkup,
      operandIds: sorted,
      topmostOperandIndex: topmostInsertionIndex
    };
  }

  /** @deprecated Use {@link buildBooleanResult}. */
  buildUnionResult(
    pathIds: string[],
    port: PathBooleanGeometryPort,
    usedIds: ReadonlySet<string>,
    topmostInsertionIndex: number
  ): PathBooleanResult | null {
    return this.buildBooleanResult('union', pathIds, port, usedIds, topmostInsertionIndex);
  }
}
