import { Injectable } from '@angular/core';
import {
  allocateShapeId,
  buildUnionResultPathMarkup,
  foldMartinezUnion,
  geometryHasHoles,
  geometryToRings,
  operandPathToGeometry,
  pathHasClosedSubpaths,
  rootUserRingsToLocalPathD,
  sortPathIdsByDocumentOrder,
  unionPathGeometries,
  type PathBooleanGeometryPort
} from '../models/path-boolean';

export interface PathBooleanUnionResult {
  resultId: string;
  resultMarkup: string;
  operandIds: string[];
  topmostOperandIndex: number;
}

@Injectable({
  providedIn: 'root'
})
export class PathBooleanGeometryService {
  /** Returns local `d` for a union of the given path operands, or null when ineligible / empty. */
  unionLocalD(pathIds: string[], port: PathBooleanGeometryPort): string | null {
    if (pathIds.length < 2) return null;
    for (const id of pathIds) {
      const d = port.getPathD(id);
      if (!d || !pathHasClosedSubpaths(d)) return null;
    }
    const rings = unionPathGeometries(pathIds, port);
    if (!rings) return null;
    return rootUserRingsToLocalPathD(rings);
  }

  /**
   * Compute union geometry and build serialized result `<path>` markup.
   * Operands are sorted front-to-back; style is copied from the topmost operand.
   */
  buildUnionResult(
    pathIds: string[],
    port: PathBooleanGeometryPort,
    usedIds: ReadonlySet<string>,
    topmostInsertionIndex: number
  ): PathBooleanUnionResult | null {
    if (pathIds.length < 2) return null;

    const sorted = sortPathIdsByDocumentOrder(pathIds, port);
    for (const id of sorted) {
      const d = port.getPathD(id);
      if (!d || !pathHasClosedSubpaths(d)) return null;
      if (!port.getPathElement(id)) return null;
    }

    const geometries = sorted
      .map((id) => operandPathToGeometry(id, port))
      .filter((g): g is NonNullable<typeof g> => g !== null);
    if (geometries.length !== sorted.length) return null;

    const unioned = foldMartinezUnion(geometries);
    if (!unioned) return null;

    const rings = geometryToRings(unioned);
    if (rings.length === 0) return null;
    const localD = rootUserRingsToLocalPathD(rings);

    const topmostId = sorted[sorted.length - 1]!;
    const styleSource = port.getPathElement(topmostId);
    if (!styleSource) return null;

    const resultId = allocateShapeId(usedIds);
    const resultMarkup = buildUnionResultPathMarkup(
      resultId,
      localD,
      styleSource,
      geometryHasHoles(unioned)
    );

    return {
      resultId,
      resultMarkup,
      operandIds: sorted,
      topmostOperandIndex: topmostInsertionIndex
    };
  }
}
