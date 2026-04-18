import { EditorHistoryService } from './editor-history.service';
import { EditorCommand } from '../models/editor-commands';

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
});
