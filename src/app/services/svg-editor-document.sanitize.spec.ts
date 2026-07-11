/**
 * Integration tests: live-DOM choke points strip attack payloads (ADR 0002, Slices 7–8).
 */
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgShapeContentService } from './svg-shape-content.service';
import { SvgIngestService } from './svg-ingest.service';

const COMBINED_ATTACK = `<svg xmlns="http://www.w3.org/2000/svg">
  <script>alert(1)</script>
  <defs><script>alert(2)</script></defs>
  <rect id="r1" width="10" height="10" onload="alert(3)" onclick="alert(4)"/>
  <foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(5)</script></body></foreignObject>
  <circle id="c1" r="5"/>
</svg>`;

describe('initializeSVG sanitization (Slice 7)', () => {
  let doc: SvgEditorDocumentService;
  let container: HTMLElement;

  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
    vi.restoreAllMocks();
  });

  it('mounts zero <script> elements after ingest', () => {
    doc.initializeSVG(container, COMBINED_ATTACK);
    expect(container.querySelectorAll('script')).toHaveLength(0);
  });

  it('mounts zero on* attributes after ingest', () => {
    doc.initializeSVG(container, COMBINED_ATTACK);
    const allEls = Array.from(container.querySelectorAll('*'));
    const hasHandlers = allEls.some(el =>
      Array.from(el.attributes).some(a => /^on[a-zA-Z]/i.test(a.name))
    );
    expect(hasHandlers).toBe(false);
  });

  it('mounts zero <foreignObject> elements after ingest', () => {
    doc.initializeSVG(container, COMBINED_ATTACK);
    expect(container.querySelectorAll('foreignObject')).toHaveLength(0);
  });

  it('preserves legitimate content after stripping', () => {
    doc.initializeSVG(container, COMBINED_ATTACK);
    expect(container.querySelectorAll('#c1')).toHaveLength(1);
    expect(container.querySelectorAll('#r1')).toHaveLength(1);
  });
});

describe('SvgIngestService + insertShapeMarkup sanitization (Slice 8)', () => {
  let doc: SvgEditorDocumentService;
  let shapes: SvgShapeContentService;
  let ingest: SvgIngestService;
  let container: HTMLElement;

  const SAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>`;

  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    shapes = TestBed.inject(SvgShapeContentService);
    ingest = TestBed.inject(SvgIngestService);
    container = document.createElement('div');
    document.body.appendChild(container);
    doc.initializeSVG(container, SAFE_SVG);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
    vi.restoreAllMocks();
  });

  it('strips onmouseover from inserted shape markup via ingestFragment', () => {
    const safe = ingest.ingestFragment('<rect onmouseover="alert(1)" width="10" height="10"/>');
    shapes.insertShapeMarkup(safe);
    const rect = container.querySelector('rect');
    expect(rect).toBeTruthy();
    expect(rect?.hasAttribute('onmouseover')).toBe(false);
  });

  it('strips script from inserted shape markup via ingestFragment', () => {
    const safe = ingest.ingestFragment('<g><script>alert(1)</script><circle r="5"/></g>');
    shapes.insertShapeMarkup(safe);
    expect(container.querySelectorAll('script')).toHaveLength(0);
    expect(container.querySelector('circle')).toBeTruthy();
  });
});
