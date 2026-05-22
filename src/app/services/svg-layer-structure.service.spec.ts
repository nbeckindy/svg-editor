import { TestBed } from '@angular/core/testing';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgLayerStructureService } from './svg-layer-structure.service';

describe('SvgLayerStructureService', () => {
  let doc: SvgEditorDocumentService;
  let layers: SvgLayerStructureService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    layers = TestBed.inject(SvgLayerStructureService);
    container = document.createElement('div');
    container.id = 'test-layer-structure';
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  it('getShapeIdsInDomOrder follows DOM order under nested groups', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <g id="outer">
        <rect id="a" x="0" y="0" width="1" height="1"/>
        <rect id="b" x="1" y="0" width="1" height="1"/>
      </g>
      <rect id="c" x="2" y="0" width="1" height="1"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    expect(layers.getShapeIdsInDomOrder(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
  });
});
