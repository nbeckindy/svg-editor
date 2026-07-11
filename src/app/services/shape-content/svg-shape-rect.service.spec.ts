import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { SvgShapeRectService } from './svg-shape-rect.service';
import { RectCornerRadiusCommand } from '../../history/commands/geometry/rect-corner-radius-command';

describe('SvgShapeRectService', () => {
  let doc: SvgEditorDocumentService;
  let rectSvc: SvgShapeRectService;
  let container: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    doc = TestBed.inject(SvgEditorDocumentService);
    rectSvc = TestBed.inject(SvgShapeRectService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.parentNode?.removeChild(container);
  });

  function initRect(markup: string): SvgJsElement {
    doc.initializeSVG(container, markup);
    return doc.getSVGInstance()!.findOne('#r1') as SvgJsElement;
  }

  it('readShapeRectFields returns empty for non-rect elements', () => {
    doc.initializeSVG(container, '<svg viewBox="0 0 100 100"><circle id="r1" cx="10" cy="10" r="5"/></svg>');
    const el = doc.getSVGInstance()!.findOne('#r1') as SvgJsElement;
    expect(rectSvc.readShapeRectFields(el, el.node as Element)).toEqual({});
  });

  it('readShapeRectFields returns max corner radius for square rects without rx/ry', () => {
    const el = initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30"/></svg>');
    expect(rectSvc.readShapeRectFields(el, el.node as Element)).toEqual({ rectMaxCornerRadius: 15 });
  });

  it('readShapeRectFields reads rx and mirrors ry when ry is absent', () => {
    const el = initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30" rx="8"/></svg>');
    expect(rectSvc.readShapeRectFields(el, el.node as Element)).toEqual({
      rx: 8,
      ry: 8,
      rectMaxCornerRadius: 15
    });
  });

  it('readShapeRectFields reads independent rx and ry', () => {
    const el = initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30" rx="8" ry="4"/></svg>');
    expect(rectSvc.readShapeRectFields(el, el.node as Element)).toEqual({
      rx: 8,
      ry: 4,
      rectMaxCornerRadius: 15
    });
  });

  it('updateRectCornerRadius sets rx and ry to the same value', () => {
    initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30"/></svg>');
    rectSvc.updateRectCornerRadius('r1', 6);
    const node = container.querySelector('#r1');
    expect(node?.getAttribute('rx')).toBe('6');
    expect(node?.getAttribute('ry')).toBe('6');
  });

  it('updateRectCornerRadius removes attrs when radius is 0', () => {
    initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30" rx="6" ry="6"/></svg>');
    rectSvc.updateRectCornerRadius('r1', 0);
    const node = container.querySelector('#r1');
    expect(node?.getAttribute('rx')).toBeNull();
    expect(node?.getAttribute('ry')).toBeNull();
  });

  it('updateRectCornerRadius clamps to half the smaller dimension', () => {
    initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30"/></svg>');
    rectSvc.updateRectCornerRadius('r1', 100);
    const node = container.querySelector('#r1');
    expect(node?.getAttribute('rx')).toBe('15');
    expect(node?.getAttribute('ry')).toBe('15');
  });

  it('restoreRectCornerRadii restores asymmetric radii', () => {
    initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30" rx="8" ry="8"/></svg>');
    rectSvc.restoreRectCornerRadii('r1', 8, 4);
    const node = container.querySelector('#r1');
    expect(node?.getAttribute('rx')).toBe('8');
    expect(node?.getAttribute('ry')).toBe('4');
  });

  it('updateRectCornerRadius bumps documentRevision', () => {
    initRect('<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="50" height="30"/></svg>');
    const before = doc.documentRevision();
    rectSvc.updateRectCornerRadius('r1', 4);
    expect(doc.documentRevision()).toBeGreaterThan(before);
  });
});

describe('RectCornerRadiusCommand', () => {
  it('execute and undo restore prior rx/ry', () => {
    const svc = {
      updateRectCornerRadius: vi.fn(),
      restoreRectCornerRadii: vi.fn()
    };
    const cmd = new RectCornerRadiusCommand(svc, 'r1', 8, 4, 10);
    cmd.execute();
    expect(svc.updateRectCornerRadius).toHaveBeenCalledWith('r1', 10);
    cmd.undo();
    expect(svc.restoreRectCornerRadii).toHaveBeenCalledWith('r1', 8, 4);
  });

  it('coalesceWith keeps original old values', () => {
    const svc = {
      updateRectCornerRadius: vi.fn(),
      restoreRectCornerRadii: vi.fn()
    };
    const first = new RectCornerRadiusCommand(svc, 'r1', 0, 0, 5);
    const second = new RectCornerRadiusCommand(svc, 'r1', 0, 0, 12);
    const coalesced = first.coalesceWith(second) as RectCornerRadiusCommand;
    coalesced.undo();
    expect(svc.restoreRectCornerRadii).toHaveBeenCalledWith('r1', 0, 0);
  });
});
