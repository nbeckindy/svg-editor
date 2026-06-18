import { describe, expect, it } from 'vitest';
import {
  BOOLEAN_FLATTEN_TOLERANCE,
  flattenCubicToPoints,
  flattenQuadraticToPoints,
  foldMartinezUnion,
  operandPathToGeometry,
  pathHasClosedSubpaths,
  ringsToPathD,
  rootUserRingsToLocalPathD,
  sortPathIdsByDocumentOrder,
  unionPathGeometries,
  type PathBooleanGeometryPort
} from './path-boolean';

function identityPort(
  paths: Record<string, { d: string; node?: Element }>
): PathBooleanGeometryPort {
  return {
    getPathElement: (id) => paths[id]?.node ?? null,
    getPathD: (id) => paths[id]?.d ?? null,
    mapPathLocalToRootUser: (_id, lx, ly) => ({ x: lx, y: ly }),
    mapRootUserToPathLocal: (_id, rx, ry) => ({ x: rx, y: ry })
  };
}

function makePathNode(id: string, d: string): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('id', id);
  el.setAttribute('d', d);
  document.body.appendChild(el);
  return el;
}

describe('path-boolean flatten helpers', () => {
  it('flattens a cubic into line endpoints within tolerance', () => {
    const out: { x: number; y: number }[] = [];
    flattenCubicToPoints(
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      BOOLEAN_FLATTEN_TOLERANCE,
      out
    );
    expect(out.length).toBeGreaterThan(1);
    const last = out[out.length - 1]!;
    expect(last.x).toBeCloseTo(10, 3);
    expect(last.y).toBeCloseTo(0, 3);
  });

  it('flattens a quadratic into line endpoints', () => {
    const out: { x: number; y: number }[] = [];
    flattenQuadraticToPoints(
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 10, y: 0 },
      BOOLEAN_FLATTEN_TOLERANCE,
      out
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it('rejects open paths for boolean eligibility', () => {
    expect(pathHasClosedSubpaths('M 0 0 L 10 0 L 10 10')).toBe(false);
    expect(pathHasClosedSubpaths('M 0 0 L 10 0 L 10 10 Z')).toBe(true);
  });
});

describe('path-boolean union', () => {
  it('unions two overlapping rect paths in identity space', () => {
    const a = makePathNode('a', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const b = makePathNode('b', 'M 5 0 L 15 0 L 15 10 L 5 10 Z');
    const port = identityPort({
      a: { d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', node: a },
      b: { d: 'M 5 0 L 15 0 L 15 10 L 5 10 Z', node: b }
    });

    const rings = unionPathGeometries(['a', 'b'], port);
    expect(rings).not.toBeNull();
    const d = rootUserRingsToLocalPathD(rings!);
    expect(d).toContain('M');
    expect(d).toContain('Z');
    expect(d.length).toBeGreaterThan(0);

    a.remove();
    b.remove();
  });

  it('sorts operands back-to-front by document order', () => {
    const a = makePathNode('a', 'M 0 0 L 1 0 L 1 1 L 0 1 Z');
    const b = makePathNode('b', 'M 2 0 L 3 0 L 3 1 L 2 1 Z');
    document.body.appendChild(b);
    document.body.appendChild(a);
    const port = identityPort({
      a: { d: a.getAttribute('d')!, node: a },
      b: { d: b.getAttribute('d')!, node: b }
    });
    expect(sortPathIdsByDocumentOrder(['a', 'b'], port)).toEqual(['b', 'a']);
    a.remove();
    b.remove();
  });

  it('applies a scale transform when mapping local to root user', () => {
    const path = makePathNode('scaled', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const port: PathBooleanGeometryPort = {
      getPathElement: () => path,
      getPathD: () => path.getAttribute('d'),
      mapPathLocalToRootUser: (_id, lx, ly) => ({ x: lx * 2, y: ly * 2 }),
      mapRootUserToPathLocal: (_id, rx, ry) => ({ x: rx / 2, y: ry / 2 })
    };
    const geom = operandPathToGeometry('scaled', port);
    expect(geom).not.toBeNull();
    const rings = unionPathGeometries(['scaled', 'scaled'], port);
    expect(rings).not.toBeNull();
    const d = ringsToPathD(rings!);
    expect(d).toContain('20');
    path.remove();
  });

  it('folds union over multiple operand geometries', () => {
    const g1 = operandPathToGeometry(
      'r1',
      identityPort({
        r1: { d: 'M 0 0 L 5 0 L 5 5 L 0 5 Z' }
      })
    );
    const g2 = operandPathToGeometry(
      'r2',
      identityPort({
        r2: { d: 'M 3 0 L 8 0 L 8 5 L 3 5 Z' }
      })
    );
    expect(g1).not.toBeNull();
    expect(g2).not.toBeNull();
    const merged = foldMartinezUnion([g1!, g2!]);
    expect(merged).not.toBeNull();
  });
});
