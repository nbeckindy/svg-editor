import { copyPresentationAttrsFromElement } from './path-boolean';
import { parsePathDForNodeEditing, pathSegmentsToD } from './path-d';
import {
  isOutlineToPathPrimitiveType,
  primitiveElementToPathSegments
} from './primitive-to-path';

export interface OutlineToPathSelectionShape {
  id: string;
  type: string;
}

export interface OutlineToPathSelectionState {
  eligible: boolean;
  reason: string;
  shapeId: string | null;
  hasRoundedCorners: boolean;
}

export function evaluateOutlineToPathSelection(
  isSelectorMode: boolean,
  shapes: readonly OutlineToPathSelectionShape[],
  isLocked: (shapeId: string) => boolean,
  getElement: (shapeId: string) => Element | null
): OutlineToPathSelectionState {
  const ineligible = (
    reason: string,
    shapeId: string | null = null,
    hasRoundedCorners = false
  ): OutlineToPathSelectionState => ({
    eligible: false,
    reason,
    shapeId,
    hasRoundedCorners
  });

  if (!isSelectorMode) {
    return ineligible('Switch to the selector tool.');
  }
  if (shapes.length === 0) {
    return ineligible('Select a primitive shape to convert to a path.');
  }
  if (shapes.length > 1) {
    return ineligible('Select a single shape to outline to path.');
  }

  const shape = shapes[0]!;
  if (isLocked(shape.id)) {
    return ineligible('Selection includes a locked layer.', shape.id);
  }
  if (shape.type === 'path') {
    return ineligible('Selected shape is already a path.', shape.id);
  }
  if (shape.type === 'g') {
    return ineligible('Groups cannot be outlined to path. Select a single shape inside the group.', shape.id);
  }
  if (!isOutlineToPathPrimitiveType(shape.type)) {
    return ineligible(
      'Only rectangles, circles, ellipses, lines, polylines, and polygons can be outlined to path.',
      shape.id
    );
  }

  const element = getElement(shape.id);
  if (!element) {
    return ineligible('Selected shape could not be read from the document.', shape.id);
  }

  const segments = primitiveElementToPathSegments(element);
  if (!segments || segments.length === 0) {
    return ineligible('Selected shape has invalid geometry for outline to path.', shape.id);
  }

  const d = pathSegmentsToD(segments);
  if (!parsePathDForNodeEditing(d)) {
    return ineligible('Selected shape could not be converted to an editable path.', shape.id);
  }

  const hasRoundedCorners =
    element.tagName.toLowerCase() === 'rect' &&
    (parseLengthAttr(element, 'rx') > 0 || parseLengthAttr(element, 'ry') > 0);

  return {
    eligible: true,
    reason: '',
    shapeId: shape.id,
    hasRoundedCorners
  };
}

function parseLengthAttr(el: Element, name: string): number {
  const raw = el.getAttribute(name);
  if (raw == null || raw.trim() === '') return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Build replacement `<path>` markup preserving id, transform, paint, and layer name. */
export function buildOutlineToPathMarkup(element: Element): string | null {
  const segments = primitiveElementToPathSegments(element);
  if (!segments || segments.length === 0) return null;

  const d = pathSegmentsToD(segments);
  if (!parsePathDForNodeEditing(d)) return null;

  const id = element.getAttribute('id');
  if (!id) return null;

  const svgNs = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(svgNs, 'path');
  path.setAttribute('id', id);
  path.setAttribute('d', d);
  copyPresentationAttrsFromElement(element, path);

  if (element.hasAttribute('transform')) {
    path.setAttribute('transform', element.getAttribute('transform')!);
  }
  if (element.hasAttribute('class')) {
    path.setAttribute('class', element.getAttribute('class')!);
  }
  if (element.hasAttribute('data-name')) {
    path.setAttribute('data-name', element.getAttribute('data-name')!);
  }

  return path.outerHTML;
}
