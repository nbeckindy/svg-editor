import type { ShapeProperties } from '../models/shape-properties.interface';
import type {
  EyedropperPaintChannel,
  EyedropperPaintSample
} from '../models/eyedropper-paint-sample';
import {
  firstStopColor,
  parsePaintReferenceId,
  type EditableGradientModel
} from '../models/svg-gradient';
import { CONTENT_SHAPE_SELECTOR } from '../services/svg-editor-stage.constants';

const CONTENT_SHAPE_TAGS = new Set(
  CONTENT_SHAPE_SELECTOR.split(',').map((s) => s.trim().toLowerCase())
);

/**
 * Walk up from a hit-test node to the nearest content shape (rect, path, text, …).
 */
export function resolveContentShapeElement(el: Element): Element | null {
  let current: Element | null = el;
  while (current) {
    if (CONTENT_SHAPE_TAGS.has(current.tagName.toLowerCase())) {
      return current;
    }
    if (current.hasAttribute('data-editor-content-group')) return null;
    current = current.parentElement;
  }
  return null;
}

/**
 * Build an eyedropper sample from shape properties, resolving gradient defs via `readGradient`.
 */
export function buildEyedropperPaintSample(
  props: ShapeProperties,
  readGradient: (gradientId: string) => EditableGradientModel | null
): EyedropperPaintSample {
  return {
    fill: channelFromProps(props, 'fill', readGradient),
    fillOpacity: props.fillOpacity ?? 1,
    stroke: channelFromProps(props, 'stroke', readGradient),
    strokeWidth: props.strokeWidth ?? 0,
    strokeOpacity: props.strokeOpacity ?? 1,
    strokeDasharray: props.strokeDasharray ?? '',
    strokeDashoffset: props.strokeDashoffset ?? 0
  };
}

function channelFromProps(
  props: ShapeProperties,
  paint: 'fill' | 'stroke',
  readGradient: (gradientId: string) => EditableGradientModel | null
): EyedropperPaintChannel | null {
  const paintType = paint === 'fill' ? props.fillPaintType : props.strokePaintType;
  const solid = paint === 'fill' ? props.fill : props.stroke;
  const url = paint === 'fill' ? props.fillUrl : props.strokeUrl;
  const strokeWidth = props.strokeWidth ?? 0;

  if (paintType === 'pattern') {
    return null;
  }

  if (paintType === 'gradient') {
    const id = parsePaintReferenceId(url ?? undefined);
    const model = id ? readGradient(id) : null;
    if (!model) return null;
    return {
      kind: 'gradient',
      solid: firstStopColor(model),
      gradient: {
        ...model,
        stops: model.stops.map((s) => ({ ...s }))
      }
    };
  }

  if (paint === 'stroke' && (paintType === 'none' || strokeWidth <= 0 || !solid)) {
    return { kind: 'none' };
  }

  if (paintType === 'none' || !solid || solid.toLowerCase() === 'none') {
    return { kind: 'none' };
  }

  return { kind: 'solid', solid };
}

/** Deep-ish copy of a gradient model with a new defs id. */
export function cloneGradientModelWithId(
  model: EditableGradientModel,
  id: string
): EditableGradientModel {
  return {
    ...model,
    id,
    stops: model.stops.map((s) => ({ ...s }))
  };
}
