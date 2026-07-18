import { Matrix } from '@svgdotjs/svg.js';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import { createStubbedSvgElement, unionAxisAlignedBoxes } from '../../../testing/svg-geometry-test-harness';
import { mockSvc, makeMockSvgElement } from '../command-test-helpers';
import {
  AlignCommand,
  DistributeCommand,
  TranslateCommand,
  UnionScaleCommand,
  UnionScaleFromCenterCommand,
  UnionRotateCommand,
  SkewCommand,
  TextUniformScaleCommand,
  isCoalesceable,
} from '../../../models/editor-commands';
import type { TextScaleAttrSnapshot } from '../../../utils/text-uniform-scale';

describe('TranslateCommand', () => {
  it('should call translateShape on execute', () => {
    const svc = mockSvc();
    const cmd = new TranslateCommand(svc, 's1', 10, 20, new Map());
    cmd.execute();
    expect(svc.translateShape).toHaveBeenCalledWith('s1', 10, 20);
  });

  it('should restore matrix from snapshot on undo', () => {
    const savedMatrix = new Matrix();
    const mockEl = makeMockSvgElement('s1', savedMatrix);
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne: vi.fn().mockReturnValue(mockEl) }),
    });

    const snapshot = new Map([['s1', savedMatrix]]);
    const cmd = new TranslateCommand(svc, 's1', 10, 20, snapshot);
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['s1'], snapshot);
  });

  it('should no-op undo when svgInstance is null', () => {
    const svc = mockSvc();
    const cmd = new TranslateCommand(svc, 's1', 10, 20, new Map());
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have a non-empty description', () => {
    expect(new TranslateCommand(mockSvc(), 's1', 10, 20, new Map()).description).toBeTruthy();
  });

  it('is coalesceable and coalesceWith sums deltas from the first snapshot', () => {
    const snap = new Map([['s1', new Matrix()]]);
    const svc = mockSvc();
    const first = new TranslateCommand(svc, 's1', 5, 0, snap);
    const second = new TranslateCommand(svc, 's1', 3, 10, snap);
    expect(isCoalesceable(first)).toBe(true);
    expect(first.coalesceKey).toBe('translate:s1');
    const merged = first.coalesceWith(second) as TranslateCommand;
    merged.execute();
    expect(svc.translateShape).toHaveBeenCalledWith('s1', 8, 10);
  });
});

describe('AlignCommand', () => {
  it('no-ops when fewer than 2 shapes are selected', () => {
    const svc = mockSvc();
    const cmd = new AlignCommand(svc, ['s1'], 'left');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
    expect(svc.getShapeBBox).not.toHaveBeenCalled();
  });

  it('aligns left using stubbed SVG element geometry from harness', () => {
    const elA = createStubbedSvgElement('rect', 'a', { x: 10, y: 10, width: 20, height: 20 });
    const elB = createStubbedSvgElement('rect', 'b', { x: 40, y: 10, width: 20, height: 20 });
    const union = unionAxisAlignedBoxes([
      { x: elA.getBBox().x, y: elA.getBBox().y, width: elA.getBBox().width, height: elA.getBBox().height },
      { x: elB.getBBox().x, y: elB.getBBox().y, width: elB.getBBox().width, height: elB.getBBox().height }
    ])!;

    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return elA.getBBox();
        if (id === 'b') return elB.getBBox();
        return null;
      }),
      getUnionBBox: vi.fn().mockReturnValue(union),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', new Matrix()], ['b', new Matrix()]]))
    });
    const cmd = new AlignCommand(svc, ['a', 'b'], 'left');
    cmd.execute();
    expect(svc.translateShape).toHaveBeenCalledWith('b', -30, 0);
  });

  it('aligns left using union bounds and snapshots for undo', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 10, y: 10, width: 20, height: 20 };
        if (id === 'b') return { x: 40, y: 10, width: 20, height: 20 };
        return null;
      }),
      getUnionBBox: vi.fn().mockReturnValue({ x: 10, y: 10, width: 50, height: 20 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', new Matrix()], ['b', new Matrix()]]))
    });
    const cmd = new AlignCommand(svc, ['a', 'b'], 'left');
    cmd.execute();
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(1, 'a', { preferScreenBounds: true });
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(2, 'b', { preferScreenBounds: true });
    expect(svc.getUnionBBox).toHaveBeenCalledWith(['a', 'b'], { preferScreenBounds: true });
    expect(svc.snapshotSelectionTransforms).toHaveBeenCalledWith(['a', 'b']);
    expect(svc.translateShape).toHaveBeenCalledTimes(1);
    expect(svc.translateShape).toHaveBeenCalledWith('b', -30, 0);
  });

  it('aligns center with same bbox mode when preferScreenBounds is false', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 0, y: 0, width: 10, height: 10 };
        if (id === 'b') return { x: 20, y: 0, width: 10, height: 10 };
        return null;
      }),
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 30, height: 10 })
    });
    const cmd = new AlignCommand(svc, ['a', 'b'], 'center', false);
    cmd.execute();
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(1, 'a', { preferScreenBounds: false });
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(2, 'b', { preferScreenBounds: false });
    expect(svc.getUnionBBox).toHaveBeenCalledWith(['a', 'b'], { preferScreenBounds: false });
    expect(svc.translateShape).toHaveBeenCalledWith('a', 10, 0);
    expect(svc.translateShape).toHaveBeenCalledWith('b', -10, 0);
  });

  it('no-ops on degenerate union bounds', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 }),
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 0, height: 10 })
    });
    const cmd = new AlignCommand(svc, ['a', 'b'], 'top');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
    expect(svc.snapshotSelectionTransforms).not.toHaveBeenCalled();
  });

  it.each([
    ['right', { x: 40, y: 10, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }, ['b', 30, 0]],
    ['top', { x: 10, y: 40, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }, ['a', 0, -30]],
    ['middle', { x: 10, y: 40, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }, ['a', 0, -15]],
    ['bottom', { x: 10, y: 40, width: 20, height: 20 }, { x: 10, y: 10, width: 20, height: 20 }, ['b', 0, 30]]
  ] as const)(
    'aligns %s with expected translation',
    (direction, aBounds, bBounds, expectedCall) => {
      const svc = mockSvc({
        getShapeBBox: vi.fn((id: string) => {
          if (id === 'a') return aBounds;
          if (id === 'b') return bBounds;
          return null;
        }),
        getUnionBBox: vi.fn().mockReturnValue({ x: 10, y: 10, width: 50, height: 50 }),
        snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', new Matrix()], ['b', new Matrix()]]))
      });

      const cmd = new AlignCommand(svc, ['a', 'b'], direction);
      cmd.execute();
      expect(svc.translateShape).toHaveBeenCalledWith(expectedCall[0], expectedCall[1], expectedCall[2]);
    }
  );

  it('undo restores original transforms after alignment', () => {
    const matrixA = new Matrix();
    const matrixB = new Matrix();
    const elA = makeMockSvgElement('a', matrixA);
    const elB = makeMockSvgElement('b', matrixB);
    const findOne = vi.fn((sel: string) => {
      if (sel === '#a') return elA;
      if (sel === '#b') return elB;
      return undefined;
    });
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => id === 'a'
        ? { x: 0, y: 0, width: 10, height: 10 }
        : { x: 20, y: 0, width: 10, height: 10 }),
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 30, height: 10 }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', matrixA], ['b', matrixB]])),
      getSVGInstance: vi.fn().mockReturnValue({ findOne })
    });

    const cmd = new AlignCommand(svc, ['a', 'b'], 'center');
    cmd.execute();
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledTimes(2);
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenNthCalledWith(1, ['b'], expect.any(Map));
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenNthCalledWith(2, ['a'], expect.any(Map));
  });

  it('no-ops when any bbox has zero area', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => id === 'a'
        ? { x: 0, y: 0, width: 0, height: 10 }
        : { x: 20, y: 0, width: 10, height: 10 }),
      getUnionBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 30, height: 10 })
    });
    const cmd = new AlignCommand(svc, ['a', 'b'], 'left');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
  });
});

describe('DistributeCommand', () => {
  it('no-ops when fewer than 3 shapes are selected', () => {
    const svc = mockSvc();
    const cmd = new DistributeCommand(svc, ['a', 'b'], 'horizontal');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
    expect(svc.getShapeBBox).not.toHaveBeenCalled();
  });

  it('distributes horizontally by center with stable tie-breaker', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 0, y: 0, width: 10, height: 10 };   // center 5
        if (id === 'b') return { x: 0, y: 20, width: 10, height: 10 };  // center 5
        if (id === 'c') return { x: 30, y: 0, width: 10, height: 10 };  // center 35
        return null;
      }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', new Matrix()], ['b', new Matrix()], ['c', new Matrix()]]))
    });
    const cmd = new DistributeCommand(svc, ['a', 'b', 'c'], 'horizontal');
    cmd.execute();
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(1, 'a', { preferScreenBounds: true });
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(2, 'b', { preferScreenBounds: true });
    expect(svc.getShapeBBox).toHaveBeenNthCalledWith(3, 'c', { preferScreenBounds: true });
    expect(svc.snapshotSelectionTransforms).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect(svc.translateShape).toHaveBeenCalledWith('b', 15, 0);
    expect(svc.translateShape).not.toHaveBeenCalledWith('a', expect.any(Number), expect.any(Number));
    expect(svc.translateShape).not.toHaveBeenCalledWith('c', expect.any(Number), expect.any(Number));
  });

  it('distributes vertically with expected center spacing', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 0, y: 0, width: 10, height: 10 };   // center y 5
        if (id === 'b') return { x: 0, y: 10, width: 10, height: 10 };  // center y 15
        if (id === 'c') return { x: 0, y: 40, width: 10, height: 10 };  // center y 45
        return null;
      })
    });
    const cmd = new DistributeCommand(svc, ['a', 'b', 'c'], 'vertical');
    cmd.execute();
    expect(svc.translateShape).toHaveBeenCalledWith('b', 0, 10);
  });

  it('no-ops when span is degenerate', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 10, height: 10 })
    });
    const cmd = new DistributeCommand(svc, ['a', 'b', 'c'], 'horizontal');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
    expect(svc.snapshotSelectionTransforms).not.toHaveBeenCalled();
  });

  it('undo restores original transforms after distribution', () => {
    const matrixA = new Matrix();
    const matrixB = new Matrix();
    const matrixC = new Matrix();
    const elA = makeMockSvgElement('a', matrixA);
    const elB = makeMockSvgElement('b', matrixB);
    const elC = makeMockSvgElement('c', matrixC);
    const findOne = vi.fn((sel: string) => {
      if (sel === '#a') return elA;
      if (sel === '#b') return elB;
      if (sel === '#c') return elC;
      return undefined;
    });
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 0, y: 0, width: 10, height: 10 };
        if (id === 'b') return { x: 10, y: 0, width: 10, height: 10 };
        return { x: 40, y: 0, width: 10, height: 10 };
      }),
      snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map([['a', matrixA], ['b', matrixB], ['c', matrixC]])),
      getSVGInstance: vi.fn().mockReturnValue({ findOne })
    });

    const cmd = new DistributeCommand(svc, ['a', 'b', 'c'], 'horizontal');
    cmd.execute();
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledTimes(1);
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['b'], expect.any(Map));
  });

  it('no-ops when any bbox has zero area', () => {
    const svc = mockSvc({
      getShapeBBox: vi.fn((id: string) => {
        if (id === 'a') return { x: 0, y: 0, width: 10, height: 10 };
        if (id === 'b') return { x: 10, y: 0, width: 0, height: 10 };
        return { x: 40, y: 0, width: 10, height: 10 };
      })
    });
    const cmd = new DistributeCommand(svc, ['a', 'b', 'c'], 'horizontal');
    cmd.execute();
    expect(svc.translateShape).not.toHaveBeenCalled();
  });
});

describe('UnionScaleCommand', () => {
  const before = { x: 0, y: 0, width: 100, height: 100 };
  const after = { x: 0, y: 0, width: 200, height: 200 };
  const emptyVe = new Map<string, (string | null)[]>();

  it('should call applyUnionScaleFromSnapshot on execute', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new UnionScaleCommand(svc, ['s1', 's2'], before, after, snapshot, 'se', emptyVe);
    cmd.execute();
    expect(svc.applyUnionScaleFromSnapshot).toHaveBeenCalledWith(
      ['s1', 's2'], before, after, snapshot, 'se'
    );
  });

  it('should restore matrices for all shapes on undo', () => {
    const m1 = new Matrix();
    const m2 = new Matrix();
    const el1 = makeMockSvgElement('s1', m1);
    const el2 = makeMockSvgElement('s2', m2);
    const findOne = vi.fn((sel: string) => {
      if (sel === '#s1') return el1;
      if (sel === '#s2') return el2;
      return undefined;
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const snapshot = new Map([['s1', m1], ['s2', m2]]);
    const cmd = new UnionScaleCommand(svc, ['s1', 's2'], before, after, snapshot, 'se', emptyVe);
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['s1', 's2'], snapshot);
    expect(svc.restoreVectorEffectsForShapeSubtrees).toHaveBeenCalledWith(['s1', 's2'], emptyVe);
  });

  it('should no-op undo when svgInstance is null', () => {
    const svc = mockSvc();
    const cmd = new UnionScaleCommand(svc, ['s1'], before, after, new Map(), 'nw', emptyVe);
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have description "Resize shapes"', () => {
    expect(new UnionScaleCommand(mockSvc(), [], before, after, new Map(), 'nw', emptyVe).description)
      .toBe('Resize shapes');
  });

  it('is coalesceable; coalesceKey ignores shape id order', () => {
    const svc = mockSvc();
    const a = new UnionScaleCommand(svc, ['b', 'a'], before, after, new Map(), 'e', emptyVe);
    const b = new UnionScaleCommand(svc, ['a', 'b'], before, after, new Map(), 'e', emptyVe);
    expect(isCoalesceable(a)).toBe(true);
    expect(a.coalesceKey).toBe(b.coalesceKey);
  });

  it('coalesceWith keeps first unionBefore and snapshot; uses latest unionAfter', () => {
    const mid = { x: 0, y: 0, width: 150, height: 100 };
    const end = { x: 0, y: 0, width: 200, height: 100 };
    const snap = new Map<string, Matrix>();
    const svc = mockSvc();
    const first = new UnionScaleCommand(svc, ['s1'], before, mid, snap, 'e', emptyVe);
    const second = new UnionScaleCommand(svc, ['s1'], mid, end, snap, 'e', emptyVe);
    const merged = first.coalesceWith(second) as UnionScaleCommand;
    merged.execute();
    expect(svc.applyUnionScaleFromSnapshot).toHaveBeenCalledWith(['s1'], before, end, snap, 'e');
  });
});

describe('UnionScaleFromCenterCommand', () => {
  const before = { x: 0, y: 0, width: 100, height: 100 };
  const after = { x: 0, y: 0, width: 200, height: 200 };
  const emptyVe = new Map<string, (string | null)[]>();

  it('calls applyUnionScaleFromCenter on execute', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new UnionScaleFromCenterCommand(svc, ['s1'], before, after, snapshot, emptyVe);
    cmd.execute();
    expect(svc.applyUnionScaleFromCenter).toHaveBeenCalledWith(['s1'], before, after, snapshot);
  });

  it('restores matrices and vector-effect snapshot on undo', () => {
    const m1 = new Matrix();
    const el1 = makeMockSvgElement('s1', m1);
    const findOne = vi.fn().mockReturnValue(el1);
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });
    const ve = new Map<string, (string | null)[]>([['s1', ['non-scaling-stroke']]]);
    const cmd = new UnionScaleFromCenterCommand(svc, ['s1'], before, after, new Map([['s1', m1]]), ve);
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['s1'], new Map([['s1', m1]]));
    expect(svc.restoreVectorEffectsForShapeSubtrees).toHaveBeenCalledWith(['s1'], ve);
  });
});

describe('TextUniformScaleCommand', () => {
  const before = { x: 0, y: 0, width: 100, height: 50 };
  const after = { x: 0, y: 0, width: 200, height: 100 };

  function textSnap(fontSize = '16'): Map<string, TextScaleAttrSnapshot> {
    return new Map([
      [
        't1',
        {
          fontSize,
          letterSpacing: '1',
          wordSpacing: null,
          x: '10',
          y: '20'
        }
      ]
    ]);
  }

  it('calls applyTextUniformScaleFromSnapshot on execute', () => {
    const snap = textSnap();
    const svc = mockSvc();
    const cmd = new TextUniformScaleCommand(svc, ['t1'], before, after, snap, 'se');
    cmd.execute();
    expect(svc.applyTextUniformScaleFromSnapshot).toHaveBeenCalledWith(
      ['t1'],
      before,
      after,
      snap,
      'se'
    );
  });

  it('restores text attrs on undo', () => {
    const snap = textSnap();
    const svc = mockSvc();
    const cmd = new TextUniformScaleCommand(svc, ['t1'], before, after, snap, 'se');
    cmd.undo();
    expect(svc.restoreTextScaleAttrsFromSnapshot).toHaveBeenCalledWith(['t1'], snap);
  });

  it('coalesceWith keeps first unionBefore and snapshot; uses latest unionAfter', () => {
    const mid = { x: 0, y: 0, width: 150, height: 75 };
    const end = { x: 0, y: 0, width: 200, height: 100 };
    const snap = textSnap();
    const svc = mockSvc();
    const first = new TextUniformScaleCommand(svc, ['t1'], before, mid, snap, 'se');
    const second = new TextUniformScaleCommand(svc, ['t1'], mid, end, snap, 'se');
    expect(isCoalesceable(first)).toBe(true);
    const merged = first.coalesceWith(second) as TextUniformScaleCommand;
    merged.execute();
    expect(svc.applyTextUniformScaleFromSnapshot).toHaveBeenCalledWith(
      ['t1'],
      before,
      end,
      snap,
      'se'
    );
  });

  it('has description Resize text', () => {
    expect(new TextUniformScaleCommand(mockSvc(), ['t1'], before, after, textSnap(), 'center').description).toBe(
      'Resize text'
    );
  });
});

describe('UnionRotateCommand', () => {
  const pivot = { x: 50, y: 50 };

  it('should call applyUnionRotationFromSnapshot on execute', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new UnionRotateCommand(svc, ['s1'], pivot, 45, snapshot);
    cmd.execute();
    expect(svc.applyUnionRotationFromSnapshot).toHaveBeenCalledWith(
      ['s1'], pivot, 45, snapshot
    );
  });

  it('should restore matrices for all shapes on undo', () => {
    const m1 = new Matrix();
    const el1 = makeMockSvgElement('s1', m1);
    const findOne = vi.fn().mockReturnValue(el1);
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const snapshot = new Map([['s1', m1]]);
    const cmd = new UnionRotateCommand(svc, ['s1'], pivot, 45, snapshot);
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['s1'], snapshot);
  });

  it('should no-op undo when svgInstance is null', () => {
    const svc = mockSvc();
    const cmd = new UnionRotateCommand(svc, ['s1'], pivot, 45, new Map());
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have a non-empty description containing the angle', () => {
    const cmd = new UnionRotateCommand(mockSvc(), ['s1'], pivot, 45, new Map());
    expect(cmd.description).toContain('45');
  });

  it('is coalesceable and coalesceWith sums rotation about the same pivot key', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const first = new UnionRotateCommand(svc, ['s1'], pivot, 10, snapshot);
    const second = new UnionRotateCommand(svc, ['s1'], pivot, 25, snapshot);
    expect(isCoalesceable(first)).toBe(true);
    expect(first.coalesceKey).toBe(second.coalesceKey);
    const merged = first.coalesceWith(second) as UnionRotateCommand;
    merged.execute();
    expect(svc.applyUnionRotationFromSnapshot).toHaveBeenCalledWith(['s1'], pivot, 35, snapshot);
  });
});

describe('SkewCommand', () => {
  const pivot = { x: 60, y: 45 };

  it('should call applyUnionSkewFromSnapshot on execute for skew X', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new SkewCommand(svc, ['s1'], 'x', 12, pivot, snapshot);
    cmd.execute();
    expect(svc.applyUnionSkewFromSnapshot).toHaveBeenCalledWith(['s1'], 'x', 12, pivot, snapshot);
  });

  it('should call applyUnionSkewFromSnapshot on execute for skew Y', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new SkewCommand(svc, ['a', 'b'], 'y', -5, pivot, snapshot);
    cmd.execute();
    expect(svc.applyUnionSkewFromSnapshot).toHaveBeenCalledWith(['a', 'b'], 'y', -5, pivot, snapshot);
  });

  it('should restore matrices on undo', () => {
    const m1 = new Matrix();
    const el1 = makeMockSvgElement('s1', m1);
    const findOne = vi.fn().mockReturnValue(el1);
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });
    const snapshot = new Map([['s1', m1]]);
    const cmd = new SkewCommand(svc, ['s1'], 'x', 10, pivot, snapshot);
    cmd.undo();
    expect(svc.restoreSelectionTransformsFromSnapshot).toHaveBeenCalledWith(['s1'], snapshot);
  });
});
