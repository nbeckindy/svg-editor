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
 * Supports M/L/C/Q/T/Z (uppercase + lowercase); smooth `T`/`t` is normalized to explicit `Q`.
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

    if (upper !== 'M' && upper !== 'L' && upper !== 'C' && upper !== 'Z' && upper !== 'Q' && upper !== 'T') {
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
