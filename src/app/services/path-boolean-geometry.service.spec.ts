import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PathBooleanGeometryService } from './path-boolean-geometry.service';
import type { PathBooleanGeometryPort } from '../models/path-boolean';
import { SvgManipulationService } from './svg-manipulation.service';

describe('PathBooleanGeometryService', () => {
  let service: PathBooleanGeometryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PathBooleanGeometryService,
        {
          provide: SvgManipulationService,
          useValue: {
            getSVGInstance: vi.fn(),
            mapPathLocalToRootUser: (_id: string, lx: number, ly: number) => ({ x: lx, y: ly }),
            mapRootUserToPathLocal: (_id: string, rx: number, ry: number) => ({ x: rx, y: ry })
          }
        }
      ]
    });
    service = TestBed.inject(PathBooleanGeometryService);
  });

  function mockPort(paths: Record<string, { d?: string; tag: string; attrs?: Record<string, string> }>): PathBooleanGeometryPort {
    const nodes = new Map<string, Element>();
    for (const [id, spec] of Object.entries(paths)) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', spec.tag);
      el.setAttribute('id', id);
      el.setAttribute('fill', '#ff0000');
      if (spec.d) el.setAttribute('d', spec.d);
      for (const [k, v] of Object.entries(spec.attrs ?? {})) {
        el.setAttribute(k, v);
      }
      nodes.set(id, el);
    }
    return {
      getPathElement: (id) => {
        const node = nodes.get(id);
        return node?.tagName.toLowerCase() === 'path' ? node : null;
      },
      getCompoundOperandElement: (id) => nodes.get(id) ?? null,
      getPathD: (id) => nodes.get(id)?.getAttribute('d') ?? null,
      mapPathLocalToRootUser: (_id, lx, ly) => ({ x: lx, y: ly }),
      mapRootUserToPathLocal: (_id, rx, ry) => ({ x: rx, y: ry })
    };
  }

  it('unionLocalD returns merged d for two overlapping rects', () => {
    const port = mockPort({
      a: { tag: 'path', d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
      b: { tag: 'path', d: 'M 5 0 L 15 0 L 15 10 L 5 10 Z' }
    });
    const d = service.unionLocalD(['a', 'b'], port);
    expect(d).toBeTruthy();
    expect(d).toContain('Z');
  });

  it('buildUnionResult returns markup with style from topmost operand', () => {
    const port = mockPort({
      back: { tag: 'path', d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
      front: { tag: 'path', d: 'M 5 0 L 15 0 L 15 10 L 5 10 Z' }
    });
    const backNode = port.getPathElement('back')!;
    const frontNode = port.getPathElement('front')!;
    document.body.appendChild(backNode);
    document.body.appendChild(frontNode);
    frontNode.setAttribute('fill', '#00ff00');
    frontNode.setAttribute('stroke', '#0000ff');

    const built = service.buildUnionResult(['back', 'front'], port, new Set(), 1);
    expect(built).not.toBeNull();
    expect(built!.resultMarkup).toContain('id="' + built!.resultId + '"');
    expect(built!.resultMarkup).toContain('fill="#00ff00"');
    expect(built!.resultMarkup).toContain('stroke="#0000ff"');
    expect(built!.operandIds[built!.operandIds.length - 1]).toBe('front');

    backNode.remove();
    frontNode.remove();
  });

  it('returns null for open paths', () => {
    const port = mockPort({
      a: { tag: 'path', d: 'M 0 0 L 10 0' },
      b: { tag: 'path', d: 'M 5 0 L 15 0 L 15 10 L 5 10 Z' }
    });
    expect(service.unionLocalD(['a', 'b'], port)).toBeNull();
    expect(service.buildBooleanResult('union', ['a', 'b'], port, new Set(), 0)).toBeNull();
  });

  it('buildBooleanResult subtract and intersect produce markup', () => {
    const port = mockPort({
      back: { tag: 'path', d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
      front: { tag: 'path', d: 'M 5 0 L 15 0 L 15 10 L 5 10 Z' }
    });
    const backNode = port.getPathElement('back')!;
    const frontNode = port.getPathElement('front')!;
    document.body.appendChild(backNode);
    document.body.appendChild(frontNode);

    const subtracted = service.buildBooleanResult('subtract', ['back', 'front'], port, new Set(), 1);
    const intersected = service.buildBooleanResult('intersect', ['back', 'front'], port, new Set(), 1);
    expect(subtracted?.resultMarkup).toContain('<path');
    expect(intersected?.resultMarkup).toContain('<path');

    backNode.remove();
    frontNode.remove();
  });

  it('buildCompoundPathResult concatenates subpaths with evenodd fill-rule', () => {
    const port = mockPort({
      a: { tag: 'path', d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z' },
      b: { tag: 'path', d: 'M 20 0 L 30 0 L 30 10 L 20 10 Z' }
    });
    const aNode = port.getPathElement('a')!;
    const bNode = port.getPathElement('b')!;
    document.body.appendChild(aNode);
    document.body.appendChild(bNode);

    const built = service.buildCompoundPathResult(['a', 'b'], port, new Set(), 1);
    expect(built).not.toBeNull();
    expect(built!.resultMarkup).toContain('fill-rule="evenodd"');
    expect(built!.resultMarkup).toContain('M 0 0');
    expect(built!.resultMarkup).toContain('M 20 0');

    aNode.remove();
    bNode.remove();
  });

  it('buildCompoundPathResult supports rect and circle operands', () => {
    const port = mockPort({
      rect: { tag: 'rect', attrs: { x: '0', y: '0', width: '10', height: '10' } },
      circle: { tag: 'circle', attrs: { cx: '20', cy: '20', r: '5' } }
    });
    const rectNode = port.getCompoundOperandElement('rect')!;
    const circleNode = port.getCompoundOperandElement('circle')!;
    document.body.appendChild(rectNode);
    document.body.appendChild(circleNode);

    const built = service.buildCompoundPathResult(['rect', 'circle'], port, new Set(), 1);
    expect(built).not.toBeNull();
    expect(built!.resultMarkup).toContain('fill-rule="evenodd"');
    expect(built!.resultMarkup).toContain('C');

    rectNode.remove();
    circleNode.remove();
  });
});
