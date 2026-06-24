import { TestBed } from '@angular/core/testing';
import { localBBoxToRootUserAabb } from '../utils/svg-screen-user';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';

/** jsdom lacks SVG CTM helpers; polyfill identity mapping for layout-box tests. */
function identityMatrix(): DOMMatrix {
  if (typeof DOMMatrix !== 'undefined') {
    return new DOMMatrix();
  }
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } as DOMMatrix;
}

function polyfillSvgCtm(rootSvg: SVGSVGElement, node: SVGGraphicsElement): void {
  Object.defineProperty(rootSvg, 'createSVGPoint', {
    configurable: true,
    writable: true,
    value() {
      const pt = {
        x: 0,
        y: 0,
        matrixTransform(matrix: DOMMatrix) {
          const x = pt.x * matrix.a + pt.y * matrix.c + matrix.e;
          const y = pt.x * matrix.b + pt.y * matrix.d + matrix.f;
          return { x, y } as DOMPoint;
        }
      };
      return pt;
    }
  });

  Object.defineProperty(node, 'getTransformToElement', {
    configurable: true,
    writable: true,
    value: () => identityMatrix()
  });
}

describe('SvgSelectionGeometryService', () => {
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    container = document.createElement('div');
    container.id = 'test-svg-selection-geometry';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  it('getShapeBBox returns null when document is not initialized', () => {
    const geometry = TestBed.inject(SvgSelectionGeometryService);
    expect(geometry.getShapeBBox('any-id')).toBeNull();
  });

  it('localBBoxToRootUserAabb maps image layout attrs in jsdom', () => {
    const doc = TestBed.inject(SvgEditorDocumentService);
    const svgContent = `<svg viewBox="0 0 100 100"><image id="i1" x="5" y="6" width="20" height="30"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const inst = doc.getSVGInstance()!;
    const rootSvg = inst.node as SVGSVGElement;
    const img = inst.findOne('#i1')!.node as SVGImageElement;
    polyfillSvgCtm(rootSvg, img);
    const aabb = localBBoxToRootUserAabb(img, rootSvg, { x: 5, y: 6, width: 20, height: 30 } as DOMRect);
    expect(aabb).not.toBeNull();
    expect(aabb!.width).toBeCloseTo(20, 5);
  });

  it('getShapeBBox maps layout attrs for <image> when getBBox is zero-area', () => {
    const doc = TestBed.inject(SvgEditorDocumentService);
    const geometry = TestBed.inject(SvgSelectionGeometryService);
    const svgContent = `<svg viewBox="0 0 100 100"><image id="i1" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" x="5" y="6" width="20" height="30"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const inst = doc.getSVGInstance()!;
    const rootSvg = inst.node as SVGSVGElement;
    const img = inst.findOne('#i1')!.node as SVGImageElement;
    polyfillSvgCtm(rootSvg, img);

    const b = geometry.getShapeBBox('i1', { preferScreenBounds: false });
    expect(b).not.toBeNull();
    expect(b!.width).toBeCloseTo(20, 5);
    expect(b!.height).toBeCloseTo(30, 5);
    expect(b!.x).toBeCloseTo(5, 5);
    expect(b!.y).toBeCloseTo(6, 5);
  });
});
