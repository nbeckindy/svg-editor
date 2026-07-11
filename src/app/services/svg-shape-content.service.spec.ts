import { TestBed } from '@angular/core/testing';
import { editorPortTestProviders } from '../testing/editor-port-test-providers';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgShapeContentService } from './svg-shape-content.service';

describe('SvgShapeContentService', () => {
  let doc: SvgEditorDocumentService;
  let shapes: SvgShapeContentService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: editorPortTestProviders });
    doc = TestBed.inject(SvgEditorDocumentService);
    shapes = TestBed.inject(SvgShapeContentService);
    container = document.createElement('div');
    container.id = 'test-shape-content';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  it('addShape + getShapeProperties round-trip on initialized document', () => {
    const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10" fill="#abc"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const id = shapes.addShape('rect', { x: 5, y: 5, width: 20, height: 20, fill: '#112233' });
    expect(id).toBeTruthy();
    const el = doc.getSVGInstance()!.findOne(`#${id}`)!;
    const props = shapes.getShapeProperties(el as unknown as import('@svgdotjs/svg.js').Element);
    expect(props.id).toBe(id);
    expect(props.fill).toBe('#112233');
  });
});
