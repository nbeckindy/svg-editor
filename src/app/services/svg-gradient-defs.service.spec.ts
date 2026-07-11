import { TestBed } from '@angular/core/testing';
import { editorPortTestProviders } from '../testing/editor-port-test-providers';
import { EDITOR_DOCUMENT_DEFS_ATTR } from './svg-editor-stage.constants';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgExportService } from './svg-export.service';
import { SvgGradientDefsService } from './svg-gradient-defs.service';

describe('SvgGradientDefsService', () => {
  let doc: SvgEditorDocumentService;
  let exportSvc: SvgExportService;
  let gradients: SvgGradientDefsService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: editorPortTestProviders });
    doc = TestBed.inject(SvgEditorDocumentService);
    exportSvc = TestBed.inject(SvgExportService);
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

  it('stores editor gradients in content-group defs so exportSVG includes them', () => {
    const svgContent = `<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="50" fill="#808080"/></svg>`;
    doc.initializeSVG(container, svgContent);
    const gradId = gradients.createLinearGradientFillForShape('r1', '#808080', '#ffffff');
    const documentDefs = doc.getDocumentDefsNode();
    expect(documentDefs).not.toBeNull();
    expect(documentDefs!.getAttribute(EDITOR_DOCUMENT_DEFS_ATTR)).toBe('true');
    expect(documentDefs!.querySelector(`#${gradId}`)).not.toBeNull();
    const exported = exportSvc.exportSVG();
    expect(exported).toContain('<linearGradient');
    expect(exported).toContain(`id="${gradId}"`);
    expect(exported).toContain(`url(#${gradId})`);
  });

  it('purgeGradientDefIfUnreferenced removes def with zero paint refs', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><linearGradient id="g1"><stop offset="0%" stop-color="#f00"/></linearGradient></defs>
      <rect id="r1" width="10" height="10" fill="url(#g1)"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    const svg = doc.getSVGInstance()!;
    (svg.findOne('#r1')!.node as SVGRectElement).setAttribute('fill', '#ff0000');
    gradients.purgeGradientDefIfUnreferenced('g1');
    expect(gradients.findGradientDomElement('g1')).toBeNull();
    expect(exportSvc.exportSVG()).not.toContain('linearGradient');
  });

  it('purgeGradientDefIfUnreferenced keeps def still referenced by another shape', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><linearGradient id="g1"><stop offset="0%" stop-color="#f00"/></linearGradient></defs>
      <rect id="r1" width="10" height="10" fill="url(#g1)"/>
      <rect id="r2" width="10" height="10" fill="url(#g1)"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    const svg = doc.getSVGInstance()!;
    (svg.findOne('#r1')!.node as SVGRectElement).setAttribute('fill', '#ff0000');
    gradients.purgeGradientDefIfUnreferenced('g1');
    expect(gradients.findGradientDomElement('g1')).not.toBeNull();
  });

  it('merges multiple imported defs siblings into one canonical defs block', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><linearGradient id="g1"><stop offset="0%" stop-color="#f00"/></linearGradient></defs>
      <defs><clipPath id="cp"><rect width="10" height="10"/></clipPath></defs>
      <rect id="r1" width="10" height="10" fill="url(#g1)" clip-path="url(#cp)"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    const contentGroup = doc.getSVGInstance()!.findOne('[data-editor-content-group]')!.node as Element;
    const defsChildren = Array.from(contentGroup.children).filter((c) => c.tagName.toLowerCase() === 'defs');
    expect(defsChildren).toHaveLength(1);
    expect(defsChildren[0].getAttribute(EDITOR_DOCUMENT_DEFS_ATTR)).toBe('true');
    expect(defsChildren[0].querySelector('#g1')).not.toBeNull();
    expect(defsChildren[0].querySelector('#cp')).not.toBeNull();
    const exported = exportSvc.exportSVG();
    expect(exported).toContain('linearGradient');
    expect(exported).toContain('clipPath');
  });
});
