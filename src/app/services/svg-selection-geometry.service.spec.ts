import { TestBed } from '@angular/core/testing';
import * as SvgScreenUser from '../utils/svg-screen-user';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgSelectionGeometryService } from './svg-selection-geometry.service';

describe('SvgSelectionGeometryService', () => {
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    container = document.createElement('div');
    container.id = 'test-svg-selection-geometry';
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    container.parentNode?.removeChild(container);
  });

  it('getShapeBBox returns null when document is not initialized', () => {
    const geometry = TestBed.inject(SvgSelectionGeometryService);
    expect(geometry.getShapeBBox('any-id')).toBeNull();
  });

  it('getShapeBBox maps layout attrs for <image> through localBBoxToRootUserAabb when getBBox is zero-area', () => {
    const aabbSpy = vi.spyOn(SvgScreenUser, 'localBBoxToRootUserAabb').mockImplementation((_node, _root, local) => ({
      x: local.x,
      y: local.y,
      width: local.width,
      height: local.height
    }));

    const doc = TestBed.inject(SvgEditorDocumentService);
    const geometry = TestBed.inject(SvgSelectionGeometryService);
    const svgContent = `<svg viewBox="0 0 100 100"><image id="i1" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" x="5" y="6" width="20" height="30"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const inst = doc.getSVGInstance()!;
    const img = inst.findOne('#i1')!.node as SVGImageElement;
    if (typeof img.getBBox === 'function') {
      vi.spyOn(img, 'getBBox').mockReturnValue({ x: 0, y: 0, width: 0, height: 0 } as DOMRect);
    }

    const b = geometry.getShapeBBox('i1');
    expect(b).not.toBeNull();
    expect(b!.width).toBeCloseTo(20, 5);
    expect(b!.height).toBeCloseTo(30, 5);
    expect(b!.x).toBeCloseTo(5, 5);
    expect(b!.y).toBeCloseTo(6, 5);
    expect(aabbSpy.mock.calls.some(([, , local]) => local.width === 20 && local.height === 30)).toBe(true);
  });
});
