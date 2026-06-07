import type { PenToolSessionPorts } from './pen-tool-session-ports';

/** Minimal port surface for mapping root-SVG user coordinates to **Editor chrome** overlay pixels. */
export type PenOverlayPorts = Pick<PenToolSessionPorts, 'svgBboxToOverlayPixels'>;

/** One SVG user-space point → overlay pixel position (same as `svgBboxToOverlayPixels` with zero-size bbox). */
export function penSvgUserPointToOverlayPixel(
  ports: PenOverlayPorts,
  x: number,
  y: number
): { x: number; y: number } {
  return ports.svgBboxToOverlayPixels({ x, y, width: 0, height: 0 });
}

/** Segment in SVG user space → overlay line in pixel space. */
export function penSvgUserSegmentToOverlayLine(
  ports: PenOverlayPorts,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x1: number; y1: number; x2: number; y2: number } {
  const p1 = penSvgUserPointToOverlayPixel(ports, x1, y1);
  const p2 = penSvgUserPointToOverlayPixel(ports, x2, y2);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}
