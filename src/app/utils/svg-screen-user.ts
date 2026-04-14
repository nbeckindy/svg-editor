/**
 * Map a **local** `getBBox()` (untransformed geometry) to an axis-aligned box in **root SVG user
 * space** using `getTransformToElement(rootSvg)`. Includes **ancestor** transforms; SVG.js
 * `matrixify()` alone only parses this element’s `transform` attribute and misses parent `<g>` etc.
 */
export function localBBoxToRootUserAabb(
  node: SVGGraphicsElement,
  rootSvg: SVGSVGElement,
  local: Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>
): { x: number; y: number; width: number; height: number } | null {
  /** SVG 1.1 / browsers; omitted from some TypeScript `lib` versions. */
  const toRoot = (node as unknown as { getTransformToElement?: (el: SVGSVGElement) => DOMMatrix })
    .getTransformToElement;
  if (typeof toRoot !== 'function' || typeof rootSvg.createSVGPoint !== 'function') {
    return null;
  }
  let m: DOMMatrix;
  try {
    m = toRoot.call(node, rootSvg);
  } catch {
    return null;
  }
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x, y: local.y + local.height },
    { x: local.x + local.width, y: local.y + local.height }
  ];
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const c of corners) {
    const p = rootSvg.createSVGPoint();
    p.x = c.x;
    p.y = c.y;
    const tp = p.matrixTransform(m);
    if (!Number.isFinite(tp.x) || !Number.isFinite(tp.y)) return null;
    xMin = Math.min(xMin, tp.x);
    xMax = Math.max(xMax, tp.x);
    yMin = Math.min(yMin, tp.y);
    yMax = Math.max(yMax, tp.y);
  }
  const w = xMax - xMin;
  const h = yMax - yMin;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 0 || h < 0) return null;
  return { x: xMin, y: yMin, width: w, height: h };
}

/**
 * Map a screen-space axis-aligned rect to root SVG **user** coordinates (viewBox space)
 * using the root element's screen CTM. Correct for letterboxing (`xMidYMid meet`), pan/zoom
 * on ancestors, and non-uniform `preserveAspectRatio="none"` — unlike linear scaling from
 * `getBoundingClientRect` / viewBox width alone.
 */
export function screenRectToRootSvgUserRect(
  rootSvg: SVGSVGElement,
  screenRect: DOMRectReadOnly
): { x: number; y: number; width: number; height: number } | null {
  if (typeof rootSvg.getScreenCTM !== 'function' || typeof rootSvg.createSVGPoint !== 'function') {
    return null;
  }
  const ctm = rootSvg.getScreenCTM();
  if (!ctm) return null;
  let inv: DOMMatrix;
  try {
    inv = ctm.inverse();
  } catch {
    return null;
  }
  const map = (sx: number, sy: number) => {
    const p = rootSvg.createSVGPoint();
    p.x = sx;
    p.y = sy;
    return p.matrixTransform(inv);
  };
  const corners = [
    map(screenRect.left, screenRect.top),
    map(screenRect.right, screenRect.top),
    map(screenRect.left, screenRect.bottom),
    map(screenRect.right, screenRect.bottom),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { x: minX, y: minY, width, height };
}

/** Map a viewport point to root SVG user coordinates (same space as shape bboxes). */
export function screenPointToRootSvgUserPoint(
  rootSvg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  if (typeof rootSvg.getScreenCTM !== 'function' || typeof rootSvg.createSVGPoint !== 'function') {
    return null;
  }
  const ctm = rootSvg.getScreenCTM();
  if (!ctm) return null;
  let inv: DOMMatrix;
  try {
    inv = ctm.inverse();
  } catch {
    return null;
  }
  const p = rootSvg.createSVGPoint();
  p.x = clientX;
  p.y = clientY;
  const u = p.matrixTransform(inv);
  return { x: u.x, y: u.y };
}
