import { TestBed } from '@angular/core/testing';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgGradientDefsService } from './svg-gradient-defs.service';

describe('SvgGradientDefsService', () => {
  let doc: SvgEditorDocumentService;
  let gradients: SvgGradientDefsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    gradients = TestBed.inject(SvgGradientDefsService);
    container = document.createElement('div');
    container.id = 'test-gradient-defs';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  it('createLinearGradientFillForShape assigns url fill and defs entry', () => {
    const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#808080"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const gradId = gradients.createLinearGradientFillForShape('r1', '#808080', '#ffffff');
    expect(gradId.length).toBeGreaterThan(0);
    const svg = doc.getSVGInstance()!;
    const rect = svg.findOne('#r1')!.node as SVGRectElement;
    expect(rect.getAttribute('fill')).toContain(`url(#${gradId})`);
    expect(gradients.findGradientDomElement(gradId)).not.toBeNull();
  });
});
