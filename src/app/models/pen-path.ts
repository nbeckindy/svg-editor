/**
 * Structured segments for incremental pen paths (maps to SVG d).
 * PP-3 adds runtime use of {@link PenPathCubicSegment}; generation is supported here so the model stays unified.
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
    };

export type CubicControlPoints = { x1: number; y1: number; x2: number; y2: number };

function formatCoord(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

/** Build a single `d` string from segments (no implicit commands). */
export function penPathSegmentsToD(segments: readonly PenPathSegment[]): string {
  const parts: string[] = [];
  for (const s of segments) {
    if (s.type === 'M') {
      parts.push('M', formatCoord(s.x), formatCoord(s.y));
    } else if (s.type === 'L') {
      parts.push('L', formatCoord(s.x), formatCoord(s.y));
    } else {
      parts.push(
        'C',
        formatCoord(s.x1),
        formatCoord(s.y1),
        formatCoord(s.x2),
        formatCoord(s.y2),
        formatCoord(s.x),
        formatCoord(s.y)
      );
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
  dragCurrent: { x: number; y: number }
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

  return {
    x1: base.x1 + nx * bend,
    y1: base.y1 + ny * bend,
    x2: base.x2 + nx * bend,
    y2: base.y2 + ny * bend
  };
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
  if (last.type === 'M') return { x: last.x, y: last.y };
  if (last.type === 'L') return { x: last.x, y: last.y };
  return { x: last.x, y: last.y };
}

/** At least one moveto and one additional drawable vertex (line or curve end). */
export function penPathSegmentsAreValid(segments: readonly PenPathSegment[]): boolean {
  if (segments.length < 2) return false;
  if (segments[0].type !== 'M') return false;
  for (let i = 1; i < segments.length; i++) {
    const t = segments[i].type;
    if (t === 'L' || t === 'C') return true;
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

  /** Current `d` string (may be invalid if fewer than two points). */
  getPathD(): string {
    return penPathSegmentsToD(this.segments);
  }

  reset(): void {
    this.segments = [];
  }

  /**
   * @returns `d` when {@link penPathSegmentsAreValid}, otherwise `null`.
   */
  finishPath(): string | null {
    if (!penPathSegmentsAreValid(this.segments)) return null;
    return this.getPathD();
  }
}
