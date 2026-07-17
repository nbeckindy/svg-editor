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

/**
 * Alternate pen curve mode (historically Control held or toolbar toggle):
 * normally Q after `M`/`L`, S after `C`/`S`, T after `Q`/`T`.
 *
 * Quadratic (`Q`) authoring after `M`/`L` is temporarily disabled so pen work focuses on
 * cubic; callers currently always pass `ctrlKey: false` (alt-curve UI removed).
 */
export function penDragCurveAuthoringKind(
  ctrlKey: boolean,
  segments: readonly PenPathSegment[]
): 'cubic' | 'quadratic' | 'smoothCubic' | 'smoothQuadratic' {
  if (!ctrlKey) return 'cubic';
  const last = segments[segments.length - 1];
  if (!last || last.type === 'M') return 'cubic';
  if (last.type === 'C' || last.type === 'S') return 'smoothCubic';
  if (last.type === 'Q' || last.type === 'T') return 'smoothQuadratic';
  // Was `quadratic` (Q after L, etc.); temporarily cubic-only — see docblock above.
  return 'cubic';
}

/**
 * True when the first drawable segment after the leading `M` is cubic (`C`) or smooth cubic (`S`).
 * Used with {@link penLastIncomingSegmentIsCubicCurved} for pen close-from-start: append `L` to the
 * moveto only when neither applies; otherwise commit a closing curve via `commitDraggedCurve` with
 * `segmentEnd` at the moveto. When the first leg is an explicit `C`,
 * {@link penCloseNoPreviewDragCurrentForOpenExplicitC} supplies the virtual pointer sample so a release
 * collapsed near `M` (no preview, or curve preview within
 * `PEN_CLOSE_CURVE_PREVIEW_RELEASE_NEAR_MOVETO_MAX_SQ`) does not collapse the closing handle.
 */
export function penStartingLegIsCubic(segments: readonly PenPathSegment[]): boolean {
  if (segments.length < 2) return false;
  const first = segments[1];
  return first.type === 'C' || first.type === 'S';
}

/**
 * True when the last committed drawable segment (the edge into the current pen tip) is cubic
 * (`C` or `S`). Then a short click to the next anchor uses curve authoring, not a bare `L`; the
 * same applies when closing to the moveto.
 */
export function penLastIncomingSegmentIsCubicCurved(segments: readonly PenPathSegment[]): boolean {
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1];
  return last.type === 'C' || last.type === 'S';
}

/** Squared distance: `C` end handle treated as absent when `P2` coincides with the segment end. */
export const PEN_TIP_CUBIC_OUTGOING_HANDLE_EPS_SQ = 1e-6;

/**
 * True when the last drawable segment ends with a **non-degenerate** cubic outgoing handle (`P2`
 * not coincident with the curve end). No-drag close-to-start uses a closing `C` only when this is
 * true; otherwise `L` (e.g. last segment `L`, or `C` with `P2` collapsed on the tip like pen short-drag
 * corners).
 */
export function penLastDrawableOutgoingCubicHandlePresentAtTip(segments: readonly PenPathSegment[]): boolean {
  if (segments.length < 2) return false;
  const last = segments[segments.length - 1];
  if (last.type === 'C') {
    return (
      penSvgDistanceSq({ x: last.x2, y: last.y2 }, { x: last.x, y: last.y }) >= PEN_TIP_CUBIC_OUTGOING_HANDLE_EPS_SQ
    );
  }
  if (last.type === 'S') {
    return true;
  }
  return false;
}

/**
 * Close-from-start when the path begins with `M` then explicit `C` and `moveto` matches segment `M`:
 * return that opening **`P1`** as the virtual `dragCurrent` for
 * {@link placementCornerAnchorDragCubicControlPoints} (with `dragStart = M` from
 * `commitPenDraggedCurveOnSession`). Then **P2_close = 2·M − P1_open**, mirroring the opening corner
 * through the moveto instead of using a release sample collapsed near `M`.
 *
 * @param releaseNearMovetoMaxSq When **omitted**, always substitute opening `P1` (no curve preview /
 *   click-close). When **set** (curve-preview close), substitute only if
 *   `‖release − moveto‖² ≤ releaseNearMovetoMaxSq`; otherwise return `releaseSvg` so a deliberate
 *   drag away from `M` still shapes the closing handle.
 *
 * For `S` first legs or mismatched moveto, returns `releaseSvg` unchanged.
 */
export function penCloseNoPreviewDragCurrentForOpenExplicitC(
  segments: readonly PenPathSegment[],
  moveto: { x: number; y: number },
  releaseSvg: { x: number; y: number },
  releaseNearMovetoMaxSq?: number
): { x: number; y: number } {
  if (segments.length < 2) return releaseSvg;
  const m0 = segments[0];
  const first = segments[1];
  if (m0.type !== 'M' || first.type !== 'C') return releaseSvg;
  if (penSvgDistanceSq({ x: m0.x, y: m0.y }, moveto) >= 1e-10) return releaseSvg;
  if (
    releaseNearMovetoMaxSq !== undefined &&
    penSvgDistanceSq(releaseSvg, moveto) > releaseNearMovetoMaxSq
  ) {
    return releaseSvg;
  }
  return { x: first.x1, y: first.y1 };
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

function penSvgUnit2d(dx: number, dy: number): { x: number; y: number } | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return null;
  return { x: dx / len, y: dy / len };
}

function penSvgCross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/**
 * Converts a sharp **L–L** corner at `V` into **C–C** with mirrored handles at `V` so the path
 * actually bends (unlike {@link symmetricCubicControlPoints} alone, which leaves controls on the
 * chords and draws straight lines).
 *
 * - Handle axis aligns with the neighbor chord **p0 → B** (the line through the anchors on
 *   either side of `V`), matching node-edit “mirror cubic” expectations.
 * - Handle length defaults to `thirdFactor * min(|p0V|, |VB|)` (same scale as chord-thirds).
 * - Keeps the pen split pattern: incoming `x1/y1` and outgoing `x2/y2` stay on chord thirds toward
 *   the far anchors; only the two controls at `V` are offset along the neighbor axis and mirrored.
 */
export function mirrorCornerCubicsFromStraightLL(
  p0: { x: number; y: number },
  V: { x: number; y: number },
  B: { x: number; y: number },
  thirdFactor = 1 / 3
): { incoming: CubicControlPoints; outgoing: CubicControlPoints } | null {
  const chordIn = Math.hypot(V.x - p0.x, V.y - p0.y);
  const chordOut = Math.hypot(B.x - V.x, B.y - V.y);
  if (chordIn < 1e-9 || chordOut < 1e-9) return null;

  const h = Math.min(chordIn, chordOut) * thirdFactor;

  const e0 = penSvgUnit2d(p0.x - V.x, p0.y - V.y);
  const e1 = penSvgUnit2d(B.x - V.x, B.y - V.y);
  if (!e0 || !e1) return null;

  const tin = penSvgUnit2d(e0.x + e1.x, e0.y + e1.y);
  if (!tin) {
    return {
      incoming: symmetricCubicControlPoints(p0, V),
      outgoing: symmetricCubicControlPoints(V, B)
    };
  }

  let u = penSvgUnit2d(B.x - p0.x, B.y - p0.y);
  if (!u) {
    u = tin;
  }

  const vpx = V.x - p0.x;
  const vpy = V.y - p0.y;
  const interiorHintX = V.x + tin.x * 1e-3;
  const interiorHintY = V.y + tin.y * 1e-3;
  const targetSign =
    Math.sign(penSvgCross2(vpx, vpy, interiorHintX - p0.x, interiorHintY - p0.y)) || 1;

  let c2x = V.x - h * u.x;
  let c2y = V.y - h * u.y;
  let s0 = Math.sign(penSvgCross2(vpx, vpy, c2x - p0.x, c2y - p0.y));
  if (s0 === 0 || s0 !== targetSign) {
    c2x = V.x + h * u.x;
    c2y = V.y + h * u.y;
  }

  // Joint tangent (incoming end) is 3(V − c2); it must align with stroke continuation toward B
  // or the curve folds back on itself (hourglass). Flip 180° along the handle axis when needed.
  const bvx = B.x - V.x;
  const bvy = B.y - V.y;
  const tdx = V.x - c2x;
  const tdy = V.y - c2y;
  if (tdx * bvx + tdy * bvy <= 0) {
    c2x = 2 * V.x - c2x;
    c2y = 2 * V.y - c2y;
  }

  const symPV = symmetricCubicControlPoints(p0, V);
  const symVB = symmetricCubicControlPoints(V, B);

  const incoming: CubicControlPoints = {
    x1: symPV.x1,
    y1: symPV.y1,
    x2: c2x,
    y2: c2y
  };
  const outgoing: CubicControlPoints = {
    x1: 2 * V.x - c2x,
    y1: 2 * V.y - c2y,
    x2: symVB.x2,
    y2: symVB.y2
  };

  return { incoming, outgoing };
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
/** Previously: `chordLen * 0.58` cap on incoming handle; removed so long drags scale with drag only. */
// const ILLUSTRATOR_PEN_INCOMING_CAP_CHORD = 0.58;

/**
 * When `p0` and `p3` coincide (zero-length chord), symmetric chord-thirds are degenerate.
 * Use the drag vector from `dragStart`→`dragCurrent` to place outgoing `P1` and incoming `P2`
 * along that ray (same incoming length scale as {@link placementCornerAnchorDragCubicControlPoints} for a non-degenerate chord).
 */
export function placementZeroChordCubicControlPointsFromDrag(
  anchor: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): CubicControlPoints {
  const ddx = dragCurrent.x - dragStart.x;
  const ddy = dragCurrent.y - dragStart.y;
  const dragLen = Math.hypot(ddx, ddy);
  if (dragLen < 1e-12) {
    return { x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y };
  }
  const ux = ddx / dragLen;
  const uy = ddy / dragLen;
  const outgoing = dragLen / 3;
  const incoming = dragLen * ILLUSTRATOR_PEN_INCOMING_FROM_DRAG;
  return {
    x1: anchor.x + ux * outgoing,
    y1: anchor.y + uy * outgoing,
    x2: anchor.x - ux * incoming,
    y2: anchor.y - uy * incoming
  };
}

/**
 * Pen click-drag from a **sharp** anchor (`P1` collapsed on `p0` — no outgoing handle):
 * - `P1 = p0`.
 * - **Incoming `P2`**: from `p3` opposite the drag vector `dragStart→dragCurrent`, at distance
 *   `‖dragCurrent − dragStart‖` (same magnitude as the drag segment; matches pointer distance from `p3`
 *   when `dragStart` is at `p3`).
 * - Zero-length chord: {@link placementZeroChordCubicControlPointsFromDrag}.
 * - ~Zero drag on a non-degenerate chord: `P2` at symmetric chord two-thirds (`symmetricCubicControlPoints`).
 */
export function placementCornerAnchorDragCubicControlPoints(
  p0: { x: number; y: number },
  p3: { x: number; y: number },
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number }
): CubicControlPoints {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-9) {
    return placementZeroChordCubicControlPointsFromDrag(p0, dragStart, dragCurrent);
  }

  const ddx = dragCurrent.x - dragStart.x;
  const ddy = dragCurrent.y - dragStart.y;
  const dragLen = Math.hypot(ddx, ddy);
  if (dragLen < 1e-9) {
    const base = symmetricCubicControlPoints(p0, p3);
    return { x1: p0.x, y1: p0.y, x2: base.x2, y2: base.y2 };
  }

  const ux = ddx / dragLen;
  const uy = ddy / dragLen;
  const k = dragLen;
  return {
    x1: p0.x,
    y1: p0.y,
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

/** Frozen handle intent after first-segment meaningful drag; `P3` is planted on the next primary down. */
export type PenFirstAnchorP3Draft = {
  /**
   * Drag origin for the **first** (mirrored-handle) gesture on `M` only; used while awaiting `P3` in
   * {@link penDraftFirstSegmentPreviewD}. For the **second** gesture (first `C` from `M` with draft on the
   * pending segment), corner incoming `P2` uses drag from planted `P3` (= preview/commit chord end), not this field.
   */
  placementDragStartSvg: { x: number; y: number };
  /** Pointer SVG at meaningful mouseup (incoming handle / Alt placement sample). */
  dragCommitSvg: { x: number; y: number };
  ctrlCurve: boolean;
  curveAltChord: boolean;
  shiftAngleSnap: boolean;
  /**
   * Outgoing cubic `P1` from step-one mirrored drag (not serializable until `P3` exists).
   * Used for awaiting-`P3` preview and commit so `P1` matches the handle the user set.
   */
  frozenOutgoingP1Svg?: { x: number; y: number };
};

function snapCubicControlsFromShiftAnchor(
  anchor: { x: number; y: number },
  end: { x: number; y: number },
  controls: CubicControlPoints,
  altEndHandleOnlyPlacement: boolean
): CubicControlPoints {
  const s = snapVectorTo45DegFrom(end, { x: controls.x2, y: controls.y2 });
  if (altEndHandleOnlyPlacement) {
    return { ...controls, x2: s.x, y2: s.y };
  }
  return {
    x1: anchor.x + end.x - s.x,
    y1: anchor.y + end.y - s.y,
    x2: s.x,
    y2: s.y
  };
}

/**
 * Cubic controls for pen pending preview/commit (matches
 * {@link commitPenDraggedCurveOnSession} / overlay chrome via {@link penAdjustedCubicControlsForPendingLikeDrag}).
 * Default placement uses {@link placementCornerAnchorDragCubicControlPoints}; Alt uses pointer placement.
 */
export function penAdjustedCubicControlsForPendingLikeDrag(
  anchor: { x: number; y: number },
  end: { x: number; y: number },
  dragCurrent: { x: number; y: number },
  dragStartSvg: { x: number; y: number },
  segments: readonly PenPathSegment[],
  altEndOnly: boolean,
  shiftAngleSnap: boolean,
  /** First-anchor awaiting `P3`: preview endpoint has no incoming handle (`P2 === P3`). */
  zeroIncomingAtEnd = false
): CubicControlPoints {
  const degenerateChord = penSvgDistanceSq(anchor, end) < 1e-12;
  const raw = altEndOnly
    ? degenerateChord
      ? { x1: anchor.x, y1: anchor.y, x2: dragCurrent.x, y2: dragCurrent.y }
      : placementPointerCubicControlPoints(anchor, end, dragCurrent, true)
    : placementCornerAnchorDragCubicControlPoints(anchor, end, dragStartSvg, dragCurrent);
  let adjusted: CubicControlPoints;
  if (!altEndOnly) {
    const st = penReflectStateAfterCommitted(segments);
    if (penCubicSmoothReflectP1Usable(st, anchor) && st) {
      adjusted = { ...raw, x1: 2 * anchor.x - st.cubicCp2X, y1: 2 * anchor.y - st.cubicCp2Y };
    } else {
      adjusted = raw;
    }
  } else {
    adjusted = raw;
  }
  if (shiftAngleSnap) {
    adjusted = snapCubicControlsFromShiftAnchor(anchor, end, adjusted, altEndOnly);
  }
  if (zeroIncomingAtEnd) {
    adjusted = { ...adjusted, x2: end.x, y2: end.y };
  }
  return adjusted;
}

/**
 * First-vertex click-drag: **P1** sits on the pointer sample (`dragPt`, optionally Shift-snapped);
 * **P2** is the reflection of **P1** through `anchor` so the join at the moveto stays symmetric
 * (`P2 = 2·anchor − P1`). Matches “handle tracks cursor 1:1” while keeping a single degree of freedom.
 */
export function penFirstAnchorMirroredHandleControlsFromDrag(
  anchor: { x: number; y: number },
  dragPt: { x: number; y: number },
  shiftAngleSnap: boolean
): CubicControlPoints {
  const snapped = shiftAngleSnap ? snapVectorTo45DegFrom(anchor, dragPt) : dragPt;
  const dx = snapped.x - anchor.x;
  const dy = snapped.y - anchor.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) {
    return { x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: anchor.y };
  }
  const x1 = snapped.x;
  const y1 = snapped.y;
  return {
    x1,
    y1,
    x2: 2 * anchor.x - x1,
    y2: 2 * anchor.y - y1
  };
}

/**
 * Append one pending-style curve segment to `baseD` (explicit `M`/`L`/`C`/… commands).
 * Shared by {@link PenToolSession} preview/commit paths and first-anchor `M`-only draft preview.
 */
export function penCurveStyledAppendToD(
  baseD: string,
  opts: {
    anchor: { x: number; y: number };
    end: { x: number; y: number };
    dragCurrent: { x: number; y: number };
    placementDragStartSvg: { x: number; y: number };
    ctrlCurve: boolean;
    curveAltChord: boolean;
    shiftAngleSnap: boolean;
    segments: readonly PenPathSegment[];
    /** After first-anchor draft mouseup: provisional `P3` shows no incoming handle in preview. */
    zeroIncomingAtSegmentEnd?: boolean;
    /** Outgoing `P1` locked from step-one mirrored drag (awaiting-`P3` preview + commit). */
    frozenOutgoingP1?: { x: number; y: number };
  }
): string {
  const {
    anchor,
    end,
    dragCurrent,
    placementDragStartSvg,
    ctrlCurve,
    curveAltChord,
    shiftAngleSnap,
    segments,
    zeroIncomingAtSegmentEnd = false,
    frozenOutgoingP1
  } = opts;
  const kind = penDragCurveAuthoringKind(ctrlCurve, segments);
  const altEndOnly = curveAltChord;

  switch (kind) {
    case 'cubic': {
      let controls = penAdjustedCubicControlsForPendingLikeDrag(
        anchor,
        end,
        dragCurrent,
        placementDragStartSvg,
        segments,
        altEndOnly,
        shiftAngleSnap,
        zeroIncomingAtSegmentEnd
      );
      if (frozenOutgoingP1 && !altEndOnly) {
        controls = { ...controls, x1: frozenOutgoingP1.x, y1: frozenOutgoingP1.y };
      }
      return appendCubicToD(baseD, controls, end);
    }
    case 'quadratic': {
      let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
      if (shiftAngleSnap) {
        const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
        qc = { x1: s.x, y1: s.y };
      }
      return appendQuadraticToD(baseD, qc.x1, qc.y1, end.x, end.y);
    }
    case 'smoothCubic': {
      if (curveAltChord) {
        const st = penReflectStateAfterCommitted(segments);
        if (!st) {
          let hx = dragCurrent.x;
          let hy = dragCurrent.y;
          if (shiftAngleSnap) {
            const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
            hx = s.x;
            hy = s.y;
          }
          return appendSmoothCubicToD(baseD, hx, hy, end.x, end.y);
        }
        const useReflect = penCubicSmoothReflectP1Usable(st, anchor);
        const x1 = useReflect ? 2 * anchor.x - st.cubicCp2X : anchor.x;
        const y1 = useReflect ? 2 * anchor.y - st.cubicCp2Y : anchor.y;
        let hx = dragCurrent.x;
        let hy = dragCurrent.y;
        if (shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
          hx = s.x;
          hy = s.y;
        }
        return appendCubicToD(baseD, { x1, y1, x2: hx, y2: hy }, end);
      }
      let hx = dragCurrent.x;
      let hy = dragCurrent.y;
      if (shiftAngleSnap) {
        const s = snapVectorTo45DegFrom(end, { x: hx, y: hy });
        hx = s.x;
        hy = s.y;
      }
      return appendSmoothCubicToD(baseD, hx, hy, end.x, end.y);
    }
    default: {
      if (curveAltChord) {
        let qc = placementPointerQuadraticControlPoint(anchor, end, dragCurrent);
        if (shiftAngleSnap) {
          const s = snapVectorTo45DegFrom(end, { x: qc.x1, y: qc.y1 });
          qc = { x1: s.x, y1: s.y };
        }
        return appendQuadraticToD(baseD, qc.x1, qc.y1, end.x, end.y);
      }
      if (shiftAngleSnap) {
        const st = penReflectStateAfterCommitted(segments);
        if (st) {
          let ix = 2 * anchor.x - st.quadCpX;
          let iy = 2 * anchor.y - st.quadCpY;
          const s = snapVectorTo45DegFrom(end, { x: ix, y: iy });
          return appendQuadraticToD(baseD, s.x, s.y, end.x, end.y);
        }
      }
      return appendSmoothQuadraticToD(baseD, end.x, end.y);
    }
  }
}

/**
 * Preview `d` for moveto-only segments plus first-anchor draft: `provisionalEnd` is usually the live pointer;
 * `dragSample` is live while dragging, then frozen from {@link PenFirstAnchorP3Draft}.
 * When `draft` is set (awaiting `P3` after mouseup), the cubic preview uses **no incoming handle** at the
 * provisional endpoint (`P2 === P3`), matching Illustrator-style rubber-band before the next click.
 * If {@link PenFirstAnchorP3Draft.frozenOutgoingP1Svg} is set, it fixes **P1** to the step-one mirrored handle.
 */
export function penDraftFirstSegmentPreviewD(
  segments: readonly PenPathSegment[],
  draft: PenFirstAnchorP3Draft | null,
  anchor: { x: number; y: number },
  provisionalEnd: { x: number; y: number },
  /** Live drag while pointer down; after mouseup use `draft.dragCommitSvg`. */
  dragSample: { x: number; y: number },
  pendingPlacementDragStartSvg: { x: number; y: number },
  ctrlCurve: boolean,
  curveAltChord: boolean,
  shiftAngleSnap: boolean
): string {
  const base = penPathSegmentsToD(segments);
  const placement = draft?.placementDragStartSvg ?? pendingPlacementDragStartSvg;
  const dragCurrent = draft ? draft.dragCommitSvg : dragSample;
  const cc = draft?.ctrlCurve ?? ctrlCurve;
  const alt = draft?.curveAltChord ?? curveAltChord;
  const sh = draft?.shiftAngleSnap ?? shiftAngleSnap;
  return penCurveStyledAppendToD(base, {
    anchor,
    end: provisionalEnd,
    dragCurrent,
    placementDragStartSvg: placement,
    ctrlCurve: cc,
    curveAltChord: alt,
    shiftAngleSnap: sh,
    segments,
    /** Frozen draft = awaiting `P3`; Illustrator-style preview shows endpoint without incoming handle. */
    zeroIncomingAtSegmentEnd: draft != null,
    frozenOutgoingP1: draft?.frozenOutgoingP1Svg
  });
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

/**
 * Whether smooth cubic P1 reflection from the previous segment's `P2` is meaningful at `anchor`.
 * When the prior cubic's `P2` coincides with the vertex (zero incoming), `2*anchor − P2` collapses
 * to `anchor` and callers should use {@link placementCornerAnchorDragCubicControlPoints} instead.
 */
export function penCubicSmoothReflectP1Usable(
  st: PenSvgReflectState | null,
  anchor: { x: number; y: number }
): boolean {
  if (!st?.canReflectCubic) return false;
  return penSvgDistanceSq({ x: st.cubicCp2X, y: st.cubicCp2Y }, anchor) >= 1e-10;
}

/**
 * Option C (pen-drag-close-m-z-parity): if the last drawable vertex misses the subpath `M` by
 * numerical dust only, rewrite that segment’s endpoint to the moveto — avoids a corrective segment
 * and keeps `Z` paired with exact `M` tokens after serialize.
 */
export function penRewriteLastSegmentEndToMatchMoveto(
  segments: readonly PenPathSegment[],
  moveto: { x: number; y: number },
  /** Max squared user-space gap to treat as float drift (strict {@link penSvgDistanceSq} “closed” uses 1e-10). */
  maxSq = 1e-8
): PenPathSegment[] | null {
  if (segments.length < 2 || segments[0].type !== 'M') return null;
  const lv = lastCommittedVertex(segments);
  if (!lv) return null;
  const gapSq = penSvgDistanceSq(lv, moveto);
  if (gapSq < 1e-10 || gapSq > maxSq) return null;
  const idx = segments.length - 1;
  const segs = segments.map((s) => ({ ...s })) as PenPathSegment[];
  const last = segs[idx];
  switch (last.type) {
    case 'L':
    case 'C':
    case 'Q':
    case 'S':
    case 'T':
      segs[idx] = { ...last, x: moveto.x, y: moveto.y } as PenPathSegment;
      return segs;
    default:
      return null;
  }
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
