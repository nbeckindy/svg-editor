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

/** SVG user-space bbox for gradient unit normalization. */
export interface ShapeBboxForGradient {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 0–100 track positions for linear gradient endpoint handles. */
export interface GradientEndpointSpan {
  start: number;
  end: number;
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

/** Switch linear ↔ radial while preserving stops and gradient id. */
export function switchGradientKindModel(
  preserveStopsFrom: EditableGradientModel,
  kind: 'linear' | 'radial'
): EditableGradientModel {
  if (preserveStopsFrom.kind === kind) {
    return preserveStopsFrom;
  }
  const id = preserveStopsFrom.id;
  const stops =
    preserveStopsFrom.stops.length >= 2
      ? preserveStopsFrom.stops
      : defaultLinearGradientModel(id, '#000000', '#ffffff').stops;
  const units = preserveStopsFrom.gradientUnits;
  if (kind === 'linear') {
    return {
      ...defaultLinearGradientModel(
        id,
        stops[0]?.color ?? '#000000',
        stops[stops.length - 1]?.color ?? '#ffffff'
      ),
      stops,
      gradientUnits: units
    };
  }
  return {
    ...defaultRadialGradientModel(
      id,
      stops[0]?.color ?? '#000000',
      stops[stops.length - 1]?.color ?? '#ffffff'
    ),
    stops,
    gradientUnits: units
  };
}

function escAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseOffsetPercent(offset: string): number {
  const t = offset.trim();
  if (t.endsWith('%')) {
    const n = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
}

/** First stop color by ascending offset (used when reverting gradient → solid). */
export function firstStopColor(model: EditableGradientModel): string {
  if (model.stops.length === 0) return '#000000';
  const sorted = [...model.stops].sort(
    (a, b) => parseOffsetPercent(a.offset) - parseOffsetPercent(b.offset)
  );
  return sorted[0].color.trim() || '#000000';
}

function cssStopColor(stop: GradientStopModel): string {
  const alpha = stop.opacity != null && Number.isFinite(stop.opacity) ? stop.opacity : 1;
  if (alpha >= 1) return stop.color;
  return `color-mix(in srgb, ${stop.color} ${Math.round(alpha * 100)}%, transparent)`;
}

const BBOX_CENTER_PERCENT = { x: 50, y: 50 };

function cloneGradientModel(model: EditableGradientModel): EditableGradientModel {
  return JSON.parse(JSON.stringify(model)) as EditableGradientModel;
}

function parseCoordPercent(raw: string | undefined, fallback: number): number {
  return parseOffsetPercent(raw ?? `${fallback}%`);
}

function formatCoordPercent(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const trimmed = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${trimmed}%`;
}

function normalizeAngle360(degrees: number): number {
  let a = degrees % 360;
  if (a < 0) a += 360;
  return a;
}

function linearUnitDirectionFromAngleDegrees(degrees: number): { dx: number; dy: number } {
  const rad = (degrees * Math.PI) / 180;
  return { dx: Math.cos(rad), dy: Math.sin(rad) };
}

function dot2(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

function bboxEdgeIntersectionsPercent(
  degrees: number
): [{ x: number; y: number }, { x: number; y: number }] {
  const { dx, dy } = linearUnitDirectionFromAngleDegrees(degrees);
  const cx = BBOX_CENTER_PERCENT.x;
  const cy = BBOX_CENTER_PERCENT.y;
  const candidates: { x: number; y: number; t: number }[] = [];
  const eps = 1e-9;

  if (Math.abs(dx) > eps) {
    for (const xEdge of [0, 100]) {
      const t = (xEdge - cx) / dx;
      const y = cy + t * dy;
      if (y >= -eps && y <= 100 + eps) candidates.push({ x: xEdge, y, t });
    }
  }
  if (Math.abs(dy) > eps) {
    for (const yEdge of [0, 100]) {
      const t = (yEdge - cy) / dy;
      const x = cx + t * dx;
      if (x >= -eps && x <= 100 + eps) candidates.push({ x, y: yEdge, t });
    }
  }

  candidates.sort((a, b) => a.t - b.t);
  const uniq = candidates.filter(
    (p, i, arr) => i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.01
  );
  if (uniq.length >= 2) {
    return [
      { x: uniq[0].x, y: uniq[0].y },
      { x: uniq[uniq.length - 1].x, y: uniq[uniq.length - 1].y }
    ];
  }
  return [
    { x: 0, y: cy },
    { x: 100, y: cy }
  ];
}

function fullSpanScalars(degrees: number): { sMin: number; sMax: number; dx: number; dy: number } {
  const { dx, dy } = linearUnitDirectionFromAngleDegrees(degrees);
  const [p0, p1] = bboxEdgeIntersectionsPercent(degrees);
  const cx = BBOX_CENTER_PERCENT.x;
  const cy = BBOX_CENTER_PERCENT.y;
  const s0 = dot2(p0.x - cx, p0.y - cy, dx, dy);
  const s1 = dot2(p1.x - cx, p1.y - cy, dx, dy);
  return { sMin: Math.min(s0, s1), sMax: Math.max(s0, s1), dx, dy };
}

function pointFromSpanScalar(s: number, dx: number, dy: number): { x: number; y: number } {
  return {
    x: BBOX_CENTER_PERCENT.x + s * dx,
    y: BBOX_CENTER_PERCENT.y + s * dy
  };
}

function endpointsFromSpanAndAngle(
  span: GradientEndpointSpan,
  degrees: number
): { x1: string; y1: string; x2: string; y2: string } {
  const { sMin, sMax, dx, dy } = fullSpanScalars(degrees);
  const range = sMax - sMin || 1;
  const tStart = Math.min(span.start, span.end);
  const tEnd = Math.max(span.start, span.end);
  const sStart = sMin + (tStart / 100) * range;
  const sEnd = sMin + (tEnd / 100) * range;
  const pStart = pointFromSpanScalar(sStart, dx, dy);
  const pEnd = pointFromSpanScalar(sEnd, dx, dy);
  return {
    x1: formatCoordPercent(pStart.x),
    y1: formatCoordPercent(pStart.y),
    x2: formatCoordPercent(pEnd.x),
    y2: formatCoordPercent(pEnd.y)
  };
}

/** Track-aligned angle: 0° = left→right on the horizontal slider. */
export function linearGradientAngleDegrees(model: EditableGradientModel): number {
  const x1 = parseCoordPercent(model.x1, 0);
  const y1 = parseCoordPercent(model.y1, 0);
  const x2 = parseCoordPercent(model.x2, 100);
  const y2 = parseCoordPercent(model.y2, 0);
  return normalizeAngle360((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
}

/** Convert track-aligned math angle to CSS `linear-gradient()` degrees. */
export function mathAngleToCssDegrees(mathDeg: number): number {
  return normalizeAngle360(90 - mathDeg);
}

export function applyLinearGradientAngleDegrees(
  model: EditableGradientModel,
  degrees: number
): EditableGradientModel {
  const copy = cloneGradientModel(model);
  const span = linearGradientEndpointSpan(copy);
  const endpoints = endpointsFromSpanAndAngle(span, normalizeAngle360(degrees));
  copy.x1 = endpoints.x1;
  copy.y1 = endpoints.y1;
  copy.x2 = endpoints.x2;
  copy.y2 = endpoints.y2;
  copy.gradientUnits = 'objectBoundingBox';
  return copy;
}

export function linearGradientEndpointSpan(model: EditableGradientModel): GradientEndpointSpan {
  const degrees = linearGradientAngleDegrees(model);
  const { sMin, sMax, dx, dy } = fullSpanScalars(degrees);
  const cx = BBOX_CENTER_PERCENT.x;
  const cy = BBOX_CENTER_PERCENT.y;
  const x1 = parseCoordPercent(model.x1, 0);
  const y1 = parseCoordPercent(model.y1, 0);
  const x2 = parseCoordPercent(model.x2, 100);
  const y2 = parseCoordPercent(model.y2, 0);
  const s1 = dot2(x1 - cx, y1 - cy, dx, dy);
  const s2 = dot2(x2 - cx, y2 - cy, dx, dy);
  const range = sMax - sMin || 1;
  return {
    start: ((Math.min(s1, s2) - sMin) / range) * 100,
    end: ((Math.max(s1, s2) - sMin) / range) * 100
  };
}

export function applyLinearGradientEndpointSpan(
  model: EditableGradientModel,
  span: GradientEndpointSpan
): EditableGradientModel {
  const copy = cloneGradientModel(model);
  const degrees = linearGradientAngleDegrees(copy);
  const endpoints = endpointsFromSpanAndAngle(span, degrees);
  copy.x1 = endpoints.x1;
  copy.y1 = endpoints.y1;
  copy.x2 = endpoints.x2;
  copy.y2 = endpoints.y2;
  copy.gradientUnits = 'objectBoundingBox';
  return copy;
}

export function applyRadialCenter(
  model: EditableGradientModel,
  cxPercent: number,
  cyPercent: number
): EditableGradientModel {
  const copy = cloneGradientModel(model);
  copy.cx = formatCoordPercent(cxPercent);
  copy.cy = formatCoordPercent(cyPercent);
  copy.gradientUnits = 'objectBoundingBox';
  return copy;
}

export function applyRadialRadius(model: EditableGradientModel, rPercent: number): EditableGradientModel {
  const copy = cloneGradientModel(model);
  copy.r = formatCoordPercent(rPercent);
  copy.gradientUnits = 'objectBoundingBox';
  return copy;
}

function parseUserSpaceCoord(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const t = raw.trim();
  if (t.endsWith('%')) return parseOffsetPercent(t);
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : fallback;
}

function userSpaceToPercent(value: number, origin: number, extent: number): string {
  const safe = Math.max(extent, 1);
  return formatCoordPercent(((value - origin) / safe) * 100);
}

/** Migrate imported `userSpaceOnUse` geometry to equivalent `objectBoundingBox` percentages. */
export function normalizeGradientModelToObjectBoundingBox(
  model: EditableGradientModel,
  shapeBbox: ShapeBboxForGradient
): EditableGradientModel {
  if (model.gradientUnits === 'objectBoundingBox') {
    return cloneGradientModel(model);
  }
  const copy = cloneGradientModel(model);
  const w = Math.max(shapeBbox.width, 1);
  const h = Math.max(shapeBbox.height, 1);
  const diag = Math.max(Math.hypot(w, h), 1);
  const { x, y } = shapeBbox;

  if (copy.kind === 'linear') {
    copy.x1 = userSpaceToPercent(parseUserSpaceCoord(copy.x1, x), x, w);
    copy.y1 = userSpaceToPercent(parseUserSpaceCoord(copy.y1, y), y, h);
    copy.x2 = userSpaceToPercent(parseUserSpaceCoord(copy.x2, x + w), x, w);
    copy.y2 = userSpaceToPercent(parseUserSpaceCoord(copy.y2, y), y, h);
  } else {
    copy.cx = userSpaceToPercent(parseUserSpaceCoord(copy.cx, x + w / 2), x, w);
    copy.cy = userSpaceToPercent(parseUserSpaceCoord(copy.cy, y + h / 2), y, h);
    copy.r = userSpaceToPercent(parseUserSpaceCoord(copy.r, diag / 2), 0, diag);
    if (copy.fx != null && copy.fx !== '') {
      copy.fx = userSpaceToPercent(parseUserSpaceCoord(copy.fx, x + w / 2), x, w);
    }
    if (copy.fy != null && copy.fy !== '') {
      copy.fy = userSpaceToPercent(parseUserSpaceCoord(copy.fy, y + h / 2), y, h);
    }
  }
  copy.gradientUnits = 'objectBoundingBox';
  return copy;
}

function sortedStopsCss(stops: GradientStopModel[], mapOffset?: (offset: number) => number): string {
  return [...stops]
    .sort((a, b) => parseOffsetPercent(a.offset) - parseOffsetPercent(b.offset))
    .map((s) => {
      const offset = mapOffset ? mapOffset(parseOffsetPercent(s.offset)) : parseOffsetPercent(s.offset);
      return `${cssStopColor(s)} ${offset}%`;
    })
    .join(', ');
}

/** Track preview is always horizontal left→right (0° track-aligned); shape preview uses real angle/geometry. */
const SLIDER_TRACK_CSS_DEG = 90;

/** CSS preview for the stop slider track; remaps stop offsets when linear span is shortened. */
export function cssGradientPreviewForSlider(
  model: EditableGradientModel,
  endpointSpan?: GradientEndpointSpan
): string {
  const mapOffset =
    model.kind === 'linear' && endpointSpan != null
      ? (offset: number) => {
          const start = Math.min(endpointSpan.start, endpointSpan.end);
          const end = Math.max(endpointSpan.start, endpointSpan.end);
          return start + (offset / 100) * (end - start);
        }
      : undefined;
  return `linear-gradient(${SLIDER_TRACK_CSS_DEG}deg, ${sortedStopsCss(model.stops, mapOffset)})`;
}

/** RGB interpolate between neighboring stops at `offsetPercent` (for click-to-add). */
export function interpolateGradientStopColor(stops: GradientStopModel[], offsetPercent: number): string {
  const sorted = [...stops].sort((a, b) => parseOffsetPercent(a.offset) - parseOffsetPercent(b.offset));
  if (sorted.length === 0) return '#888888';
  if (sorted.length === 1) return sorted[0]!.color;
  const t = Math.max(0, Math.min(100, offsetPercent));
  let left = sorted[0]!;
  let right = sorted[sorted.length - 1]!;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const oa = parseOffsetPercent(a.offset);
    const ob = parseOffsetPercent(b.offset);
    if (t >= oa && t <= ob) {
      left = a;
      right = b;
      break;
    }
  }
  const oa = parseOffsetPercent(left.offset);
  const ob = parseOffsetPercent(right.offset);
  const ratio = ob === oa ? 0 : (t - oa) / (ob - oa);
  return mixHexColors(left.color, right.color, ratio);
}

function mixHexColors(a: string, b: string, ratio: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.trim().replace('#', '');
    const full =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h.padStart(6, '0').slice(0, 6);
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16)
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const t = Math.max(0, Math.min(1, ratio));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** CSS `background-image` value approximating an SVG gradient for swatch previews. */
export function cssGradientPreviewFromModel(model: EditableGradientModel): string {
  if (model.kind === 'radial') {
    const cx = model.cx ?? '50%';
    const cy = model.cy ?? '50%';
    return `radial-gradient(circle at ${cx} ${cy}, ${sortedStopsCss(model.stops)})`;
  }

  const cssDeg = mathAngleToCssDegrees(linearGradientAngleDegrees(model));
  return `linear-gradient(${cssDeg}deg, ${sortedStopsCss(model.stops)})`;
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
