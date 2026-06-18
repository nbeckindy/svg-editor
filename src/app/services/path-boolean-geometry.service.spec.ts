import { describe, expect, it } from 'vitest';
import { PathBooleanGeometryService } from './path-boolean-geometry.service';
import type { PathBooleanGeometryPort } from '../models/path-boolean';

describe('PathBooleanGeometryService', () => {
  const service = new PathBooleanGeometryService();

  function mockPort(paths: Record<string, string>): PathBooleanGeometryPort {
    const nodes = new Map<string, Element>();
    for (const [id, d] of Object.entries(paths)) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('id', id);
      el.setAttribute('d', d);
      el.setAttribute('fill', '#ff0000');
      nodes.set(id, el);
    }
    return {
      getPathElement: (id) => nodes.get(id) ?? null,
      getPathD: (id) => nodes.get(id)?.getAttribute('d') ?? null,
      mapPathLocalToRootUser: (_id, lx, ly) => ({ x: lx, y: ly }),
      mapRootUserToPathLocal: (_id, rx, ry) => ({ x: rx, y: ry })
    };
  }

  it('unionLocalD returns merged d for two overlapping rects', () => {
    const port = mockPort({
      a: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      b: 'M 5 0 L 15 0 L 15 10 L 5 10 Z'
    });
    const d = service.unionLocalD(['a', 'b'], port);
    expect(d).toBeTruthy();
    expect(d).toContain('Z');
  });

  it('buildUnionResult returns markup with style from topmost operand', () => {
    const port = mockPort({
      back: 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
      front: 'M 5 0 L 15 0 L 15 10 L 5 10 Z'
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
      a: 'M 0 0 L 10 0',
      b: 'M 5 0 L 15 0 L 15 10 L 5 10 Z'
    });
    expect(service.unionLocalD(['a', 'b'], port)).toBeNull();
    expect(service.buildUnionResult(['a', 'b'], port, new Set(), 0)).toBeNull();
  });
});
