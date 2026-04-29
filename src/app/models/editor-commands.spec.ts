import { Matrix } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../services/svg-manipulation.service';
import {
  CompositeCommand,
  FillColorCommand,
  GradientFillSnapshotCommand,
  StrokeColorCommand,
  AddStrokeCommand,
  RemoveStrokeCommand,
  SetStrokeCommand,
  OpacityCommand,
  AlignCommand,
  DistributeCommand,
  TranslateCommand,
  UnionScaleCommand,
  UnionRotateCommand,
  SkewCommand,
  ReorderCommand,
  buildReorderToExtremeCommand,
  ToggleVisibilityCommand,
  GroupCommand,
  UngroupCommand,
  RemoveShapesCommand,
  AddShapeCommand,
  AddPathCommand,
  EditPathNodesCommand,
  TextContentCommand,
  FontCommand,
  TextAlignCommand,
  PasteCommand,
  DuplicateCommand,
  type EditorCommand,
} from './editor-commands';
import { ShapeSelectionService } from '../services/shape-selection.service';

function mockSvc(overrides: Partial<Record<keyof SvgManipulationService, unknown>> = {}) {
  return {
    updateFillColor: vi.fn(),
    updateStrokeColor: vi.fn(),
    addStroke: vi.fn(),
    removeStroke: vi.fn(),
    updateOpacity: vi.fn(),
    translateShape: vi.fn(),
    applyUnionScaleFromSnapshot: vi.fn(),
    applyUnionRotationFromSnapshot: vi.fn(),
    applyUnionSkewFromSnapshot: vi.fn(),
    moveElementForward: vi.fn(),
    moveElementBackward: vi.fn(),
    moveElementToFront: vi.fn(),
    moveElementToBack: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    groupSelectedElements: vi.fn(),
    ungroupElement: vi.fn(),
    removeShapes: vi.fn(),
    createClipboardPayload: vi.fn().mockReturnValue({ shapes: [] }),
    pasteClipboardPayload: vi.fn().mockReturnValue({ insertedIds: [], insertedMarkup: [] }),
    updatePathData: vi.fn(),
    updateTextContent: vi.fn(),
    updateTextFontFamily: vi.fn(),
    updateTextFontSize: vi.fn(),
    updateTextFontWeight: vi.fn(),
    updateTextFontStyle: vi.fn(),
    updateTextAnchor: vi.fn(),
    getShapeBBox: vi.fn(),
    getUnionBBox: vi.fn(),
    snapshotSelectionTransforms: vi.fn().mockReturnValue(new Map()),
    getSVGInstance: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as SvgManipulationService;
}

function makeMockSvgElement(id: string, matrixValue = new Matrix()) {
  const node = document.createElement('div');
  node.id = id;
  return {
    node,
    matrix: vi.fn().mockImplementation((m?: Matrix) => (m ? undefined : matrixValue)),
  };
}

describe('CompositeCommand', () => {
  it('should execute all sub-commands in order', () => {
    const order: string[] = [];
    const cmds: EditorCommand[] = ['a', 'b', 'c'].map((name) => ({
      description: name,
      execute: () => order.push(`exec-${name}`),
      undo: () => order.push(`undo-${name}`),
    }));

    const composite = new CompositeCommand(cmds);
    composite.execute();
    expect(order).toEqual(['exec-a', 'exec-b', 'exec-c']);
  });

  it('should undo all sub-commands in reverse order', () => {
    const order: string[] = [];
    const cmds: EditorCommand[] = ['a', 'b', 'c'].map((name) => ({
      description: name,
      execute: () => order.push(`exec-${name}`),
      undo: () => order.push(`undo-${name}`),
    }));

    const composite = new CompositeCommand(cmds);
    composite.execute();
    order.length = 0;
    composite.undo();
    expect(order).toEqual(['undo-c', 'undo-b', 'undo-a']);
  });

  it('should use first sub-command description by default', () => {
    const cmds: EditorCommand[] = [
      { description: 'First', execute: vi.fn(), undo: vi.fn() },
      { description: 'Second', execute: vi.fn(), undo: vi.fn() },
    ];
    expect(new CompositeCommand(cmds).description).toBe('First');
  });

  it('should use provided description when given', () => {
    expect(new CompositeCommand([], 'Custom').description).toBe('Custom');
  });

  it('should fallback to "Batch edit" for empty commands with no description', () => {
    expect(new CompositeCommand([]).description).toBe('Batch edit');
  });
});

describe('FillColorCommand', () => {
  it('should call updateFillColor with newColor on execute', () => {
    const svc = mockSvc();
    const cmd = new FillColorCommand(svc, 'shape1', '#000', '#fff');
    cmd.execute();
    expect(svc.updateFillColor).toHaveBeenCalledWith('shape1', '#fff');
  });

  it('should call updateFillColor with oldColor on undo', () => {
    const svc = mockSvc();
    const cmd = new FillColorCommand(svc, 'shape1', '#000', '#fff');
    cmd.undo();
    expect(svc.updateFillColor).toHaveBeenCalledWith('shape1', '#000');
  });

  it('should have a non-empty description', () => {
    const svc = mockSvc();
    const cmd = new FillColorCommand(svc, 'shape1', '#000', '#fff');
    expect(cmd.description).toBeTruthy();
    expect(cmd.description).toContain('#fff');
  });
});

describe('GradientFillSnapshotCommand', () => {
  it('execute applies after snapshot; undo applies before and purges orphan def', () => {
    const apply = vi.fn();
    const count = vi.fn().mockReturnValue(0);
    const remove = vi.fn();
    const svc = mockSvc({
      applyPaintGradientSnapshot: apply,
      countPaintUrlReferencesToDefId: count,
      removeGradientDefById: remove
    });
    const before = { gradientId: null, shapePaintAttr: '#000000', gradientOuterHtml: null };
    const after = {
      gradientId: 'g1',
      shapePaintAttr: 'url(#g1)',
      gradientOuterHtml: '<linearGradient id="g1"></linearGradient>'
    };
    const cmd = new GradientFillSnapshotCommand(svc, 'r1', 'fill', before, after);
    cmd.execute();
    expect(apply).toHaveBeenLastCalledWith('r1', 'fill', after);
    cmd.undo();
    expect(apply).toHaveBeenLastCalledWith('r1', 'fill', before);
    expect(count).toHaveBeenCalledWith('g1');
    expect(remove).toHaveBeenCalledWith('g1');
  });

  it('undo does not remove def when still referenced', () => {
    const apply = vi.fn();
    const count = vi.fn().mockReturnValue(1);
    const remove = vi.fn();
    const svc = mockSvc({
      applyPaintGradientSnapshot: apply,
      countPaintUrlReferencesToDefId: count,
      removeGradientDefById: remove
    });
    const before = { gradientId: null, shapePaintAttr: '#000', gradientOuterHtml: null };
    const after = { gradientId: 'g1', shapePaintAttr: 'url(#g1)', gradientOuterHtml: '<linearGradient id="g1"/>' };
    const cmd = new GradientFillSnapshotCommand(svc, 'r1', 'fill', before, after);
    cmd.undo();
    expect(remove).not.toHaveBeenCalled();
  });

  it('coalesceWith keeps original before and latest after', () => {
    const svc = mockSvc({ applyPaintGradientSnapshot: vi.fn() });
    const b = { gradientId: 'g', shapePaintAttr: 'url(#g)', gradientOuterHtml: '<linearGradient id="g"/>' };
    const a1 = { gradientId: 'g', shapePaintAttr: 'url(#g)', gradientOuterHtml: '<linearGradient id="g"><stop/></linearGradient>' };
    const a2 = { gradientId: 'g', shapePaintAttr: 'url(#g)', gradientOuterHtml: '<linearGradient id="g"><stop/><stop/></linearGradient>' };
    const first = new GradientFillSnapshotCommand(svc, 'r1', 'fill', b, a1);
    const second = new GradientFillSnapshotCommand(svc, 'r1', 'fill', a1, a2);
    const merged = first.coalesceWith(second) as GradientFillSnapshotCommand;
    expect(merged.before).toEqual(b);
    expect(merged.after).toEqual(a2);
  });
});

describe('StrokeColorCommand', () => {
  it('should call updateStrokeColor with newColor on execute', () => {
    const svc = mockSvc();
    const cmd = new StrokeColorCommand(svc, 's1', 'red', 'blue');
    cmd.execute();
    expect(svc.updateStrokeColor).toHaveBeenCalledWith('s1', 'blue');
  });

  it('should call updateStrokeColor with oldColor on undo', () => {
    const svc = mockSvc();
    const cmd = new StrokeColorCommand(svc, 's1', 'red', 'blue');
    cmd.undo();
    expect(svc.updateStrokeColor).toHaveBeenCalledWith('s1', 'red');
  });

  it('should have a non-empty description', () => {
    const svc = mockSvc();
    expect(new StrokeColorCommand(svc, 's1', 'red', 'blue').description).toBeTruthy();
  });
});

describe('AddStrokeCommand', () => {
  it('should call addStroke on execute', () => {
    const svc = mockSvc();
    const cmd = new AddStrokeCommand(svc, 's1', 'red', 2);
    cmd.execute();
    expect(svc.addStroke).toHaveBeenCalledWith('s1', 'red', 2);
  });

  it('should call removeStroke on undo', () => {
    const svc = mockSvc();
    const cmd = new AddStrokeCommand(svc, 's1', 'red', 2);
    cmd.undo();
    expect(svc.removeStroke).toHaveBeenCalledWith('s1');
  });

  it('should have description "Add stroke"', () => {
    expect(new AddStrokeCommand(mockSvc(), 's1', 'red', 2).description).toBe('Add stroke');
  });
});

describe('RemoveStrokeCommand', () => {
  it('should call removeStroke on execute', () => {
    const svc = mockSvc();
    const cmd = new RemoveStrokeCommand(svc, 's1', 'red', 3);
    cmd.execute();
    expect(svc.removeStroke).toHaveBeenCalledWith('s1');
  });

  it('should call addStroke with old values on undo', () => {
    const svc = mockSvc();
    const cmd = new RemoveStrokeCommand(svc, 's1', 'red', 3);
    cmd.undo();
    expect(svc.addStroke).toHaveBeenCalledWith('s1', 'red', 3);
  });

  it('should have description "Remove stroke"', () => {
    expect(new RemoveStrokeCommand(mockSvc(), 's1', 'red', 3).description).toBe('Remove stroke');
  });
});

describe('SetStrokeCommand', () => {
  it('should call addStroke with new values on execute', () => {
    const svc = mockSvc();
    const cmd = new SetStrokeCommand(svc, 's1', true, 'red', 1, 'blue', 3);
    cmd.execute();
    expect(svc.addStroke).toHaveBeenCalledWith('s1', 'blue', 3);
  });

  it('should restore old stroke on undo when hadStrokeBefore is true', () => {
    const svc = mockSvc();
    const cmd = new SetStrokeCommand(svc, 's1', true, 'red', 1, 'blue', 3);
    cmd.undo();
    expect(svc.addStroke).toHaveBeenCalledWith('s1', 'red', 1);
    expect(svc.removeStroke).not.toHaveBeenCalled();
  });

  it('should remove stroke on undo when hadStrokeBefore is false', () => {
    const svc = mockSvc();
    const cmd = new SetStrokeCommand(svc, 's1', false, '', 0, 'blue', 3);
    cmd.undo();
    expect(svc.removeStroke).toHaveBeenCalledWith('s1');
    expect(svc.addStroke).not.toHaveBeenCalled();
  });

  it('should have a non-empty description', () => {
    const cmd = new SetStrokeCommand(mockSvc(), 's1', true, 'red', 1, 'blue', 3);
    expect(cmd.description).toBeTruthy();
  });
});

describe('OpacityCommand', () => {
  it('should call updateOpacity with newOpacity on execute', () => {
    const svc = mockSvc();
    const cmd = new OpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.execute();
    expect(svc.updateOpacity).toHaveBeenCalledWith('s1', 0.5);
  });

  it('should call updateOpacity with oldOpacity on undo', () => {
    const svc = mockSvc();
    const cmd = new OpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.undo();
    expect(svc.updateOpacity).toHaveBeenCalledWith('s1', 1.0);
  });

  it('should have a non-empty description', () => {
    expect(new OpacityCommand(mockSvc(), 's1', 1.0, 0.5).description).toBeTruthy();
  });
});

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
    expect(mockEl.matrix).toHaveBeenCalledWith(savedMatrix);
  });

  it('should no-op undo when svgInstance is null', () => {
    const svc = mockSvc();
    const cmd = new TranslateCommand(svc, 's1', 10, 20, new Map());
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have a non-empty description', () => {
    expect(new TranslateCommand(mockSvc(), 's1', 10, 20, new Map()).description).toBeTruthy();
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
    expect(elA.matrix).toHaveBeenCalledWith(matrixA);
    expect(elB.matrix).toHaveBeenCalledWith(matrixB);
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
    expect(elB.matrix).toHaveBeenCalledWith(matrixB);
    expect(elA.matrix).not.toHaveBeenCalled();
    expect(elC.matrix).not.toHaveBeenCalled();
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

  it('should call applyUnionScaleFromSnapshot on execute', () => {
    const snapshot = new Map<string, Matrix>();
    const svc = mockSvc();
    const cmd = new UnionScaleCommand(svc, ['s1', 's2'], before, after, snapshot, 'se');
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
    const cmd = new UnionScaleCommand(svc, ['s1', 's2'], before, after, snapshot, 'se');
    cmd.undo();
    expect(el1.matrix).toHaveBeenCalledWith(m1);
    expect(el2.matrix).toHaveBeenCalledWith(m2);
  });

  it('should no-op undo when svgInstance is null', () => {
    const svc = mockSvc();
    const cmd = new UnionScaleCommand(svc, ['s1'], before, after, new Map(), 'nw');
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have description "Resize shapes"', () => {
    expect(new UnionScaleCommand(mockSvc(), [], before, after, new Map(), 'nw').description)
      .toBe('Resize shapes');
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
    expect(el1.matrix).toHaveBeenCalledWith(m1);
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
    expect(el1.matrix).toHaveBeenCalledWith(m1);
  });
});

describe('ReorderCommand', () => {
  function buildParentWithChildren(ids: string[]) {
    const parent = document.createElement('div');
    const elements = new Map<string, { node: Element; matrix: ReturnType<typeof vi.fn> }>();
    for (const id of ids) {
      const child = document.createElement('div');
      child.id = id;
      parent.appendChild(child);
      elements.set(id, { node: child, matrix: vi.fn() });
    }
    return { parent, elements };
  }

  it('should call moveElementForward on execute for "forward"', () => {
    const { elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => {
      const id = sel.replace('#', '');
      return elements.get(id);
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'forward');
    cmd.execute();
    expect(svc.moveElementForward).toHaveBeenCalledWith('target');
  });

  it('should call moveElementBackward on execute for "backward"', () => {
    const { elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'backward');
    cmd.execute();
    expect(svc.moveElementBackward).toHaveBeenCalledWith('target');
  });

  it('should call moveElementToFront on execute for "front"', () => {
    const { elements } = buildParentWithChildren(['target', 'a']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'front');
    cmd.execute();
    expect(svc.moveElementToFront).toHaveBeenCalledWith('target');
  });

  it('should call moveElementToBack on execute for "back"', () => {
    const { elements } = buildParentWithChildren(['a', 'target']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'back');
    cmd.execute();
    expect(svc.moveElementToBack).toHaveBeenCalledWith('target');
  });

  it('should restore element to old index on undo', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'target', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToFront: vi.fn(() => {
        parent.appendChild(elements.get('target')!.node);
      }),
    });

    const cmd = new ReorderCommand(svc, 'target', 'front');
    cmd.execute();
    expect(Array.from(parent.children).map(c => c.id)).toEqual(['a', 'b', 'target']);

    cmd.undo();
    expect(Array.from(parent.children).map(c => c.id)).toEqual(['a', 'target', 'b']);
  });

  it('should have a non-empty description', () => {
    const svc = mockSvc();
    const cmd = new ReorderCommand(svc, 'target', 'forward');
    expect(cmd.description).toContain('forward');
  });
});

describe('buildReorderToExtremeCommand', () => {
  function buildParentWithChildren(ids: string[]) {
    const parent = document.createElement('div');
    const elements = new Map<string, { node: Element }>();
    for (const id of ids) {
      const child = document.createElement('div');
      child.id = id;
      parent.appendChild(child);
      elements.set(id, { node: child });
    }
    return { parent, elements };
  }

  it('returns null when SVG instance is missing', () => {
    const svc = mockSvc();
    expect(buildReorderToExtremeCommand(svc, ['a'], 'front')).toBeNull();
  });

  it('returns a single ReorderCommand for one valid id', () => {
    const { elements } = buildParentWithChildren(['a', 'b']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['a'], 'front');
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd!.description).toContain('front');
  });

  it('for front, runs same-parent moves in ascending DOM index (selection order independent)', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'b', 'c', 'd']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const callOrder: string[] = [];
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToFront: vi.fn((id: string) => {
        callOrder.push(id);
        parent.appendChild(elements.get(id)!.node);
      }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['c', 'b'], 'front');
    expect(cmd).toBeInstanceOf(CompositeCommand);
    expect(cmd!.description).toBe('Bring to front');
    cmd!.execute();
    expect(callOrder).toEqual(['b', 'c']);
    expect(Array.from(parent.children).map((n) => n.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('for back, runs same-parent moves in descending DOM index', () => {
    const { parent, elements } = buildParentWithChildren(['a', 'b', 'c', 'd']);
    const findOne = vi.fn((sel: string) => elements.get(sel.replace('#', '')));
    const callOrder: string[] = [];
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      moveElementToBack: vi.fn((id: string) => {
        callOrder.push(id);
        const node = elements.get(id)!.node;
        parent.insertBefore(node, parent.firstElementChild);
      }),
    });
    const cmd = buildReorderToExtremeCommand(svc, ['b', 'c'], 'back');
    expect(cmd).toBeInstanceOf(CompositeCommand);
    expect(cmd!.description).toBe('Send to back');
    cmd!.execute();
    expect(callOrder).toEqual(['c', 'b']);
    expect(Array.from(parent.children).map((n) => n.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});

describe('ToggleVisibilityCommand', () => {
  it('should call toggleLayerVisibility on execute', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.execute();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledWith('layer1');
  });

  it('should call toggleLayerVisibility on undo (self-inverse)', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.undo();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledWith('layer1');
  });

  it('execute + undo should result in two toggleLayerVisibility calls', () => {
    const svc = mockSvc();
    const cmd = new ToggleVisibilityCommand(svc, 'layer1');
    cmd.execute();
    cmd.undo();
    expect(svc.toggleLayerVisibility).toHaveBeenCalledTimes(2);
  });

  it('should have description "Toggle visibility"', () => {
    expect(new ToggleVisibilityCommand(mockSvc(), 'l1').description).toBe('Toggle visibility');
  });
});

describe('GroupCommand', () => {
  it('should call groupSelectedElements on execute', () => {
    const svc = mockSvc({
      groupSelectedElements: vi.fn().mockReturnValue('group-1'),
    });
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.execute();
    expect(svc.groupSelectedElements).toHaveBeenCalledWith(['a', 'b']);
  });

  it('should call ungroupElement with returned groupId on undo', () => {
    const svc = mockSvc({
      groupSelectedElements: vi.fn().mockReturnValue('group-1'),
    });
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.execute();
    cmd.undo();
    expect(svc.ungroupElement).toHaveBeenCalledWith('group-1');
  });

  it('should not call ungroupElement if execute was never called', () => {
    const svc = mockSvc();
    const cmd = new GroupCommand(svc, ['a', 'b']);
    cmd.undo();
    expect(svc.ungroupElement).not.toHaveBeenCalled();
  });

  it('should have description "Group elements"', () => {
    expect(new GroupCommand(mockSvc(), ['a']).description).toBe('Group elements');
  });
});

describe('UngroupCommand', () => {
  it('should call ungroupElement on execute', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue(['a', 'b']),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    expect(svc.ungroupElement).toHaveBeenCalledWith('g1');
  });

  it('should call groupSelectedElements with returned childIds on undo', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue(['a', 'b']),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    cmd.undo();
    expect(svc.groupSelectedElements).toHaveBeenCalledWith(['a', 'b']);
  });

  it('should not call groupSelectedElements if no children were returned', () => {
    const svc = mockSvc({
      ungroupElement: vi.fn().mockReturnValue([]),
    });
    const cmd = new UngroupCommand(svc, 'g1');
    cmd.execute();
    cmd.undo();
    expect(svc.groupSelectedElements).not.toHaveBeenCalled();
  });

  it('should have description "Ungroup elements"', () => {
    expect(new UngroupCommand(mockSvc(), 'g1').description).toBe('Ungroup elements');
  });
});

describe('RemoveShapesCommand', () => {
  function buildContentGroup(childIds: string[]) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const elements = new Map<string, { node: Element; outerHTML: string }>();
    for (const id of childIds) {
      const el = document.createElement('div');
      el.id = id;
      el.textContent = `content-${id}`;
      contentGroup.appendChild(el);
      elements.set(id, { node: el, outerHTML: el.outerHTML });
    }
    return { contentGroup, elements };
  }

  it('should call removeShapes on execute', () => {
    const { contentGroup, elements } = buildContentGroup(['s1', 's2']);
    const findOne = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
    });

    const cmd = new RemoveShapesCommand(svc, ['s1', 's2']);
    cmd.execute();
    expect(svc.removeShapes).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('should restore elements on undo', () => {
    const { contentGroup, elements } = buildContentGroup(['s1', 's2']);
    const findOne = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const svc = mockSvc({
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShapes: vi.fn(() => {
        for (const id of ['s1', 's2']) {
          const el = elements.get(id);
          if (el) el.node.remove();
        }
      }),
    });

    const cmd = new RemoveShapesCommand(svc, ['s1', 's2']);
    cmd.execute();
    expect(contentGroup.children.length).toBe(0);

    cmd.undo();
    expect(contentGroup.children.length).toBe(2);
    expect(contentGroup.children[0].id).toBe('s1');
    expect(contentGroup.children[1].id).toBe('s2');
  });

  it('should no-op undo when svgInstance is null', () => {
    const { contentGroup, elements } = buildContentGroup(['s1']);
    const findOneForConstruction = vi.fn((sel: string) => {
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      const id = sel.replace('#', '');
      const el = elements.get(id);
      return el ? { node: el.node } : undefined;
    });
    const constructionSvg = { findOne: findOneForConstruction };
    const getSVGInstance = vi.fn()
      .mockReturnValueOnce(constructionSvg) // constructor call
      .mockReturnValue(null);               // undo call

    const svc = mockSvc({ getSVGInstance });
    const cmd = new RemoveShapesCommand(svc, ['s1']);
    expect(() => cmd.undo()).not.toThrow();
  });

  it('should have description "Remove shapes"', () => {
    const svc = mockSvc();
    expect(new RemoveShapesCommand(svc, ['s1']).description).toBe('Remove shapes');
  });
});

describe('AddShapeCommand', () => {
  function buildContentGroupForAddShape(shapeId: string) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const existing = document.createElement('div');
    existing.id = 'existing';
    contentGroup.appendChild(existing);
    const shapeNode = document.createElement('div');
    shapeNode.id = shapeId;
    shapeNode.innerHTML = 'shape-content';
    contentGroup.appendChild(shapeNode);

    return { contentGroup, shapeNode };
  }

  function buildMockSvcsForAddShape(shapeId: string) {
    const { contentGroup, shapeNode } = buildContentGroupForAddShape(shapeId);

    const mockShapeProps = { id: shapeId, type: 'rect' as const };

    const findOne = vi.fn((sel: string) => {
      if (sel === `#${shapeId}`) return { node: shapeNode };
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      return undefined;
    });

    const svc = {
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue(mockShapeProps),
    } as unknown as SvgManipulationService;

    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    } as unknown as ShapeSelectionService;

    return { svc, selectionSvc, contentGroup, shapeNode };
  }

  it('constructor captures serialized markup and insertion index', () => {
    const { svc, selectionSvc, shapeNode } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    expect(cmd.description).toBe('Create shape');
    expect(svc.getSVGInstance).toHaveBeenCalled();
    expect(shapeNode.outerHTML).toBeTruthy();
  });

  it('first execute() is a no-op (shape already exists)', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();
  });

  it('undo() removes the shape via removeShape()', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-1');
  });

  it('undo() clears selection', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.undo();
    expect(selectionSvc.clearSelection).toHaveBeenCalled();
  });

  it('second execute() (redo) re-inserts the shape via insertShapeMarkup()', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute(); // first call — no-op
    cmd.execute(); // second call — redo
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
  });

  it('redo re-selects the shape', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);
    cmd.execute(); // first — no-op
    cmd.execute(); // redo
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });

  it('round-trip: create → undo → redo → shape methods called correctly', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddShape('shape-1');
    const cmd = new AddShapeCommand(svc, 'shape-1', selectionSvc);

    // first execute (no-op)
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();

    // undo
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-1');
    expect(selectionSvc.clearSelection).toHaveBeenCalled();

    // redo
    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });
});

describe('AddPathCommand', () => {
  function buildContentGroupForAddPath(shapeId: string) {
    const contentGroup = document.createElement('div');
    contentGroup.setAttribute('data-editor-content-group', '');
    const existing = document.createElement('div');
    existing.id = 'existing';
    contentGroup.appendChild(existing);
    const pathNode = document.createElement('div');
    pathNode.id = shapeId;
    pathNode.innerHTML = 'path-content';
    contentGroup.appendChild(pathNode);

    return { contentGroup, pathNode };
  }

  function buildMockSvcsForAddPath(shapeId: string) {
    const { contentGroup, pathNode } = buildContentGroupForAddPath(shapeId);

    const mockShapeProps = { id: shapeId, type: 'path' as const };

    const findOne = vi.fn((sel: string) => {
      if (sel === `#${shapeId}`) return { node: pathNode };
      if (sel === '[data-editor-content-group]') return { node: contentGroup };
      return undefined;
    });

    const svc = {
      getSVGInstance: vi.fn().mockReturnValue({ findOne }),
      removeShape: vi.fn(),
      insertShapeMarkup: vi.fn(),
      getShapeProperties: vi.fn().mockReturnValue(mockShapeProps),
    } as unknown as SvgManipulationService;

    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn(),
    } as unknown as ShapeSelectionService;

    return { svc, selectionSvc, pathNode };
  }

  it('constructor captures serialized markup and insertion index', () => {
    const { svc, selectionSvc, pathNode } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    expect(cmd.description).toBe('Add path');
    expect(pathNode.outerHTML).toBeTruthy();
  });

  it('first execute() is a no-op', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.execute();
    expect(svc.insertShapeMarkup).not.toHaveBeenCalled();
  });

  it('undo() removes path and clears selection', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.undo();
    expect(svc.removeShape).toHaveBeenCalledWith('shape-p1');
    expect(selectionSvc.clearSelection).toHaveBeenCalled();
  });

  it('redo re-inserts and re-selects', () => {
    const { svc, selectionSvc } = buildMockSvcsForAddPath('shape-p1');
    const cmd = new AddPathCommand(svc, 'shape-p1', selectionSvc);
    cmd.execute();
    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();
  });
});

describe('EditPathNodesCommand', () => {
  it('first execute() is a no-op when drag already applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);
    cmd.execute();
    expect(svc.updatePathData).not.toHaveBeenCalled();
  });

  it('execute() applies new d when not pre-applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20');
    cmd.execute();
    expect(svc.updatePathData).toHaveBeenCalledWith('p1', 'M 0 0 L 20 20');
  });

  it('undo() restores old d', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);
    cmd.undo();
    expect(svc.updatePathData).toHaveBeenCalledWith('p1', 'M 0 0 L 10 10');
  });

  it('redo re-applies new d after undo when drag was pre-applied', () => {
    const svc = mockSvc();
    const cmd = new EditPathNodesCommand(svc, 'p1', 'M 0 0 L 10 10', 'M 0 0 L 20 20', true);

    cmd.execute(); // no-op first execute because drag already applied
    cmd.undo();
    cmd.execute(); // redo

    expect(svc.updatePathData).toHaveBeenNthCalledWith(1, 'p1', 'M 0 0 L 10 10');
    expect(svc.updatePathData).toHaveBeenNthCalledWith(2, 'p1', 'M 0 0 L 20 20');
  });
});

describe('PasteCommand', () => {
  it('executes paste payload, selects inserted shapes, and supports undo/redo', () => {
    const shapeNode = document.createElement('rect');
    shapeNode.id = 'shape-copy';
    const svc = mockSvc({
      pasteClipboardPayload: vi.fn().mockReturnValue({
        insertedIds: ['shape-copy'],
        insertedMarkup: ['<rect id="shape-copy" />']
      }),
      insertShapeMarkup: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({
        findOne: vi.fn().mockReturnValue({ node: shapeNode })
      }),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-copy', type: 'rect' })
    });
    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    } as unknown as ShapeSelectionService;

    const cmd = new PasteCommand(
      svc,
      { shapes: [{ id: 'shape-a', markup: '<rect id="shape-a" />' }] },
      { dx: 10, dy: 10 },
      selectionSvc
    );
    cmd.execute();
    expect(svc.pasteClipboardPayload).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();

    cmd.undo();
    expect(svc.removeShapes).toHaveBeenCalledWith(['shape-copy']);
    expect(selectionSvc.clearSelection).toHaveBeenCalled();

    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledWith('<rect id="shape-copy" />');
  });
});

describe('DuplicateCommand', () => {
  it('duplicates from live snapshot and supports undo/redo', () => {
    const shapeNode = document.createElement('rect');
    shapeNode.id = 'shape-dup';
    const svc = mockSvc({
      createClipboardPayload: vi.fn().mockReturnValue({
        shapes: [{ id: 'shape-1', markup: '<rect id="shape-1" />' }]
      }),
      pasteClipboardPayload: vi.fn().mockReturnValue({
        insertedIds: ['shape-dup'],
        insertedMarkup: ['<rect id="shape-dup" />']
      }),
      insertShapeMarkup: vi.fn(),
      getSVGInstance: vi.fn().mockReturnValue({
        findOne: vi.fn().mockReturnValue({ node: shapeNode })
      }),
      getShapeProperties: vi.fn().mockReturnValue({ id: 'shape-dup', type: 'rect' })
    });
    const selectionSvc = {
      selectShapes: vi.fn(),
      clearSelection: vi.fn()
    } as unknown as ShapeSelectionService;

    const cmd = new DuplicateCommand(svc, ['shape-1'], { dx: 10, dy: 10 }, selectionSvc);
    cmd.execute();
    expect(svc.createClipboardPayload).toHaveBeenCalledWith(['shape-1']);
    expect(svc.pasteClipboardPayload).toHaveBeenCalledTimes(1);
    expect(selectionSvc.selectShapes).toHaveBeenCalled();

    cmd.undo();
    expect(svc.removeShapes).toHaveBeenCalledWith(['shape-dup']);

    cmd.execute();
    expect(svc.insertShapeMarkup).toHaveBeenCalledWith('<rect id="shape-dup" />');
  });
});

describe('TextContentCommand', () => {
  it('applies new text on execute and restores old text on undo', () => {
    const svc = mockSvc();
    const cmd = new TextContentCommand(svc, 'text-a', 'before', 'after');
    cmd.execute();
    expect(svc.updateTextContent).toHaveBeenCalledWith('text-a', 'after');
    cmd.undo();
    expect(svc.updateTextContent).toHaveBeenCalledWith('text-a', 'before');
  });
});

describe('FontCommand', () => {
  it('updates font family and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new FontCommand(svc, 'text-a', 'fontFamily', 'Arial', 'Verdana');
    cmd.execute();
    expect(svc.updateTextFontFamily).toHaveBeenCalledWith('text-a', 'Verdana');
    cmd.undo();
    expect(svc.updateTextFontFamily).toHaveBeenCalledWith('text-a', 'Arial');
  });

  it('updates font size and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new FontCommand(svc, 'text-a', 'fontSize', 12, 20);
    cmd.execute();
    expect(svc.updateTextFontSize).toHaveBeenCalledWith('text-a', 20);
    cmd.undo();
    expect(svc.updateTextFontSize).toHaveBeenCalledWith('text-a', 12);
  });
});

describe('TextAlignCommand', () => {
  it('updates text anchor and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextAlignCommand(svc, 'text-a', 'start', 'middle');
    cmd.execute();
    expect(svc.updateTextAnchor).toHaveBeenCalledWith('text-a', 'middle');
    cmd.undo();
    expect(svc.updateTextAnchor).toHaveBeenCalledWith('text-a', 'start');
  });
});
