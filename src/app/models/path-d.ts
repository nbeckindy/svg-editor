import type { PenPathSegment } from './pen-path';

/** Parsed absolute segments for editing; `Q` stores quadratic control + end (smooth `T` is normalized to `Q`). */
export type PathSegment = PenPathSegment | { type: 'Z' } | { type: 'Q'; x1: number; y1: number; x: number; y: number };

export interface ParsePathDResult {
  segments: PathSegment[];
  errors: string[];
}

type PathToken = { kind: 'command'; value: string } | { kind: 'number'; value: number };

const COMMAND_RE = /^[a-zA-Z]$/;
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const TAU = Math.PI * 2;

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
}

function arcToCubicSegments(
  startX: number,
  startY: number,
  rxIn: number,
  ryIn: number,
  axisRotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  endX: number,
  endY: number
): Array<Extract<PathSegment, { type: 'C' }>> {
  if ((Math.abs(startX - endX) < 1e-12 && Math.abs(startY - endY) < 1e-12) || rxIn === 0 || ryIn === 0) {
    return [];
  }

  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx < 1e-12 || ry < 1e-12) return [];

  const phi = (axisRotationDeg % 360) * (Math.PI / 180);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (startX - endX) / 2;
  const dy2 = (startY - endY) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let rxSq = rx * rx;
  let rySq = ry * ry;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const denominator = rxSq * y1pSq + rySq * x1pSq;
  const root = denominator <= 0 ? 0 : Math.sqrt(Math.max(0, numerator / denominator));
  const coef = sign * root;
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const centerX = cosPhi * cxp - sinPhi * cyp + (startX + endX) / 2;
  const centerY = sinPhi * cxp + cosPhi * cyp + (startY + endY) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = vectorAngle(1, 0, ux, uy);
  let deltaTheta = vectorAngle(ux, uy, vx, vy);
  if (!sweep && deltaTheta > 0) {
    deltaTheta -= TAU;
  } else if (sweep && deltaTheta < 0) {
    deltaTheta += TAU;
  }

  const segmentCount = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
  const step = deltaTheta / segmentCount;
  const segments: Array<Extract<PathSegment, { type: 'C' }>> = [];

  const mapPoint = (u: number, v: number): { x: number; y: number } => ({
    x: centerX + cosPhi * rx * u - sinPhi * ry * v,
    y: centerY + sinPhi * rx * u + cosPhi * ry * v
  });

  for (let i = 0; i < segmentCount; i++) {
    const t1 = theta1 + i * step;
    const t2 = t1 + step;
    const cosT1 = Math.cos(t1);
    const sinT1 = Math.sin(t1);
    const cosT2 = Math.cos(t2);
    const sinT2 = Math.sin(t2);

    const alpha = (4 / 3) * Math.tan((t2 - t1) / 4);
    const c1Unit = { x: cosT1 - alpha * sinT1, y: sinT1 + alpha * cosT1 };
    const c2Unit = { x: cosT2 + alpha * sinT2, y: sinT2 - alpha * cosT2 };
    const endUnit = { x: cosT2, y: sinT2 };

    const c1 = mapPoint(c1Unit.x, c1Unit.y);
    const c2 = mapPoint(c2Unit.x, c2Unit.y);
    const p = mapPoint(endUnit.x, endUnit.y);

    segments.push({
      type: 'C',
      x1: c1.x,
      y1: c1.y,
      x2: c2.x,
      y2: c2.y,
      x: i === segmentCount - 1 ? endX : p.x,
      y: i === segmentCount - 1 ? endY : p.y
    });
  }

  return segments;
}

function formatCoord(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

function tokenizePathData(pathData: string): { tokens: PathToken[]; errors: string[] } {
  const tokens: PathToken[] = [];
  const errors: string[] = [];
  let cursor = 0;

  while (cursor < pathData.length) {
    const char = pathData[cursor];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === ',') {
      cursor++;
      continue;
    }

    if (COMMAND_RE.test(char)) {
      tokens.push({ kind: 'command', value: char });
      cursor++;
      continue;
    }

    const numericSlice = pathData.slice(cursor);
    const numericMatch = numericSlice.match(NUMBER_RE);
    if (numericMatch) {
      tokens.push({ kind: 'number', value: Number(numericMatch[0]) });
      cursor += numericMatch[0].length;
      continue;
    }

    errors.push(`Unexpected token "${char}" at index ${cursor}.`);
    cursor++;
  }

  return { tokens, errors };
}

function isNumberToken(token: PathToken | undefined): token is { kind: 'number'; value: number } {
  return !!token && token.kind === 'number';
}

/**
 * Parse SVG `d` path data into absolute segments.
 *
 * Supports M/L/H/V/C/Q/T/A/Z (uppercase + lowercase); smooth `T`/`t` is normalized to explicit `Q`.
 * Unsupported commands are reported in `errors`.
 * Parser is tolerant by design: it never throws and returns any valid prefix it can parse.
 */
export function parsePathD(pathData: string): ParsePathDResult {
  const trimmed = pathData.trim();
  if (!trimmed) return { segments: [], errors: [] };

  const { tokens, errors } = tokenizePathData(trimmed);
  const segments: PathSegment[] = [];

  let index = 0;
  let activeCommand: string | null = null;
  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  let hasMoveto = false;
  /** Absolute quadratic control used for implicit `T` reflection (SVG: defaults to current point). */
  let lastQuadAbsX = 0;
  let lastQuadAbsY = 0;

  const syncQuadToCurrent = (): void => {
    lastQuadAbsX = currentX;
    lastQuadAbsY = currentY;
  };

  const readNumber = (): number | null => {
    const token = tokens[index];
    if (!isNumberToken(token)) {
      const commandHint = activeCommand ?? 'unknown';
      errors.push(`Command ${commandHint} is missing numeric arguments near token ${index}.`);
      return null;
    }
    index++;
    return token.value;
  };

  const skipNumbersUntilNextCommand = (): void => {
    while (isNumberToken(tokens[index])) index++;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    let command: string | null = activeCommand;

    if (token.kind === 'command') {
      command = token.value;
      activeCommand = command;
      index++;
    } else if (!command) {
      errors.push(`Expected a command at token ${index}.`);
      index++;
      continue;
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;

    if (
      upper !== 'M' &&
      upper !== 'L' &&
      upper !== 'H' &&
      upper !== 'V' &&
      upper !== 'C' &&
      upper !== 'Z' &&
      upper !== 'Q' &&
      upper !== 'T' &&
      upper !== 'A'
    ) {
      errors.push(`Unsupported path command "${command}".`);
      activeCommand = null;
      skipNumbersUntilNextCommand();
      continue;
    }

    if (upper === 'Z') {
      if (!hasMoveto) {
        errors.push('Path cannot close before an initial moveto.');
        continue;
      }
      segments.push({ type: 'Z' });
      currentX = subpathStartX;
      currentY = subpathStartY;
      syncQuadToCurrent();
      continue;
    }

    if (upper === 'M') {
      const x = readNumber();
      const y = readNumber();
      if (x === null || y === null) break;

      const absX = relative ? currentX + x : x;
      const absY = relative ? currentY + y : y;
      segments.push({ type: 'M', x: absX, y: absY });
      currentX = absX;
      currentY = absY;
      subpathStartX = absX;
      subpathStartY = absY;
      hasMoveto = true;
      activeCommand = relative ? 'l' : 'L';
      syncQuadToCurrent();

      while (isNumberToken(tokens[index])) {
        const lineX = readNumber();
        const lineY = readNumber();
        if (lineX === null || lineY === null) break;
        const absoluteLineX = relative ? currentX + lineX : lineX;
        const absoluteLineY = relative ? currentY + lineY : lineY;
        segments.push({ type: 'L', x: absoluteLineX, y: absoluteLineY });
        currentX = absoluteLineX;
        currentY = absoluteLineY;
        syncQuadToCurrent();
      }
      continue;
    }

    if (!hasMoveto) {
      errors.push(`Path must start with moveto before command "${command}".`);
      skipNumbersUntilNextCommand();
      continue;
    }

    if (upper === 'L') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const x = readNumber();
        const y = readNumber();
        if (x === null || y === null) break;
        const absX = relative ? currentX + x : x;
        const absY = relative ? currentY + y : y;
        segments.push({ type: 'L', x: absX, y: absY });
        currentX = absX;
        currentY = absY;
        syncQuadToCurrent();
      }
      if (!consumedAny) errors.push(`Command ${command} is missing coordinate pairs.`);
      continue;
    }

    if (upper === 'H') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const x = readNumber();
        if (x === null) break;
        const absX = relative ? currentX + x : x;
        segments.push({ type: 'L', x: absX, y: currentY });
        currentX = absX;
        syncQuadToCurrent();
      }
      if (!consumedAny) errors.push(`Command ${command} is missing horizontal coordinates.`);
      continue;
    }

    if (upper === 'V') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const y = readNumber();
        if (y === null) break;
        const absY = relative ? currentY + y : y;
        segments.push({ type: 'L', x: currentX, y: absY });
        currentY = absY;
        syncQuadToCurrent();
      }
      if (!consumedAny) errors.push(`Command ${command} is missing vertical coordinates.`);
      continue;
    }

    if (upper === 'Q') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const x1 = readNumber();
        const y1 = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (x1 === null || y1 === null || x === null || y === null) break;
        const absX1 = relative ? currentX + x1 : x1;
        const absY1 = relative ? currentY + y1 : y1;
        const absX = relative ? currentX + x : x;
        const absY = relative ? currentY + y : y;
        segments.push({ type: 'Q', x1: absX1, y1: absY1, x: absX, y: absY });
        lastQuadAbsX = absX1;
        lastQuadAbsY = absY1;
        currentX = absX;
        currentY = absY;
      }
      if (!consumedAny) errors.push(`Command ${command} is missing quadratic coordinate tuples.`);
      continue;
    }

    if (upper === 'T') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const x = readNumber();
        const y = readNumber();
        if (x === null || y === null) break;
        const absX = relative ? currentX + x : x;
        const absY = relative ? currentY + y : y;
        const cx = 2 * currentX - lastQuadAbsX;
        const cy = 2 * currentY - lastQuadAbsY;
        segments.push({ type: 'Q', x1: cx, y1: cy, x: absX, y: absY });
        lastQuadAbsX = cx;
        lastQuadAbsY = cy;
        currentX = absX;
        currentY = absY;
      }
      if (!consumedAny) errors.push(`Command ${command} is missing coordinate pairs.`);
      continue;
    }

    if (upper === 'A') {
      let consumedAny = false;
      while (isNumberToken(tokens[index])) {
        consumedAny = true;
        const rx = readNumber();
        const ry = readNumber();
        const axisRotation = readNumber();
        const largeArcFlag = readNumber();
        const sweepFlag = readNumber();
        const x = readNumber();
        const y = readNumber();
        if (
          rx === null ||
          ry === null ||
          axisRotation === null ||
          largeArcFlag === null ||
          sweepFlag === null ||
          x === null ||
          y === null
        ) {
          break;
        }
        const absX = relative ? currentX + x : x;
        const absY = relative ? currentY + y : y;
        const cubics = arcToCubicSegments(
          currentX,
          currentY,
          rx,
          ry,
          axisRotation,
          largeArcFlag !== 0,
          sweepFlag !== 0,
          absX,
          absY
        );
        if (cubics.length === 0) {
          if (Math.abs(absX - currentX) > 1e-12 || Math.abs(absY - currentY) > 1e-12) {
            segments.push({ type: 'L', x: absX, y: absY });
          }
        } else {
          segments.push(...cubics);
        }
        currentX = absX;
        currentY = absY;
        syncQuadToCurrent();
      }
      if (!consumedAny) errors.push(`Command ${command} is missing arc tuples.`);
      continue;
    }

    let consumedAny = false;
    while (isNumberToken(tokens[index])) {
      consumedAny = true;
      const x1 = readNumber();
      const y1 = readNumber();
      const x2 = readNumber();
      const y2 = readNumber();
      const x = readNumber();
      const y = readNumber();
      if (x1 === null || y1 === null || x2 === null || y2 === null || x === null || y === null) break;
      const absX1 = relative ? currentX + x1 : x1;
      const absY1 = relative ? currentY + y1 : y1;
      const absX2 = relative ? currentX + x2 : x2;
      const absY2 = relative ? currentY + y2 : y2;
      const absX = relative ? currentX + x : x;
      const absY = relative ? currentY + y : y;
      segments.push({ type: 'C', x1: absX1, y1: absY1, x2: absX2, y2: absY2, x: absX, y: absY });
      currentX = absX;
      currentY = absY;
      syncQuadToCurrent();
    }
    if (!consumedAny) errors.push(`Command ${command} is missing cubic coordinate tuples.`);
  }

  return { segments, errors };
}

/**
 * Serialize parsed path segments using explicit uppercase commands.
 */
export function pathSegmentsToD(segments: readonly PathSegment[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.type === 'M') {
      parts.push('M', formatCoord(segment.x), formatCoord(segment.y));
      continue;
    }
    if (segment.type === 'L') {
      parts.push('L', formatCoord(segment.x), formatCoord(segment.y));
      continue;
    }
    if (segment.type === 'C') {
      parts.push(
        'C',
        formatCoord(segment.x1),
        formatCoord(segment.y1),
        formatCoord(segment.x2),
        formatCoord(segment.y2),
        formatCoord(segment.x),
        formatCoord(segment.y)
      );
      continue;
    }
    if (segment.type === 'Q') {
      parts.push(
        'Q',
        formatCoord(segment.x1),
        formatCoord(segment.y1),
        formatCoord(segment.x),
        formatCoord(segment.y)
      );
      continue;
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

/**
 * Parsed segments suitable for node editing / pen insert: no parse errors and starts with moveto.
 */
export function parsePathDForNodeEditing(pathData: string): PathSegment[] | null {
  const parsed = parsePathD(pathData);
  if (parsed.errors.length > 0) return null;
  if (parsed.segments.length === 0) return null;
  if (parsed.segments[0].type !== 'M') return null;
  return parsed.segments;
}
