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
