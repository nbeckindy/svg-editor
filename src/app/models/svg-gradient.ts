/** Parsed gradient paint for editor round-trip (AS-1 / e1x). */

/** Undo payload: shape paint presentation + optional defs subtree. */
export interface PaintGradientSnapshot {
  /** Target `<linearGradient>` / `<radialGradient>` id when a def exists; null when paint is solid/none. */
  gradientId: string | null;
  /** Raw `fill` or `stroke` presentation attribute value (e.g. `url(#id)` or `#rrggbb`). */
  shapePaintAttr: string | null;
  /** Serialized gradient element, or null to remove `gradientId` from defs. */
  gradientOuterHtml: string | null;
}

export type EditableGradientKind = 'linear' | 'radial';

export interface GradientStopModel {
  offset: string;
  color: string;
  opacity?: number;
}

export interface EditableGradientModel {
  id: string;
  kind: EditableGradientKind;
  gradientUnits: 'objectBoundingBox' | 'userSpaceOnUse';
  /** Linear endpoints (percent or 0–1 strings as stored in DOM). */
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
  /** Radial geometry. */
  cx?: string;
  cy?: string;
  r?: string;
  fx?: string;
  fy?: string;
  stops: GradientStopModel[];
}

const URL_PAINT_RE = /^\s*url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)\s*$/i;

export function parsePaintReferenceId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(URL_PAINT_RE);
  return m ? m[2] : null;
}

function readStops(el: SVGLinearGradientElement | SVGRadialGradientElement): GradientStopModel[] {
  const out: GradientStopModel[] = [];
  el.querySelectorAll(':scope > stop').forEach((node) => {
    const stop = node as SVGStopElement;
    const offset = stop.getAttribute('offset') ?? '0%';
    const sc = stop.getAttribute('stop-color') ?? stop.style.stopColor ?? '#000000';
    const so = stop.getAttribute('stop-opacity');
    const opacity =
      so != null && so !== ''
        ? Number.parseFloat(so)
        : stop.style.stopOpacity
          ? Number.parseFloat(stop.style.stopOpacity)
          : undefined;
    out.push({
      offset,
      color: sc.trim() || '#000000',
      opacity: Number.isFinite(opacity) ? opacity : undefined
    });
  });
  if (out.length === 0) {
    out.push({ offset: '0%', color: '#000000' }, { offset: '100%', color: '#ffffff' });
  }
  return out;
}

function parseUnits(raw: string | null): 'objectBoundingBox' | 'userSpaceOnUse' {
  return raw === 'userSpaceOnUse' ? 'userSpaceOnUse' : 'objectBoundingBox';
}

/** Read model from an existing linear or radial gradient element. */
export function readEditableGradientModel(
  el: SVGLinearGradientElement | SVGRadialGradientElement
): EditableGradientModel | null {
  const id = el.getAttribute('id');
  if (!id) return null;
  const tag = el.tagName.toLowerCase();
  const units = parseUnits(el.getAttribute('gradientUnits'));
  const stops = readStops(el);
  if (tag === 'lineargradient') {
    const lg = el as SVGLinearGradientElement;
    return {
      id,
      kind: 'linear',
      gradientUnits: units,
      x1: lg.getAttribute('x1') ?? '0%',
      y1: lg.getAttribute('y1') ?? '0%',
      x2: lg.getAttribute('x2') ?? '100%',
      y2: lg.getAttribute('y2') ?? '0%',
      stops
    };
  }
  if (tag === 'radialgradient') {
    const rg = el as SVGRadialGradientElement;
    return {
      id,
      kind: 'radial',
      gradientUnits: units,
      cx: rg.getAttribute('cx') ?? '50%',
      cy: rg.getAttribute('cy') ?? '50%',
      r: rg.getAttribute('r') ?? '50%',
      fx: rg.getAttribute('fx') ?? undefined,
      fy: rg.getAttribute('fy') ?? undefined,
      stops
    };
  }
  return null;
}

function clearStops(el: SVGLinearGradientElement | SVGRadialGradientElement): void {
  el.querySelectorAll(':scope > stop').forEach((s) => s.remove());
}

function appendStops(el: SVGLinearGradientElement | SVGRadialGradientElement, stops: GradientStopModel[]): void {
  const doc = el.ownerDocument;
  if (!doc) return;
  for (const s of stops) {
    const stop = doc.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', s.offset);
    stop.setAttribute('stop-color', s.color);
    if (s.opacity != null && Number.isFinite(s.opacity)) {
      stop.setAttribute('stop-opacity', String(s.opacity));
    }
    el.appendChild(stop);
  }
}

/** Apply model onto an existing element of the same kind as `model.kind`. */
export function applyEditableGradientModelToElement(
  el: SVGLinearGradientElement | SVGRadialGradientElement,
  model: EditableGradientModel
): void {
  el.setAttribute('id', model.id);
  el.setAttribute('gradientUnits', model.gradientUnits);
  if (model.kind === 'linear') {
    const lg = el as SVGLinearGradientElement;
    if (model.x1 != null) lg.setAttribute('x1', model.x1);
    if (model.y1 != null) lg.setAttribute('y1', model.y1);
    if (model.x2 != null) lg.setAttribute('x2', model.x2);
    if (model.y2 != null) lg.setAttribute('y2', model.y2);
    lg.removeAttribute('cx');
    lg.removeAttribute('cy');
    lg.removeAttribute('r');
    lg.removeAttribute('fx');
    lg.removeAttribute('fy');
  } else {
    const rg = el as SVGRadialGradientElement;
    if (model.cx != null) rg.setAttribute('cx', model.cx);
    if (model.cy != null) rg.setAttribute('cy', model.cy);
    if (model.r != null) rg.setAttribute('r', model.r);
    if (model.fx != null && model.fx !== '') rg.setAttribute('fx', model.fx);
    else rg.removeAttribute('fx');
    if (model.fy != null && model.fy !== '') rg.setAttribute('fy', model.fy);
    else rg.removeAttribute('fy');
    rg.removeAttribute('x1');
    rg.removeAttribute('y1');
    rg.removeAttribute('x2');
    rg.removeAttribute('y2');
  }
  clearStops(el);
  appendStops(el, model.stops);
}

/** Default linear gradient for a new fill (horizontal left-to-right in bbox space). */
export function defaultLinearGradientModel(id: string, fromColor: string, toColor: string): EditableGradientModel {
  return {
    id,
    kind: 'linear',
    gradientUnits: 'objectBoundingBox',
    x1: '0%',
    y1: '0%',
    x2: '100%',
    y2: '0%',
    stops: [
      { offset: '0%', color: fromColor },
      { offset: '100%', color: toColor }
    ]
  };
}

/** Default radial gradient in bbox space. */
export function defaultRadialGradientModel(id: string, innerColor: string, outerColor: string): EditableGradientModel {
  return {
    id,
    kind: 'radial',
    gradientUnits: 'objectBoundingBox',
    cx: '50%',
    cy: '50%',
    r: '50%',
    stops: [
      { offset: '0%', color: innerColor },
      { offset: '100%', color: outerColor }
    ]
  };
}

function escAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Build a defs-safe `<linearGradient>` / `<radialGradient>` outerHTML string from a model. */
export function serializeGradientElementToOuterHtml(model: EditableGradientModel): string {
  const stopsXml = model.stops
    .map((s) => {
      const op =
        s.opacity != null && Number.isFinite(s.opacity) ? ` stop-opacity="${escAttr(String(s.opacity))}"` : '';
      return `<stop offset="${escAttr(s.offset)}" stop-color="${escAttr(s.color)}"${op}/>`;
    })
    .join('');
  const units = model.gradientUnits;
  if (model.kind === 'linear') {
    const x1 = model.x1 ?? '0%';
    const y1 = model.y1 ?? '0%';
    const x2 = model.x2 ?? '100%';
    const y2 = model.y2 ?? '0%';
    return `<linearGradient id="${escAttr(model.id)}" gradientUnits="${escAttr(units)}" x1="${escAttr(x1)}" y1="${escAttr(y1)}" x2="${escAttr(x2)}" y2="${escAttr(y2)}">${stopsXml}</linearGradient>`;
  }
  const cx = model.cx ?? '50%';
  const cy = model.cy ?? '50%';
  const r = model.r ?? '50%';
  const fx = model.fx != null && model.fx !== '' ? ` fx="${escAttr(model.fx)}"` : '';
  const fy = model.fy != null && model.fy !== '' ? ` fy="${escAttr(model.fy)}"` : '';
  return `<radialGradient id="${escAttr(model.id)}" gradientUnits="${escAttr(units)}" cx="${escAttr(cx)}" cy="${escAttr(cy)}" r="${escAttr(r)}"${fx}${fy}>${stopsXml}</radialGradient>`;
}
