import { Matrix } from '@svgdotjs/svg.js';
import { BASE_DRAWING_STYLE_DEFAULTS, type DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import { mockSvc, makeMockSvgElement } from '../command-test-helpers';
import {
  FillColorCommand,
  GradientFillSnapshotCommand,
  StrokeColorCommand,
  AddStrokeCommand,
  RemoveStrokeCommand,
  SetStrokeCommand,
  OpacityCommand,
  FillOpacityCommand,
  StrokeOpacityCommand,
  TextContentCommand,
  FontCommand,
  TextAlignCommand,
  TextPaintOrderCommand,
  TextVectorEffectCommand,
  TextDominantBaselineCommand,
  TextLetterSpacingCommand,
  TextWordSpacingCommand,
  UpdateDrawingDefaultsCommand,
} from '../../../models/editor-commands';

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

  it('execute purges before gradient def when switching to solid via snapshot', () => {
    const apply = vi.fn();
    const count = vi.fn().mockReturnValue(0);
    const remove = vi.fn();
    const svc = mockSvc({
      applyPaintGradientSnapshot: apply,
      countPaintUrlReferencesToDefId: count,
      removeGradientDefById: remove
    });
    const before = {
      gradientId: 'g1',
      shapePaintAttr: 'url(#g1)',
      gradientOuterHtml: '<linearGradient id="g1"></linearGradient>'
    };
    const after = { gradientId: null, shapePaintAttr: '#000000', gradientOuterHtml: null };
    const cmd = new GradientFillSnapshotCommand(svc, 'r1', 'fill', before, after);
    cmd.execute();
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

describe('FillOpacityCommand', () => {
  it('should call updateFillOpacity with newOpacity on execute', () => {
    const svc = mockSvc();
    const cmd = new FillOpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.execute();
    expect(svc.updateFillOpacity).toHaveBeenCalledWith('s1', 0.5);
  });

  it('should call updateFillOpacity with oldOpacity on undo', () => {
    const svc = mockSvc();
    const cmd = new FillOpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.undo();
    expect(svc.updateFillOpacity).toHaveBeenCalledWith('s1', 1.0);
  });

  it('should have a non-empty description', () => {
    expect(new FillOpacityCommand(mockSvc(), 's1', 1.0, 0.5).description).toBeTruthy();
  });
});

describe('StrokeOpacityCommand', () => {
  it('should call updateStrokeOpacity with newOpacity on execute', () => {
    const svc = mockSvc();
    const cmd = new StrokeOpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.execute();
    expect(svc.updateStrokeOpacity).toHaveBeenCalledWith('s1', 0.5);
  });

  it('should call updateStrokeOpacity with oldOpacity on undo', () => {
    const svc = mockSvc();
    const cmd = new StrokeOpacityCommand(svc, 's1', 1.0, 0.5);
    cmd.undo();
    expect(svc.updateStrokeOpacity).toHaveBeenCalledWith('s1', 1.0);
  });

  it('should have a non-empty description', () => {
    expect(new StrokeOpacityCommand(mockSvc(), 's1', 1.0, 0.5).description).toBeTruthy();
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

describe('TextPaintOrderCommand', () => {
  it('updates paint order and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextPaintOrderCommand(svc, 'text-a', undefined, 'stroke fill');
    cmd.execute();
    expect(svc.updateTextPaintOrder).toHaveBeenCalledWith('text-a', 'stroke fill');
    cmd.undo();
    expect(svc.updateTextPaintOrder).toHaveBeenCalledWith('text-a', undefined);
  });
});

describe('TextVectorEffectCommand', () => {
  it('updates vector-effect and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextVectorEffectCommand(svc, 'text-a', undefined, 'non-scaling-stroke');
    cmd.execute();
    expect(svc.updateTextVectorEffect).toHaveBeenCalledWith('text-a', 'non-scaling-stroke');
    cmd.undo();
    expect(svc.updateTextVectorEffect).toHaveBeenCalledWith('text-a', undefined);
  });
});

describe('TextDominantBaselineCommand', () => {
  it('updates dominant-baseline and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextDominantBaselineCommand(svc, 'text-a', undefined, 'middle');
    cmd.execute();
    expect(svc.updateTextDominantBaseline).toHaveBeenCalledWith('text-a', 'middle');
    cmd.undo();
    expect(svc.updateTextDominantBaseline).toHaveBeenCalledWith('text-a', undefined);
  });
});

describe('TextLetterSpacingCommand', () => {
  it('updates letter-spacing and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextLetterSpacingCommand(svc, 'text-a', 0, 2);
    cmd.execute();
    expect(svc.updateTextLetterSpacing).toHaveBeenCalledWith('text-a', 2);
    cmd.undo();
    expect(svc.updateTextLetterSpacing).toHaveBeenCalledWith('text-a', 0);
  });
});

describe('TextWordSpacingCommand', () => {
  it('updates word-spacing and restores on undo', () => {
    const svc = mockSvc();
    const cmd = new TextWordSpacingCommand(svc, 'text-a', 0, 4);
    cmd.execute();
    expect(svc.updateTextWordSpacing).toHaveBeenCalledWith('text-a', 4);
    cmd.undo();
    expect(svc.updateTextWordSpacing).toHaveBeenCalledWith('text-a', 0);
  });
});

describe('UpdateDrawingDefaultsCommand', () => {
  it('applies next defaults on execute and restores previous defaults on undo', () => {
    const defaultsSvc = {
      setDefaults: vi.fn()
    } as unknown as DrawingStyleDefaultsWritePort;
    const before: DrawingStyleDefaults = { ...BASE_DRAWING_STYLE_DEFAULTS };
    const after: DrawingStyleDefaults = { ...BASE_DRAWING_STYLE_DEFAULTS, fill: '#ff0000', stroke: '#00ff00', strokeWidth: 5 };
    const cmd = new UpdateDrawingDefaultsCommand(defaultsSvc, before, after, 'all');

    cmd.execute();
    expect(defaultsSvc.setDefaults).toHaveBeenCalledWith(after);

    cmd.undo();
    expect(defaultsSvc.setDefaults).toHaveBeenLastCalledWith(before);
  });

  it('coalesces by scope while preserving original before snapshot', () => {
    const defaultsSvc = {
      setDefaults: vi.fn()
    } as unknown as DrawingStyleDefaultsWritePort;
    const before: DrawingStyleDefaults = { ...BASE_DRAWING_STYLE_DEFAULTS };
    const afterA: DrawingStyleDefaults = { ...BASE_DRAWING_STYLE_DEFAULTS, fill: '#111111' };
    const afterB: DrawingStyleDefaults = { ...BASE_DRAWING_STYLE_DEFAULTS, fill: '#222222' };

    const first = new UpdateDrawingDefaultsCommand(defaultsSvc, before, afterA, 'fill');
    const second = new UpdateDrawingDefaultsCommand(defaultsSvc, afterA, afterB, 'fill');
    const merged = first.coalesceWith(second) as UpdateDrawingDefaultsCommand;

    merged.undo();
    merged.execute();

    expect(defaultsSvc.setDefaults).toHaveBeenNthCalledWith(1, before);
    expect(defaultsSvc.setDefaults).toHaveBeenNthCalledWith(2, afterB);
  });
});
