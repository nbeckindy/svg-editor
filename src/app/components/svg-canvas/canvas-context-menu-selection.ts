import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';

export interface CanvasContextMenuSelectionDeps {
  getSvgInstance(): Svg | null;
  getNearestGroupAncestorId(id: string): string | null;
  isGroupAClipMaskCarrier(groupId: string): boolean;
  getShapeProperties(el: SvgJsElement): ShapeProperties;
  getShapePropertiesInSameClipGroup(el: SvgJsElement): ShapeProperties[];
  selectShapes(shapes: ShapeProperties[]): void;
  getDrilledIntoGroupId(): string | null;
  setDrilledIntoGroupId(id: string | null): void;
  getSelectedShapeIds(): string[];
}

export interface CanvasContextMenuSelectionResult {
  /** True when the pointer hit a content shape (not empty canvas). */
  hitShape: boolean;
}

/**
 * Resolves selection for a canvas context menu open.
 * - Shape hit, not in current selection: select resolved target (group/clip/drill rules).
 * - Shape hit, already selected: keep multi-selection.
 * - Empty hit: keep selection unchanged.
 */
export function prepareCanvasContextMenuSelection(
  event: MouseEvent,
  deps: CanvasContextMenuSelectionDeps
): CanvasContextMenuSelectionResult {
  const clickTarget = event.target as Element;
  const svgInstance = deps.getSvgInstance();
  const clickedContentShapeEl = clickTarget.id
    ? ((svgInstance?.findOne(`#${clickTarget.id}`) as SvgJsElement | null) ?? undefined)
    : undefined;

  if (!clickedContentShapeEl) {
    return { hitShape: false };
  }

  const selectedIds = new Set(deps.getSelectedShapeIds());
  const resolvedIds = resolveContextMenuTargetIds(clickTarget.id, clickedContentShapeEl, deps);
  const alreadySelected = resolvedIds.some((id) => selectedIds.has(id));

  if (!alreadySelected) {
    applyContextMenuSelection(clickTarget.id, clickedContentShapeEl, deps);
  }

  return { hitShape: true };
}

function resolveContextMenuTargetIds(
  targetId: string,
  svgElement: SvgJsElement,
  deps: CanvasContextMenuSelectionDeps
): string[] {
  const svgInstance = deps.getSvgInstance();
  const nearestGroupId = deps.getNearestGroupAncestorId(targetId);
  const groupIsClipCarrier = nearestGroupId ? deps.isGroupAClipMaskCarrier(nearestGroupId) : false;

  if (nearestGroupId && !groupIsClipCarrier) {
    if (deps.getDrilledIntoGroupId() === nearestGroupId) {
      return deps.getShapePropertiesInSameClipGroup(svgElement).map((s) => s.id);
    }
    return [nearestGroupId];
  }

  return deps.getShapePropertiesInSameClipGroup(svgElement).map((s) => s.id);
}

function applyContextMenuSelection(
  targetId: string,
  svgElement: SvgJsElement,
  deps: CanvasContextMenuSelectionDeps
): void {
  const svgInstance = deps.getSvgInstance();
  const nearestGroupId = deps.getNearestGroupAncestorId(targetId);
  const groupIsClipCarrier = nearestGroupId ? deps.isGroupAClipMaskCarrier(nearestGroupId) : false;

  if (nearestGroupId && !groupIsClipCarrier) {
    if (deps.getDrilledIntoGroupId() === nearestGroupId) {
      deps.selectShapes(deps.getShapePropertiesInSameClipGroup(svgElement));
    } else {
      const groupEl = (svgInstance?.findOne(`#${nearestGroupId}`) as SvgJsElement | null) ?? undefined;
      if (groupEl) {
        deps.selectShapes([deps.getShapeProperties(groupEl)]);
        deps.setDrilledIntoGroupId(null);
      }
    }
  } else {
    deps.selectShapes(deps.getShapePropertiesInSameClipGroup(svgElement));
  }
}
