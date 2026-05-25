import { Matrix } from '@svgdotjs/svg.js';
import { EditorHistoryService, COALESCE_WINDOW_MS } from './editor-history.service';
import {
  CompositeCommand,
  EditorCommand,
  CoalesceableCommand,
  UpdateDrawingDefaultsCommand,
  UnionScaleCommand
} from '../models/editor-commands';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import type { SvgManipulationService } from './svg-manipulation.service';

function makeCommand(description = 'test'): EditorCommand & { executeCalls: number; undoCalls: number } {
  const cmd = {
    description,
    executeCalls: 0,
    undoCalls: 0,
    execute() { this.executeCalls++; },
    undo() { this.undoCalls++; }
  };
  return cmd;
}

function makeCoalesceableCommand(
  key: string,
  value: string,
  oldValue = 'original'
): CoalesceableCommand & { executeCalls: number; undoCalls: number; value: string; oldValue: string } {
  const cmd = {
    description: `set ${key} to ${value}`,
    coalesceKey: key,
    executeCalls: 0,
    undoCalls: 0,
    value,
    oldValue,
    execute() { this.executeCalls++; },
    undo() { this.undoCalls++; },
    coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
      const n = newer as typeof cmd;
      return makeCoalesceableCommand(cmd.coalesceKey, n.value, cmd.oldValue);
    }
  };
  return cmd;
}

describe('EditorHistoryService', () => {
  let svc: EditorHistoryService;

  beforeEach(() => {
    svc = new EditorHistoryService();
  });

  it('should start with empty stacks', () => {
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(false);
  });

  it('pushAndExecute should call execute and enable undo', () => {
    const cmd = makeCommand();
    svc.pushAndExecute(cmd);
    expect(cmd.executeCalls).toBe(1);
    expect(svc.canUndo()).toBe(true);
    expect(svc.canRedo()).toBe(false);
  });

  it('undo should call undo and move command to redo stack', () => {
    const cmd = makeCommand();
    svc.pushAndExecute(cmd);
    svc.undo();
    expect(cmd.undoCalls).toBe(1);
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(true);
  });

  it('redo should call execute and move command back to undo stack', () => {
    const cmd = makeCommand();
    svc.pushAndExecute(cmd);
    svc.undo();
    svc.redo();
    expect(cmd.executeCalls).toBe(2);
    expect(svc.canUndo()).toBe(true);
    expect(svc.canRedo()).toBe(false);
  });

  it('multiple undo/redo cycles should be consistent', () => {
    const a = makeCommand('a');
    const b = makeCommand('b');
    svc.pushAndExecute(a);
    svc.pushAndExecute(b);

    svc.undo();
    expect(b.undoCalls).toBe(1);
    expect(svc.canUndo()).toBe(true);
    expect(svc.canRedo()).toBe(true);

    svc.undo();
    expect(a.undoCalls).toBe(1);
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(true);

    svc.redo();
    expect(a.executeCalls).toBe(2);
    svc.redo();
    expect(b.executeCalls).toBe(2);
    expect(svc.canUndo()).toBe(true);
    expect(svc.canRedo()).toBe(false);
  });

  it('pushing a new command should clear the redo stack', () => {
    const a = makeCommand('a');
    const b = makeCommand('b');
    const c = makeCommand('c');
    svc.pushAndExecute(a);
    svc.pushAndExecute(b);
    svc.undo();
    expect(svc.canRedo()).toBe(true);
    svc.pushAndExecute(c);
    expect(svc.canRedo()).toBe(false);
  });

  it('undo on empty stack should be a no-op', () => {
    svc.undo();
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(false);
  });

  it('redo on empty stack should be a no-op', () => {
    svc.redo();
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(false);
  });

  it('clear should reset both stacks', () => {
    svc.pushAndExecute(makeCommand());
    svc.pushAndExecute(makeCommand());
    svc.undo();
    expect(svc.canUndo()).toBe(true);
    expect(svc.canRedo()).toBe(true);
    svc.clear();
    expect(svc.canUndo()).toBe(false);
    expect(svc.canRedo()).toBe(false);
  });

  it('should evict oldest command when stack exceeds 100', () => {
    const commands: ReturnType<typeof makeCommand>[] = [];
    for (let i = 0; i < 101; i++) {
      const cmd = makeCommand(`cmd-${i}`);
      commands.push(cmd);
      svc.pushAndExecute(cmd);
    }
    expect(svc.canUndo()).toBe(true);

    let undoCount = 0;
    while (svc.canUndo()) {
      svc.undo();
      undoCount++;
    }
    expect(undoCount).toBe(100);
    expect(commands[0].undoCalls).toBe(0);
  });

  it('redo should also respect the 100-command limit', () => {
    for (let i = 0; i < 50; i++) {
      svc.pushAndExecute(makeCommand());
    }
    for (let i = 0; i < 50; i++) {
      svc.undo();
    }
    for (let i = 0; i < 101; i++) {
      svc.redo();
    }
    let count = 0;
    while (svc.canUndo()) {
      svc.undo();
      count++;
    }
    expect(count).toBeLessThanOrEqual(100);
  });

  it('should handle interleaved undo-push-redo correctly', () => {
    const a = makeCommand('a');
    const b = makeCommand('b');
    const c = makeCommand('c');
    svc.pushAndExecute(a);
    svc.pushAndExecute(b);
    svc.undo();
    svc.pushAndExecute(c);

    expect(svc.canRedo()).toBe(false);
    svc.undo();
    expect(c.undoCalls).toBe(1);
    svc.undo();
    expect(a.undoCalls).toBe(1);
    expect(svc.canUndo()).toBe(false);
  });

  it('undo/redo restores shape edit and defaults sync in one composite transaction', () => {
    let fill = '#000000';
    const fillCommand: EditorCommand = {
      description: 'Change fill',
      execute: () => {
        fill = '#ff0000';
      },
      undo: () => {
        fill = '#000000';
      }
    };

    let defaults = { fill: '#000000', stroke: '#000000', strokeWidth: 2 };
    const defaultsSvc = {
      setDefaults: vi.fn((next: typeof defaults) => {
        defaults = next;
      })
    } as unknown as DrawingStyleDefaultsService;
    const defaultsCommand = new UpdateDrawingDefaultsCommand(
      defaultsSvc,
      defaults,
      { ...defaults, fill: '#ff0000' },
      'fill'
    );
    const composite = new CompositeCommand([fillCommand, defaultsCommand], 'Paint edit + defaults');

    svc.pushAndExecute(composite);
    expect(fill).toBe('#ff0000');
    expect(defaults.fill).toBe('#ff0000');

    svc.undo();
    expect(fill).toBe('#000000');
    expect(defaults.fill).toBe('#000000');

    svc.redo();
    expect(fill).toBe('#ff0000');
    expect(defaults.fill).toBe('#ff0000');
  });

  describe('command coalescing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should coalesce rapid pushes with same coalesce key into one undo step', () => {
      const a = makeCoalesceableCommand('fill:shape1', 'red');
      const b = makeCoalesceableCommand('fill:shape1', 'green', 'red');
      const c = makeCoalesceableCommand('fill:shape1', 'blue', 'green');

      svc.pushAndExecute(a);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(b);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(c);

      expect(a.executeCalls).toBe(1);
      expect(b.executeCalls).toBe(1);
      expect(c.executeCalls).toBe(1);

      svc.undo();
      expect(svc.canUndo()).toBe(false);
    });

    it('coalesced undo should restore the original (first) old value', () => {
      let currentValue = 'original';
      const trackingCmd = (key: string, newVal: string, oldVal: string): CoalesceableCommand => ({
        description: `set ${newVal}`,
        coalesceKey: key,
        execute() { currentValue = newVal; },
        undo() { currentValue = oldVal; },
        coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
          const n = newer as ReturnType<typeof trackingCmd>;
          return trackingCmd(key, (n as any)._newVal, oldVal);
        },
        _newVal: newVal
      } as CoalesceableCommand & { _newVal: string });

      svc.pushAndExecute(trackingCmd('opacity:s1', '0.8', 'original'));
      expect(currentValue).toBe('0.8');
      vi.advanceTimersByTime(100);

      svc.pushAndExecute(trackingCmd('opacity:s1', '0.5', '0.8'));
      expect(currentValue).toBe('0.5');

      svc.undo();
      expect(currentValue).toBe('original');
    });

    it('should NOT coalesce pushes beyond the time window', () => {
      const a = makeCoalesceableCommand('fill:shape1', 'red');
      const b = makeCoalesceableCommand('fill:shape1', 'green', 'red');

      svc.pushAndExecute(a);
      vi.advanceTimersByTime(COALESCE_WINDOW_MS + 1);
      svc.pushAndExecute(b);

      svc.undo();
      expect(svc.canUndo()).toBe(true);
      svc.undo();
      expect(svc.canUndo()).toBe(false);
    });

    it('should NOT coalesce commands with different coalesce keys', () => {
      const a = makeCoalesceableCommand('fill:shape1', 'red');
      const b = makeCoalesceableCommand('fill:shape2', 'green');

      svc.pushAndExecute(a);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(b);

      svc.undo();
      expect(svc.canUndo()).toBe(true);
      svc.undo();
      expect(svc.canUndo()).toBe(false);
    });

    it('should NOT coalesce non-coalesceable commands', () => {
      const a = makeCommand('a');
      const b = makeCommand('b');

      svc.pushAndExecute(a);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(b);

      svc.undo();
      expect(svc.canUndo()).toBe(true);
    });

    it('should NOT coalesce coalesceable with non-coalesceable on stack top', () => {
      const a = makeCoalesceableCommand('fill:shape1', 'red');
      const b = makeCommand('move');
      const c = makeCoalesceableCommand('fill:shape1', 'blue', 'red');

      svc.pushAndExecute(a);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(b);
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(c);

      let undoCount = 0;
      while (svc.canUndo()) { svc.undo(); undoCount++; }
      expect(undoCount).toBe(3);
    });

    it('should clear redo stack when coalescing', () => {
      const a = makeCoalesceableCommand('fill:shape1', 'red');
      const b = makeCommand('other');

      svc.pushAndExecute(a);
      svc.pushAndExecute(b);
      svc.undo();
      expect(svc.canRedo()).toBe(true);

      const c = makeCoalesceableCommand('fill:shape1', 'green', 'red');
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(c);
      expect(svc.canRedo()).toBe(false);
    });

    it('coalesces rapid UnionScaleCommand with same coalesce key into one undo step', () => {
      const applyUnionScaleFromSnapshot = vi.fn();
      const mockSvg = {
        applyUnionScaleFromSnapshot,
        restoreSelectionTransformsFromSnapshot: vi.fn(),
        restoreVectorEffectsForShapeSubtrees: vi.fn(),
        getSVGInstance: vi.fn().mockReturnValue(null)
      } as unknown as SvgManipulationService;

      const before = { x: 0, y: 0, width: 100, height: 100 };
      const mid = { x: 0, y: 0, width: 120, height: 100 };
      const end = { x: 0, y: 0, width: 140, height: 100 };
      const snap = new Map<string, Matrix>();
      const ve = new Map<string, (string | null)[]>();
      const cmd1 = new UnionScaleCommand(mockSvg, ['s1'], before, mid, snap, 'e', ve);
      const cmd2 = new UnionScaleCommand(mockSvg, ['s1'], mid, end, snap, 'e', ve);

      svc.pushAndExecute(cmd1);
      vi.advanceTimersByTime(50);
      svc.pushAndExecute(cmd2);

      expect(svc.canUndo()).toBe(true);
      svc.undo();
      expect(svc.canUndo()).toBe(false);
      expect(applyUnionScaleFromSnapshot).toHaveBeenCalledTimes(2);
    });

    it('sliding window: continuous rapid events coalesce into one step', () => {
      for (let i = 0; i < 20; i++) {
        svc.pushAndExecute(makeCoalesceableCommand('opacity:s1', String(1 - i * 0.025)));
        vi.advanceTimersByTime(50);
      }

      let undoCount = 0;
      while (svc.canUndo()) { svc.undo(); undoCount++; }
      expect(undoCount).toBe(1);
    });

    it('pause in the middle creates two undo steps', () => {
      svc.pushAndExecute(makeCoalesceableCommand('opacity:s1', '0.9'));
      vi.advanceTimersByTime(100);
      svc.pushAndExecute(makeCoalesceableCommand('opacity:s1', '0.8', '0.9'));
      vi.advanceTimersByTime(COALESCE_WINDOW_MS + 1);
      svc.pushAndExecute(makeCoalesceableCommand('opacity:s1', '0.5', '0.8'));

      let undoCount = 0;
      while (svc.canUndo()) { svc.undo(); undoCount++; }
      expect(undoCount).toBe(2);
    });

    it('coalesces defaults commands by scope and undo restores original defaults', () => {
      let defaults = { fill: '#000000', stroke: '#000000', strokeWidth: 2 };
      const defaultsSvc = {
        setDefaults: vi.fn((next: typeof defaults) => {
          defaults = next;
        })
      } as unknown as DrawingStyleDefaultsService;

      const first = new UpdateDrawingDefaultsCommand(
        defaultsSvc,
        defaults,
        { ...defaults, fill: '#111111' },
        'fill'
      );
      svc.pushAndExecute(first);
      vi.advanceTimersByTime(100);

      const second = new UpdateDrawingDefaultsCommand(
        defaultsSvc,
        { ...defaults, fill: '#111111' },
        { ...defaults, fill: '#222222' },
        'fill'
      );
      svc.pushAndExecute(second);

      expect(defaults.fill).toBe('#222222');
      svc.undo();
      expect(defaults.fill).toBe('#000000');
      expect(svc.canUndo()).toBe(false);
    });
  });
});
