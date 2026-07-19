import { TestBed } from '@angular/core/testing';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { SvgShapeTextService } from './svg-shape-text.service';
import { CANONICAL_MULTILINE_TSPAN_DY } from '../../utils/text-multiline-tspans';

describe('SvgShapeTextService', () => {
  let doc: SvgEditorDocumentService;
  let textSvc: SvgShapeTextService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    textSvc = TestBed.inject(SvgShapeTextService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  function init(markup: string): void {
    doc.initializeSVG(container, markup);
  }

  it('getTextContent serializes dy tspans as newlines without mutating DOM', () => {
    init(
      `<svg viewBox="0 0 100 100"><text id="t1" x="10" y="20"><tspan x="10">a</tspan><tspan x="10" dy="1.2em" fill="red">b</tspan></text></svg>`
    );
    const before = container.querySelector('#t1')!.innerHTML;
    expect(textSvc.getTextContent('t1')).toBe('a\nb');
    expect(container.querySelector('#t1')!.innerHTML).toBe(before);
  });

  it('updateTextContent writes multiline as canonical tspans', () => {
    init(`<svg viewBox="0 0 100 100"><text id="t1" x="10" y="20">Hello</text></svg>`);
    textSvc.updateTextContent('t1', 'one\ntwo');
    const spans = Array.from(container.querySelectorAll('#t1 tspan'));
    expect(spans.map((s) => s.textContent)).toEqual(['one', 'two']);
    expect(spans[1]!.getAttribute('dy')).toBe(CANONICAL_MULTILINE_TSPAN_DY);
    expect(textSvc.getTextContent('t1')).toBe('one\ntwo');
  });

  it('updateTextContent keeps single-line as plain text', () => {
    init(
      `<svg viewBox="0 0 100 100"><text id="t1" x="10" y="20"><tspan>old</tspan></text></svg>`
    );
    textSvc.updateTextContent('t1', 'plain');
    expect(container.querySelectorAll('#t1 tspan').length).toBe(0);
    expect(container.querySelector('#t1')!.textContent).toBe('plain');
  });

  it('readShapeTextFields uses serialized multiline content', () => {
    init(
      `<svg viewBox="0 0 100 100"><text id="t1" x="10" y="20" font-size="16"><tspan x="10">Hi</tspan><tspan x="10" dy="1.2em">there</tspan></text></svg>`
    );
    const shape = doc.getSVGInstance()!.findOne('#t1')!;
    const fields = textSvc.readShapeTextFields(shape, shape.node as Element);
    expect(fields.textContent).toBe('Hi\nthere');
    expect(fields.fontSize).toBe(16);
  });
});
