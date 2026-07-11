import { CompositeCommand, type EditorCommand } from '../../models/editor-commands';

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
