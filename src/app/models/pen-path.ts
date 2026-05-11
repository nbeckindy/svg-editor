/**
 * Structured segments for incremental pen paths (maps to SVG d).
 * Phase 1 (j24.2): `Q` / smooth `S` / smooth `T` alongside `M` / `L` / `C` (explicit uppercase in export).
 */
export type PenPathSegment =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | {
      type: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  /** Smooth cubic shorthand: first control is implied from the previous `C`/`S` (SVG `S`). */
  | { type: 'S'; x2: number; y2: number; x: number; y: number }
  /** Smooth quadratic shorthand: control is implied from the previous `Q`/`T` (SVG `T`). */
  | { type: 'T'; x: number; y: number };

export type CubicControlPoints = { x1: number; y1: number; x2: number; y2: number };

/** SVG reflection state after walking committed pen segments (matches `parsePathD` rules). */
export type PenSvgReflectState = {
  x: number;
  y: number;
  quadCpX: number;
  quadCpY: number;
  cubicCp2X: number;
  cubicCp2Y: number;
  canReflectCubic: boolean;
};

function formatCoord(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

function movetoReflectState(m: Extract<PenPathSegment, { type: 'M' }>): PenSvgReflectState {
  return {
    x: m.x,
    y: m.y,
    quadCpX: m.x,
    quadCpY: m.y,
    cubicCp2X: m.x,
    cubicCp2Y: m.y,
    canReflectCubic: false
  };
}

function advancePenReflectState(st: PenSvgReflectState, s: Exclude<PenPathSegment, { type: 'M' }>): void {
  switch (s.type) {
    case 'L':
      st.x = s.x;
      st.y = s.y;
      st.quadCpX = s.x;
      st.quadCpY = s.y;
      return;
    case 'C':
      st.cubicCp2X = s.x2;
      st.cubicCp2Y = s.y2;
      st.canReflectCubic = true;
      st.x = s.x;
      st.y = s.y;
      st.quadCpX = s.x;
      st.quadCpY = s.y;
      return;
    case 'S':
      st.cubicCp2X = s.x2;
      st.cubicCp2Y = s.y2;
      st.canReflectCubic = true;
      st.x = s.x;
      st.y = s.y;
      st.quadCpX = s.x;
      st.quadCpY = s.y;
      return;
    case 'Q':
      st.quadCpX = s.x1;
      st.quadCpY = s.y1;
      st.x = s.x;
      st.y = s.y;
      st.cubicCp2X = s.x;
      st.cubicCp2Y = s.y;
      st.canReflectCubic = false;
      return;
    case 'T': {
      const tcx = 2 * st.x - st.quadCpX;
      const tcy = 2 * st.y - st.quadCpY;
      st.quadCpX = tcx;
      st.quadCpY = tcy;
      st.x = s.x;
      st.y = s.y;
      st.cubicCp2X = s.x;
      st.cubicCp2Y = s.y;
      st.canReflectCubic = false;
      return;
    }
  }
}

/**
 * Reflection state after walking drawable segments (`M`/`L`/`C`/`S`/`Q`/`T`/`Z`; no leading `Z` before moveto).
 * Used where paths may contain close commands (`PathSegment`) as well as pen segments.
 */
export function pathSvgReflectStateAfter(
  segments: readonly (PenPathSegment | { type: 'Z' })[]
): PenSvgReflectState | null {
  if (segments.length === 0) return null;
  let st: PenSvgReflectState | null = null;
  let subpathStartX = 0;
  let subpathStartY = 0;
  for (const s of segments) {
    if (s.type === 'M') {
      st = movetoReflectState(s);
      subpathStartX = s.x;
      subpathStartY = s.y;
      continue;
    }
    if (!st) continue;
    if (s.type === 'Z') {
      st.x = subpathStartX;
      st.y = subpathStartY;
      st.quadCpX = subpathStartX;
      st.quadCpY = subpathStartY;
      st.cubicCp2X = subpathStartX;
      st.cubicCp2Y = subpathStartY;
      st.canReflectCubic = false;
      continue;
    }
    advancePenReflectState(st, s);
  }
  return st;
}

/** Reflection state after committed pen-only segments (no close commands). */
export function penReflectStateAfterCommitted(segments: readonly PenPathSegment[]): PenSvgReflectState | null {
  return pathSvgReflectStateAfter(segments);
}

/** `Ctrl`+curve drag: quadratic after `M`/`L`, smooth cubic after `C`/`S`, smooth quadratic after `Q`/`T`. */
export function penDragCurveAuthoringKind(
  ctrlKey: boolean,
  segments: readonly PenPathSegment[]
): 'cubic' | 'quadratic' | 'smoothCubic' | 'smoothQuadratic' {
  if (!ctrlKey) return 'cubic';
  const last = segments[segments.length - 1];
  if (!last || last.type === 'M') return 'quadratic';
  if (last.type === 'C' || last.type === 'S') return 'smoothCubic';
  if (last.type === 'Q' || last.type === 'T') return 'smoothQuadratic';
  return 'quadratic';
}

/** Build a single `d` string from segments (explicit `M`/`L`/`C`/`Q`/`S`/`T`, no implicit commands). */
export function penPathSegmentsToD(segments: readonly PenPathSegment[]): string {
  const parts: string[] = [];
  let st: PenSvgReflectState | null = null;
  for (const s of segments) {
    if (s.type === 'M') {
      st = movetoReflectState(s);
      parts.push('M', formatCoord(s.x), formatCoord(s.y));
      continue;
    }
    if (!st) continue;
    switch (s.type) {
      case 'L':
        parts.push('L', formatCoord(s.x), formatCoord(s.y));
        advancePenReflectState(st, s);
        break;
      case 'C':
        parts.push(
          'C',
          formatCoord(s.x1),
          formatCoord(s.y1),
          formatCoord(s.x2),
          formatCoord(s.y2),
          formatCoord(s.x),
          formatCoord(s.y)
        );
        advancePenReflectState(st, s);
        break;
      case 'Q':
        parts.push('Q', formatCoord(s.x1), formatCoord(s.y1), formatCoord(s.x), formatCoord(s.y));
        advancePenReflectState(st, s);
        break;
      case 'S':
        parts.push('S', formatCoord(s.x2), formatCoord(s.y2), formatCoord(s.x), formatCoord(s.y));
        advancePenReflectState(st, s);
        break;
      case 'T':
        parts.push('T', formatCoord(s.x), formatCoord(s.y));
        advancePenReflectState(st, s);
        break;
    }
  }
  return parts.join(' ');
}

/** Session has only an initial moveto (no line/curve segments yet). */
export function penPathOnlyMoveto(segments: readonly PenPathSegment[]): boolean {
  return segments.length === 1 && segments[0].type === 'M';
}

/** Third-point cubic controls: symmetric along chord P0→P3 (tangent-continuous at ends). */
export function symmetricCubicControlPoints(
  p0: { x: number; y: number },
  p3: { x: number; y: number }
): CubicControlPoints {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  return {
    x1: p0.x + dx / 3,
    y1: p0.y + dy / 3,
    x2: p3.x - dx / 3,
    y2: p3.y - dy / 3
  };
}

/**
 * Cubic controls that preserve the endpoint chord while adding bend from drag direction.
 *
 * `dragStart`/`dragCurrent` are in the same SVG user space as `p0`/`p3` and encode
 * how far the pointer has moved since the pending segment began.
 */
export function dragBendCubicControlPoints(
  p0: { x: number; y: number },
  p3: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number },
  breakHandleSymmetry = false
): CubicControlPoints {
  const base = symmetricCubicControlPoints(p0, p3);
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-9) return base;

  const nx = -dy / chordLen;
  const ny = dx / chordLen;
  const dragDx = dragCurrent.x - dragStart.x;
  const dragDy = dragCurrent.y - dragStart.y;
  const bend = dragDx * nx + dragDy * ny;

  if (breakHandleSymmetry) {
    return {
      x1: base.x1,
      y1: base.y1,
      x2: base.x2 + nx * bend,
      y2: base.y2 + ny * bend
    };
  }

  return {
    x1: base.x1 + nx * bend,
    y1: base.y1 + ny * bend,
    x2: base.x2 + nx * bend,
    y2: base.y2 + ny * bend
  };
}

/**
 * Single quadratic control from chord midpoint + perpendicular bend (same drag model as cubics).
 */
export function dragBendQuadraticControlPoint(
  p0: { x: number; y: number },
  p2: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): { x1: number; y1: number } {
  const mx = (p0.x + p2.x) / 2;
  const my = (p0.y + p2.y) / 2;
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-9) return { x1: p0.x, y1: p0.y };
  const nx = -dy / chordLen;
  const ny = dx / chordLen;
  const bend =
    (dragCurrent.x - dragStart.x) * nx + (dragCurrent.y - dragStart.y) * ny;
  return { x1: mx + nx * bend, y1: my + ny * bend };
}

/** Second control for smooth cubic `S`: reuse outgoing bend from {@link dragBendCubicControlPoints}. */
export function dragBendSmoothCubicSecondControl(
  p0: { x: number; y: number },
  p3: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number },
  breakHandleSymmetry = false
): { x2: number; y2: number } {
  const c = dragBendCubicControlPoints(p0, p3, dragStart, dragCurrent, breakHandleSymmetry);
  return { x2: c.x2, y2: c.y2 };
}

/**
 * Pointer-locked end handle for pen Alt-mode: `(x2,y2)` is `pointer`. With `breakHandleSymmetry` true,
 * `(x1,y1)` stays on chord thirds from `p0`. With false, `(x1,y1)` mirrors (`P1 = P0 + P3 - P2`).
 */
export function placementPointerCubicControlPoints(
  p0: { x: number; y: number },
  p3: { x: number; y: number },
  pointer: { x: number; y: number },
  breakHandleSymmetry = false
): CubicControlPoints {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-9) {
    return symmetricCubicControlPoints(p0, p3);
  }
  const base = symmetricCubicControlPoints(p0, p3);
  if (breakHandleSymmetry) {
    return {
      x1: base.x1,
      y1: base.y1,
      x2: pointer.x,
      y2: pointer.y
    };
  }
  return {
    x1: p0.x + p3.x - pointer.x,
    y1: p0.y + p3.y - pointer.y,
    x2: pointer.x,
    y2: pointer.y
  };
}

/** Length scale from drag distance → incoming handle length (Illustrator-like pen). */
const ILLUSTRATOR_PEN_INCOMING_FROM_DRAG = 0.55;
/** Cap incoming handle length as a fraction of chord (keeps handles from overshooting). */
const ILLUSTRATOR_PEN_INCOMING_CAP_CHORD = 0.58;

/**
 * Illustrator / Inkscape–style pen click-drag for a cubic `P0→P3`:
 * - `P1` stays at the **chord-third** from `p0` (corner-like outgoing from the previous anchor).
 * - Drag from the new anchor (`dragStart` ≈ `p3`) sets the **incoming tangent at `p3`**:
 *   `P2` lies on the ray from `p3` opposite the drag direction, with length derived from drag length
 *   (capped relative to chord length).
 * - When `‖dragCurrent − dragStart‖` is ~0, falls back to symmetric chord-thirds.
 */
export function placementIllustratorStyleCubicControlPoints(
  p0: { x: number; y: number },
  p3: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): CubicControlPoints {
  const base = symmetricCubicControlPoints(p0, p3);
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-9) {
    return base;
  }

  const ddx = dragCurrent.x - dragStart.x;
  const ddy = dragCurrent.y - dragStart.y;
  const dragLen = Math.hypot(ddx, ddy);
  if (dragLen < 1e-9) {
    return base;
  }

  const ux = ddx / dragLen;
  const uy = ddy / dragLen;
  const k = Math.min(
    dragLen * ILLUSTRATOR_PEN_INCOMING_FROM_DRAG,
    chordLen * ILLUSTRATOR_PEN_INCOMING_CAP_CHORD
  );
  return {
    x1: base.x1,
    y1: base.y1,
    x2: p3.x - ux * k,
    y2: p3.y - uy * k
  };
}

/** Quadratic control follows `pointer` (same as dragging the single Q handle in node edit). */
export function placementPointerQuadraticControlPoint(
  _p0: { x: number; y: number },
  _p2: { x: number; y: number },
  pointer: { x: number; y: number }
): { x1: number; y1: number } {
  return { x1: pointer.x, y1: pointer.y };
}

/** Append a cubic `C` command to an existing `d` (no trailing space). */
export function appendCubicToD(
  baseD: string,
  controls: CubicControlPoints,
  p3: { x: number; y: number }
): string {
  const tail = [
    'C',
    formatCoord(controls.x1),
    formatCoord(controls.y1),
    formatCoord(controls.x2),
    formatCoord(controls.y2),
    formatCoord(p3.x),
    formatCoord(p3.y)
  ].join(' ');
  return baseD ? `${baseD} ${tail}` : tail;
}

/** Append a symmetric cubic from last point `p0` to `p3` to an existing `d` (no trailing space). */
export function appendSymmetricCubicToD(
  baseD: string,
  p0: { x: number; y: number },
  p3: { x: number; y: number }
): string {
  return appendCubicToD(baseD, symmetricCubicControlPoints(p0, p3), p3);
}

/** Append `L x y` to `d` for preview. */
export function appendLineToD(baseD: string, x: number, y: number): string {
  const tail = `L ${formatCoord(x)} ${formatCoord(y)}`;
  return baseD ? `${baseD} ${tail}` : tail;
}

/** Append `Q x1 y1 x y` for preview. */
export function appendQuadraticToD(
  baseD: string,
  x1: number,
  y1: number,
  x: number,
  y: number
): string {
  const tail = ['Q', formatCoord(x1), formatCoord(y1), formatCoord(x), formatCoord(y)].join(' ');
  return baseD ? `${baseD} ${tail}` : tail;
}

/** Append smooth cubic `S x2 y2 x y` for preview. */
export function appendSmoothCubicToD(
  baseD: string,
  x2: number,
  y2: number,
  x: number,
  y: number
): string {
  const tail = ['S', formatCoord(x2), formatCoord(y2), formatCoord(x), formatCoord(y)].join(' ');
  return baseD ? `${baseD} ${tail}` : tail;
}

/** Append smooth quadratic `T x y` for preview. */
export function appendSmoothQuadraticToD(baseD: string, x: number, y: number): string {
  const tail = `T ${formatCoord(x)} ${formatCoord(y)}`;
  return baseD ? `${baseD} ${tail}` : tail;
}

/** Squared distance in SVG user space (cheap degenerate test). */
export function penSvgDistanceSq(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** End vertex of the last segment (anchor for rubber-band preview). */
export function lastCommittedVertex(
  segments: readonly PenPathSegment[]
): { x: number; y: number } | null {
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  return { x: last.x, y: last.y };
}

/** Reflection of the smooth-quadratic control across the point `st` (used for `T` preview). */
export function impliedSmoothQuadraticControlFromState(st: PenSvgReflectState): { x: number; y: number } {
  return { x: 2 * st.x - st.quadCpX, y: 2 * st.y - st.quadCpY };
}

/**
 * Last-vertex outgoing Bézier handle in SVG user space (endpoint → control), when the segment shows a handle.
 * `L` / `M` return null.
 */
export function penLastOutgoingHandleSvg(
  segments: readonly PenPathSegment[]
): { anchorX: number; anchorY: number; hx: number; hy: number } | null {
  if (segments.length < 2) return null;
  const last = segments[segments.length - 1];
  if (last.type === 'C' || last.type === 'S') {
    return { anchorX: last.x, anchorY: last.y, hx: last.x2, hy: last.y2 };
  }
  if (last.type === 'Q') {
    return { anchorX: last.x, anchorY: last.y, hx: last.x1, hy: last.y1 };
  }
  if (last.type === 'T') {
    const st = pathSvgReflectStateAfter(segments.slice(0, -1));
    if (!st) return null;
    const im = impliedSmoothQuadraticControlFromState(st);
    return { anchorX: last.x, anchorY: last.y, hx: im.x, hy: im.y };
  }
  return null;
}

/** Mutates the outgoing control(s) for the path's last drawable segment; converts trailing `T` to `Q`. */
export function movePenLastOutgoingHandleTo(
  segments: readonly PenPathSegment[],
  hx: number,
  hy: number
): PenPathSegment[] | null {
  if (segments.length < 2) return null;
  const segs = segments.map((s) => ({ ...s })) as PenPathSegment[];
  const last = segs[segs.length - 1];
  const idx = segs.length - 1;
  switch (last.type) {
    case 'C':
    case 'S':
      segs[idx] = { ...last, x2: hx, y2: hy };
      return segs;
    case 'Q':
      segs[idx] = { ...last, x1: hx, y1: hy };
      return segs;
    case 'T':
      segs[idx] = { type: 'Q', x1: hx, y1: hy, x: last.x, y: last.y };
      return segs;
    default:
      return null;
  }
}

/**
 * Snap so that `target` lies on a ray from `origin` whose angle is a multiple of 45° in user space.
 * Preserves `Math.hypot(target - origin)`.
 */
export function snapVectorTo45DegFrom(
  origin: { x: number; y: number },
  target: { x: number; y: number }
): { x: number; y: number } {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return { x: origin.x, y: origin.y };
  let ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  ang = Math.round(ang / step) * step;
  return { x: origin.x + Math.cos(ang) * len, y: origin.y + Math.sin(ang) * len };
}

/** At least one moveto and one additional drawable vertex (line or curve end). */
export function penPathSegmentsAreValid(segments: readonly PenPathSegment[]): boolean {
  if (segments.length < 2) return false;
  if (segments[0].type !== 'M') return false;
  for (let i = 1; i < segments.length; i++) {
    const t = segments[i].type;
    if (t === 'L' || t === 'C' || t === 'Q' || t === 'S' || t === 'T') return true;
  }
  return false;
}

/**
 * Mutable session for building a path incrementally (PP-2b/PP-3).
 * Not an Angular service — embed or inject where needed.
 */
export class PenSession {
  private segments: PenPathSegment[] = [];

  getSegments(): readonly PenPathSegment[] {
    return this.segments;
  }

  beginPath(x: number, y: number): void {
    this.segments = [{ type: 'M', x, y }];
  }

  /** Append a straight segment after {@link beginPath} or a prior segment. */
  addLinePoint(x: number, y: number): void {
    this.segments.push({ type: 'L', x, y });
  }

  appendCubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.segments.push({ type: 'C', x1, y1, x2, y2, x, y });
  }

  appendQuadratic(x1: number, y1: number, x: number, y: number): void {
    this.segments.push({ type: 'Q', x1, y1, x, y });
  }

  appendSmoothCubic(x2: number, y2: number, x: number, y: number): void {
    this.segments.push({ type: 'S', x2, y2, x, y });
  }

  appendSmoothQuadratic(x: number, y: number): void {
    this.segments.push({ type: 'T', x, y });
  }

  /** Current `d` string (may be invalid if fewer than two points). */
  getPathD(): string {
    return penPathSegmentsToD(this.segments);
  }

  reset(): void {
    this.segments = [];
  }

  /** Replace the in-progress path (e.g. continue-from-existing). */
  restoreDrawableSegments(segments: readonly PenPathSegment[]): void {
    this.segments = segments.map((s) => ({ ...s })) as PenPathSegment[];
  }

  /** Replace one segment (pen handle adjust, undo, etc.). */
  replaceSegmentAt(index: number, segment: PenPathSegment): void {
    if (index < 0 || index >= this.segments.length) return;
    this.segments[index] = { ...segment } as PenPathSegment;
  }

  /**
   * Remove the last committed drawable segment (`L` / `C` / `Q` / `S` / `T`).
   * If only a lone `M` remains (before or after the pop), clear the session.
   *
   * @returns `none` — nothing changed (empty segments); `cleared` — session ended/restarted empty;
   *          `popped` — removed one segment and anchors remain drawable.
   */
  popLastCommittedSegment(): 'none' | 'cleared' | 'popped' {
    if (this.segments.length === 0) return 'none';
    if (penPathOnlyMoveto(this.segments)) {
      this.reset();
      return 'cleared';
    }
    this.segments.pop();
    if (this.segments.length === 0 || penPathOnlyMoveto(this.segments)) {
      this.reset();
      return 'cleared';
    }
    return 'popped';
  }

  /**
   * @returns `d` when {@link penPathSegmentsAreValid}, otherwise `null`.
   */
  finishPath(): string | null {
    if (!penPathSegmentsAreValid(this.segments)) return null;
    return this.getPathD();
  }
}
