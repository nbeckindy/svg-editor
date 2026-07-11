export interface EditorCommand {
  readonly description: string;
  execute(): void;
  undo(): void;
}

/**
 * Commands pushed during an in-progress tool session that must be stripped from the undo stack
 * when the session commits or is discarded (pen segment edits today). Not undoable after finish.
 */
export interface ProvisionalCommand extends EditorCommand {
  readonly provisional: true;
}

export function isProvisionalCommand(cmd: EditorCommand): cmd is ProvisionalCommand {
  return (cmd as Partial<ProvisionalCommand>).provisional === true;
}

export interface CoalesceableCommand extends EditorCommand {
  readonly coalesceKey: string;
  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand;
}

export function isCoalesceable(cmd: EditorCommand): cmd is CoalesceableCommand {
  return (
    typeof (cmd as Partial<CoalesceableCommand>).coalesceKey === 'string' &&
    typeof (cmd as Partial<CoalesceableCommand>).coalesceWith === 'function'
  );
}

export class CompositeCommand implements EditorCommand {
  readonly description: string;
  readonly coalesceKey?: string;

  constructor(
    private readonly commands: EditorCommand[],
    description?: string
  ) {
    this.description = description ?? commands[0]?.description ?? 'Batch edit';
    if (commands.length > 0 && commands.every(isCoalesceable)) {
      const keys = (commands as CoalesceableCommand[]).map((c) => c.coalesceKey).sort();
      this.coalesceKey = `composite:${keys.join('|')}`;
    }
  }

  execute(): void {
    for (const cmd of this.commands) cmd.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as CompositeCommand;
    const merged = this.commands.map((cmd, i) =>
      (cmd as CoalesceableCommand).coalesceWith(n.commands[i] as CoalesceableCommand)
    );
    return new CompositeCommand(merged, this.description) as EditorCommand & CoalesceableCommand;
  }
}
