/** jsdom stubs for SVG geometry APIs used by coordinate / layout tests. */

export type SvgGeometryMock = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SvgCtmMock = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

const DEFAULT_CTM: SvgCtmMock = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function toDomRect(box: SvgGeometryMock): DOMRect {
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height,
    toJSON: () => ({ ...box })
  } as DOMRect;
}

function toDomMatrix(ctm: SvgCtmMock): DOMMatrix {
  return {
    a: ctm.a,
    b: ctm.b,
    c: ctm.c,
    d: ctm.d,
    e: ctm.e,
    f: ctm.f,
    inverse: () => toDomMatrix({ a: 1 / ctm.a, b: 0, c: 0, d: 1 / ctm.d, e: -ctm.e / ctm.a, f: -ctm.f / ctm.d }),
    multiply: () => toDomMatrix(ctm)
  } as DOMMatrix;
}

/** Attach getBBox / getCTM / getScreenCTM stubs to an SVG graphics element in jsdom. */
export function stubSvgElementGeometry(
  element: Element,
  geometry: SvgGeometryMock,
  ctm: SvgCtmMock = DEFAULT_CTM
): void {
  const graphics = element as SVGGraphicsElement & {
    getBBox?: () => DOMRect;
    getCTM?: () => DOMMatrix | null;
    getScreenCTM?: () => DOMMatrix | null;
  };

  graphics.getBBox = () => toDomRect(geometry);
  graphics.getCTM = () => toDomMatrix(ctm);
  graphics.getScreenCTM = () => toDomMatrix(ctm);
}

/** Create an SVG element with geometry stubs already applied. */
export function createStubbedSvgElement(
  tagName: string,
  id: string,
  geometry: SvgGeometryMock,
  ctm?: SvgCtmMock
): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  el.id = id;
  stubSvgElementGeometry(el, geometry, ctm);
  return el;
}

/** Sum axis-aligned boxes (useful for asserting union bounds in tests). */
export function unionAxisAlignedBoxes(boxes: SvgGeometryMock[]): SvgGeometryMock | null {
  if (boxes.length === 0) return null;
  const xs = boxes.map((b) => b.x);
  const ys = boxes.map((b) => b.y);
  const rights = boxes.map((b) => b.x + b.width);
  const bottoms = boxes.map((b) => b.y + b.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...rights) - x, height: Math.max(...bottoms) - y };
}
