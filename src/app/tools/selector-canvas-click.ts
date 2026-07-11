import type { ShapeProperties } from '../models/shape-properties.interface';

export interface SelectorCanvasClickDeps {
  getDrilledIntoGroupId: () => string | null;
  setDrilledIntoGroupId: (id: string | null) => void;
  isGroupAClipMaskCarrier: (groupId: string) => boolean;
  getPenClosePostNodeEditEmptyClickClearUntilMs: () => number;
  getNearestGroupAncestorId: (id: string) => string | null;
  getSvgInstance: () => import('@svgdotjs/svg.js').Svg | null;
  resolveClickedContentShape: (clickTarget: Element) => SVGElement | null;
  getShapeProperties: (el: SVGElement) => ShapeProperties;
  getShapePropertiesInSameClipGroup: (el: SVGElement) => ShapeProperties[];
  toggleShapeGroupInSelection: (shapes: ShapeProperties[]) => void;
  selectShapes: (shapes: ShapeProperties[]) => void;
  clearSelection: () => void;
  clearHighlight: () => void;
  consumeSelectionMarqueeJustEnded: () => boolean;
}

/** Selector / node-edit-selector click selection and drill-in policy. */
export function handleSelectorCanvasClick(deps: SelectorCanvasClickDeps, event: MouseEvent): boolean {
  if (deps.consumeSelectionMarqueeJustEnded()) {
    return true;
  }

  const clickTarget = event.target as Element;
  const svgElement = deps.resolveClickedContentShape(clickTarget);

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
        const svgInstance = deps.getSvgInstance();
        const groupEl = svgInstance?.findOne(`#${nearestGroupId}`) as SVGElement | undefined;
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
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    if (now >= deps.getPenClosePostNodeEditEmptyClickClearUntilMs()) {
      deps.clearSelection();
    }
    deps.clearHighlight();
    deps.setDrilledIntoGroupId(null);
  }

  return true;
}
