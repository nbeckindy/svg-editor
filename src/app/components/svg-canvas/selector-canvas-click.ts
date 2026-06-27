import type { Svg, Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';

/**
 * Ports for selector **Tool** primary-click **Selection** policy (group ancestor select,
 * clip-carrier bypass, drill-in child select, additive modifiers, empty-hit clear).
 */
export interface SelectorCanvasClickDeps {
  getSvgInstance(): Svg | null;
  getNearestGroupAncestorId(id: string): string | null;
  isGroupAClipMaskCarrier(groupId: string): boolean;
  getShapeProperties(el: SvgJsElement): ShapeProperties;
  getShapePropertiesInSameClipGroup(el: SvgJsElement): ShapeProperties[];
  selectShapes(shapes: ShapeProperties[]): void;
  toggleShapeGroupInSelection(shapes: ShapeProperties[]): void;
  clearSelection(): void;
  clearHighlight(): void;
  getDrilledIntoGroupId(): string | null;
  setDrilledIntoGroupId(id: string | null): void;
  consumeSelectionMarqueeJustEnded(): boolean;
  /** When true, empty-hit click must not clear **Selection** (pen-close trailing click guard). */
  shouldSkipEmptyHitSelectionClear(): boolean;
}

/** Handles selector primary click; returns true when the event is consumed. */
export function handleSelectorCanvasClick(
  event: MouseEvent,
  deps: SelectorCanvasClickDeps
): boolean {
  if (deps.consumeSelectionMarqueeJustEnded()) {
    return true;
  }

  const clickTarget = event.target as Element;
  const svgInstance = deps.getSvgInstance();
  const clickedContentShapeEl = clickTarget.id
    ? ((svgInstance?.findOne(`#${clickTarget.id}`) as SvgJsElement | null) ?? undefined)
    : undefined;
  const svgElement = clickedContentShapeEl;

  if (svgElement) {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nearestGroupId = deps.getNearestGroupAncestorId(clickTarget.id);
    const groupIsClipCarrier = nearestGroupId ? deps.isGroupAClipMaskCarrier(nearestGroupId) : false;

    if (nearestGroupId && !groupIsClipCarrier) {
      if (deps.getDrilledIntoGroupId() === nearestGroupId) {
        const expanded = deps.getShapePropertiesInSameClipGroup(svgElement);
        if (additive) {
          deps.toggleShapeGroupInSelection(expanded);
        } else {
          deps.selectShapes(expanded);
        }
      } else {
        const groupEl = (svgInstance?.findOne(`#${nearestGroupId}`) as SvgJsElement | null) ?? undefined;
        if (groupEl) {
          const groupProps = deps.getShapeProperties(groupEl);
          if (additive) {
            deps.toggleShapeGroupInSelection([groupProps]);
          } else {
            deps.selectShapes([groupProps]);
          }
          deps.setDrilledIntoGroupId(null);
        }
      }
    } else {
      const expanded = deps.getShapePropertiesInSameClipGroup(svgElement);
      if (additive) {
        deps.toggleShapeGroupInSelection(expanded);
      } else {
        deps.selectShapes(expanded);
      }
    }
  } else {
    if (!deps.shouldSkipEmptyHitSelectionClear()) {
      deps.clearSelection();
    }
    deps.clearHighlight();
    deps.setDrilledIntoGroupId(null);
  }

  return true;
}
