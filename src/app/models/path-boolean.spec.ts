import { describe, expect, it } from 'vitest';
import {
  BOOLEAN_FLATTEN_TOLERANCE,
  evaluatePathBooleanSelection,
  evaluatePathCompoundSelection,
  flattenCubicToPoints,
  flattenQuadraticToPoints,
  foldMartinezUnion,
  compoundPathUsesEvenoddFillRule,
  concatenatePathOperandsToLocalD,
  intersectPathGeometries,
  operandPathToGeometry,
  pathHasClosedSubpaths,
  ringsToPathD,
  rootUserRingsToLocalPathD,
  sortPathIdsByDocumentOrder,
  subtractPathGeometries,
  unionPathGeometries,
  type PathBooleanGeometryPort
} from './path-boolean';

function identityPort(
  paths: Record<string, { d: string; node?: Element; tag?: string }>
): PathBooleanGeometryPort {
  return {
    getPathElement: (id) => {
      const entry = paths[id];
      if (!entry?.node) return null;
      const tag = entry.tag ?? entry.node.tagName.toLowerCase();
      return tag === 'path' ? entry.node : null;
    },
    getCompoundOperandElement: (id) => paths[id]?.node ?? null,
    getPathD: (id) => paths[id]?.d ?? null,
    mapPathLocalToRootUser: (_id, lx, ly) => ({ x: lx, y: ly }),
    mapRootUserToPathLocal: (_id, rx, ry) => ({ x: rx, y: ry })
  };
}

function makeShapeNode(id: string, tag: string, attrs: Record<string, string>): Element {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  el.setAttribute('id', id);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.body.appendChild(el);
  return el;
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

describe('path-boolean compound path', () => {
  it('concatenates two closed paths into multiple subpaths preserving curves', () => {
    const a = makePathNode('a', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const b = makePathNode('b', 'M 20 0 C 20 10 30 10 30 0 Z');
    const port = identityPort({
      a: { d: 'M 0 0 L 10 0 L 10 10 L 0 10 Z', node: a },
      b: { d: 'M 20 0 C 20 10 30 10 30 0 Z', node: b }
    });

    const d = concatenatePathOperandsToLocalD(['a', 'b'], port);
    expect(d).toContain('M 0 0');
    expect(d).toContain('M 20 0');
    expect(d).toContain('C');
    expect((d!.match(/Z/g) ?? []).length).toBe(2);

    a.remove();
    b.remove();
  });

  it('uses evenodd when combining multiple operands', () => {
    const a = makePathNode('a', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const b = makePathNode('b', 'M 5 0 L 15 0 L 15 10 L 5 10 Z');
    const port = identityPort({
      a: { d: a.getAttribute('d')!, node: a },
      b: { d: b.getAttribute('d')!, node: b }
    });
    expect(compoundPathUsesEvenoddFillRule(['a', 'b'], port)).toBe(true);

    a.remove();
    b.remove();
  });

  it('concatenates rect and ellipse operands', () => {
    const rect = makeShapeNode('rect-a', 'rect', { x: '0', y: '0', width: '10', height: '10' });
    const ellipse = makeShapeNode('ellipse-b', 'ellipse', { cx: '20', cy: '20', rx: '5', ry: '5' });
    const port = identityPort({
      'rect-a': { d: '', node: rect, tag: 'rect' },
      'ellipse-b': { d: '', node: ellipse, tag: 'ellipse' }
    });

    const d = concatenatePathOperandsToLocalD(['rect-a', 'ellipse-b'], port);
    expect(d).toContain('M 0 0');
    expect(d).toContain('M 20 15');
    expect(d).toContain('C');
    expect((d!.match(/Z/g) ?? []).length).toBe(2);

    rect.remove();
    ellipse.remove();
  });
});
describe('path-boolean compound selection', () => {
  it('allows rect and ellipse operands', () => {
    const rect = makeShapeNode('r1', 'rect', { x: '0', y: '0', width: '10', height: '10' });
    const ellipse = makeShapeNode('e1', 'ellipse', { cx: '5', cy: '5', rx: '3', ry: '3' });
    const state = evaluatePathCompoundSelection(
      true,
      [
        { id: 'r1', type: 'rect' },
        { id: 'e1', type: 'ellipse' }
      ],
      () => false,
      (id) => (id === 'r1' ? rect : ellipse)
    );
    expect(state.eligible).toBe(true);
    rect.remove();
    ellipse.remove();
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
      getCompoundOperandElement: () => path,
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
    const r1 = makePathNode('r1', 'M 0 0 L 5 0 L 5 5 L 0 5 Z');
    const r2 = makePathNode('r2', 'M 3 0 L 8 0 L 8 5 L 3 5 Z');
    const g1 = operandPathToGeometry(
      'r1',
      identityPort({
        r1: { d: r1.getAttribute('d')!, node: r1 }
      })
    );
    const g2 = operandPathToGeometry(
      'r2',
      identityPort({
        r2: { d: r2.getAttribute('d')!, node: r2 }
      })
    );
    expect(g1).not.toBeNull();
    expect(g2).not.toBeNull();
    const merged = foldMartinezUnion([g1!, g2!]);
    expect(merged).not.toBeNull();
    r1.remove();
    r2.remove();
  });

  it('subtracts front rect from back overlap', () => {
    const back = makePathNode('back', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const front = makePathNode('front', 'M 5 0 L 15 0 L 15 10 L 5 10 Z');
    const port = identityPort({
      back: { d: back.getAttribute('d')!, node: back },
      front: { d: front.getAttribute('d')!, node: front }
    });
    const rings = subtractPathGeometries(['back', 'front'], port);
    expect(rings).not.toBeNull();
    const d = ringsToPathD(rings!);
    expect(d).toContain('Z');
    back.remove();
    front.remove();
  });

  it('intersects overlapping rects', () => {
    const a = makePathNode('a', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const b = makePathNode('b', 'M 5 0 L 15 0 L 15 10 L 5 10 Z');
    const port = identityPort({
      a: { d: a.getAttribute('d')!, node: a },
      b: { d: b.getAttribute('d')!, node: b }
    });
    const rings = intersectPathGeometries(['a', 'b'], port);
    expect(rings).not.toBeNull();
    const d = ringsToPathD(rings!);
    expect(d).toContain('5');
    expect(d).toContain('10');
    a.remove();
    b.remove();
  });
});

describe('evaluatePathBooleanSelection', () => {
  const closedPath = makePathNode('closed-path', 'M 0 0 L 10 0 L 10 10 L 0 10 Z');

  afterEach(() => {
    closedPath.remove();
  });

  it('requires selector mode and two closed operands', () => {
    expect(
      evaluatePathBooleanSelection(
        false,
        [
          { id: 'a', type: 'path' },
          { id: 'b', type: 'path' }
        ],
        () => false,
        () => closedPath
      ).eligible
    ).toBe(false);
    expect(
      evaluatePathBooleanSelection(true, [{ id: 'a', type: 'path' }], () => false, () => closedPath).eligible
    ).toBe(false);
    expect(
      evaluatePathBooleanSelection(
        true,
        [
          { id: 'a', type: 'path' },
          { id: 'b', type: 'path' }
        ],
        () => false,
        () => closedPath
      ).eligible
    ).toBe(true);
  });

  it('allows rect and path operands when geometry is valid', () => {
    const rect = makeShapeNode('rect-a', 'rect', { x: '0', y: '0', width: '10', height: '10' });
    const state = evaluatePathBooleanSelection(
      true,
      [
        { id: 'rect-a', type: 'rect' },
        { id: 'path-b', type: 'path' }
      ],
      () => false,
      (id) => (id === 'rect-a' ? rect : closedPath)
    );
    expect(state.eligible).toBe(true);
    rect.remove();
  });

  it('rejects unsupported types and open path geometry', () => {
    const line = makeShapeNode('line-a', 'line', { x1: '0', y1: '0', x2: '10', y2: '10' });
    expect(
      evaluatePathBooleanSelection(
        true,
        [
          { id: 'line-a', type: 'line' },
          { id: 'path-b', type: 'path' }
        ],
        () => false,
        (id) => (id === 'line-a' ? line : closedPath)
      ).reason
    ).toContain('Only paths, rectangles, circles, and ellipses');

    const openPath = makePathNode('open-path', 'M 0 0 L 10 10');
    expect(
      evaluatePathBooleanSelection(
        true,
        [
          { id: 'open-path', type: 'path' },
          { id: 'path-b', type: 'path' }
        ],
        () => false,
        (id) => (id === 'open-path' ? openPath : closedPath)
      ).eligible
    ).toBe(false);
    line.remove();
    openPath.remove();
  });
});

describe('path-boolean primitive operands', () => {
  it('unions overlapping rect and path operands', () => {
    const rect = makeShapeNode('rect-a', 'rect', { x: '0', y: '0', width: '10', height: '10' });
    const path = makePathNode('path-b', 'M 5 0 L 15 0 L 15 10 L 5 10 Z');
    const port = identityPort({
      'rect-a': { d: '', node: rect, tag: 'rect' },
      'path-b': { d: path.getAttribute('d')!, node: path }
    });

    const rings = unionPathGeometries(['rect-a', 'path-b'], port);
    expect(rings).not.toBeNull();
    expect(ringsToPathD(rings!)).toContain('Z');

    rect.remove();
    path.remove();
  });

  it('intersects circle and ellipse operands', () => {
    const circle = makeShapeNode('circle-a', 'circle', { cx: '10', cy: '10', r: '10' });
    const ellipse = makeShapeNode('ellipse-b', 'ellipse', { cx: '15', cy: '10', rx: '10', ry: '8' });
    const port = identityPort({
      'circle-a': { d: '', node: circle, tag: 'circle' },
      'ellipse-b': { d: '', node: ellipse, tag: 'ellipse' }
    });

    const rings = intersectPathGeometries(['circle-a', 'ellipse-b'], port);
    expect(rings).not.toBeNull();
    expect(ringsToPathD(rings!)).toContain('Z');

    circle.remove();
    ellipse.remove();
  });
});
