import { TestBed } from '@angular/core/testing';
import { EDITOR_DOCUMENT_DEFS_ATTR } from './svg-editor-stage.constants';
import { SvgClipPathService } from './svg-clip-path.service';
import { SvgEditorDocumentService } from './svg-editor-document.service';

describe('SvgClipPathService', () => {
  let doc: SvgEditorDocumentService;
  let clipPaths: SvgClipPathService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    clipPaths = TestBed.inject(SvgClipPathService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  function initTwoRects(backId: string, frontId: string): void {
    const svgContent = `<svg viewBox="0 0 100 100">
      <rect id="${backId}" x="0" y="0" width="40" height="40" fill="red"/>
      <rect id="${frontId}" x="10" y="10" width="30" height="30" fill="blue"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
  }

  it('makeClipPathFromSelection creates clipPath defs and carrier group', () => {
    initTwoRects('back', 'front');
    expect(clipPaths.canMakeClipPath(['back', 'front'])).toBe(true);

    const result = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(result).not.toBeNull();
    expect(result!.contentIds).toEqual(['back']);
    expect(result!.clipGeometryId).toMatch(/^clip-geom-/);

    const svg = doc.getSVGInstance()!;
    expect(svg.findOne('#front')).toBeFalsy();
    expect(svg.findOne(`#${result!.carrierGroupId}`)).toBeDefined();

    const defs = doc.getDocumentDefsNode();
    expect(defs).not.toBeNull();
    expect(defs!.getAttribute(EDITOR_DOCUMENT_DEFS_ATTR)).toBe('true');
    expect(defs!.querySelector(`#${result!.clipPathDefId}`)).not.toBeNull();

    const carrier = svg.findOne(`#${result!.carrierGroupId}`)!.node as Element;
    expect(carrier.getAttribute('clip-path')).toContain(`url(#${result!.clipPathDefId})`);
    expect(carrier.getAttribute('data-name')).toBe('front');
    expect(carrier.querySelector('#back')).not.toBeNull();
  });

  it('sets carrier data-name from clip shape data-name when present', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <rect id="back" x="0" y="0" width="40" height="40" fill="red"/>
      <circle id="front" cx="20" cy="20" r="15" data-name="Star mask"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);

    const result = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(result).not.toBeNull();

    const carrier = doc.getSVGInstance()!.findOne(`#${result!.carrierGroupId}`)!.node as Element;
    expect(carrier.getAttribute('data-name')).toBe('Star mask');
  });

  it('undoMakeClipPath restores clip shape and content placement', () => {
    initTwoRects('back', 'front');
    const result = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(result).not.toBeNull();

    clipPaths.undoMakeClipPath(result!.undo, result!.carrierGroupId, result!.clipPathDefId);

    const svg = doc.getSVGInstance()!;
    expect(svg.findOne('#front')).toBeDefined();
    expect(svg.findOne('#back')).toBeDefined();
    expect(svg.findOne(`#${result!.carrierGroupId}`)).toBeFalsy();
    expect(doc.getDocumentDefsNode()!.querySelector(`#${result!.clipPathDefId}`)).toBeNull();
  });

  it('releaseClipPathForSelection unwraps carrier, restores clip shape, and removes defs', () => {
    initTwoRects('back', 'front');
    const made = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(made).not.toBeNull();

    const released = clipPaths.releaseClipPathForSelection(['back']);
    expect(released).not.toBeNull();
    expect(released!.freedChildIds).toEqual(['back']);
    expect(released!.restoredClipShapeId).toBe('front');

    const svg = doc.getSVGInstance()!;
    expect(svg.findOne(`#${made!.carrierGroupId}`)).toBeFalsy();
    expect(svg.findOne('#back')?.node.parentElement?.getAttribute('clip-path')).toBeNull();
    expect(svg.findOne('#front')).toBeDefined();
    expect(doc.getDocumentDefsNode()!.querySelector(`#${made!.clipPathDefId}`)).toBeNull();
  });

  it('undoReleaseClipPath restores carrier and clipPath and removes restored clip shape', () => {
    initTwoRects('back', 'front');
    const made = clipPaths.makeClipPathFromSelection(['back'], 'front');
    const released = clipPaths.releaseClipPathForSelection(['back']);
    expect(released).not.toBeNull();

    const svgBeforeUndo = doc.getSVGInstance()!;
    expect(svgBeforeUndo.findOne('#front')).toBeDefined();

    const carrierId = clipPaths.undoReleaseClipPath(released!.undo);
    expect(carrierId).toBe(made!.carrierGroupId);

    const svg = doc.getSVGInstance()!;
    expect(svg.findOne('#front')).toBeFalsy();
    const carrier = svg.findOne(`#${made!.carrierGroupId}`)!.node as Element;
    expect(carrier.getAttribute('clip-path')).toContain(`url(#${made!.clipPathDefId})`);
    expect(carrier.querySelector('#back')).not.toBeNull();
  });

  it('canMakeClipPath rejects shapes already inside a clip carrier', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>
      <g clip-path="url(#cp)">
        <rect id="a" x="0" y="0" width="10" height="10"/>
        <rect id="b" x="5" y="5" width="10" height="10"/>
      </g>
      <rect id="c" x="20" y="20" width="10" height="10"/>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    expect(clipPaths.canMakeClipPath(['a', 'c'])).toBe(false);
  });

  it('resolveClipGeometryIdForContentShape returns clip-path child id', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>
      <g clip-path="url(#cp)"><rect id="inner" x="5" y="5" width="10" height="10"/></g>
    </svg>`;
    doc.initializeSVG(container, svgContent);
    const inner = doc.getSVGInstance()!.findOne('#inner')!;
    const geomId = clipPaths.resolveClipGeometryIdForContentShape(inner);
    expect(geomId).toMatch(/^clip-geom-/);
    expect(doc.getSVGInstance()!.findOne(`#${geomId}`)).toBeTruthy();
  });

  it('releaseClipPathForSelection assigns a canvas id when clip source id is unknown', () => {
    const svgContent = `<svg viewBox="0 0 100 100">
      <defs><clipPath id="cp"><rect x="0" y="0" width="50" height="50"/></clipPath></defs>
      <g clip-path="url(#cp)"><rect id="inner" x="5" y="5" width="10" height="10"/></g>
    </svg>`;
    doc.initializeSVG(container, svgContent);

    const released = clipPaths.releaseClipPathForSelection(['inner']);
    expect(released).not.toBeNull();
    expect(released!.restoredClipShapeId).toMatch(/^shape-/);

    const svg = doc.getSVGInstance()!;
    expect(svg.findOne(`#${released!.restoredClipShapeId}`)).toBeDefined();
    expect(doc.getDocumentDefsNode()!.querySelector('#cp')).toBeNull();
  });

  it('canReleaseClipPath accepts clip geometry selection', () => {
    initTwoRects('back', 'front');
    expect(clipPaths.canReleaseClipPath(['back'])).toBe(false);

    const made = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(made).not.toBeNull();
    expect(clipPaths.canReleaseClipPath(['back'])).toBe(true);
    expect(clipPaths.canReleaseClipPath([made!.clipGeometryId])).toBe(true);
  });

  it('getClipPathTransformMemberIds returns clip geometry and all carrier children', () => {
    initTwoRects('back', 'front');
    const made = clipPaths.makeClipPathFromSelection(['back'], 'front');
    expect(made).not.toBeNull();

    const fromContent = clipPaths.getClipPathTransformMemberIds('back');
    expect(fromContent).toEqual([made!.clipGeometryId, 'back']);

    const fromGeom = clipPaths.getClipPathTransformMemberIds(made!.clipGeometryId);
    expect(fromGeom).toEqual([made!.clipGeometryId, 'back']);
  });
});
