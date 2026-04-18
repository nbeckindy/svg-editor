import { Injectable, signal, computed } from '@angular/core';
import { EditorCommand } from '../models/editor-commands';

const MAX_STACK_DEPTH = 100;

@Injectable({ providedIn: 'root' })
export class EditorHistoryService {
  private readonly undoStack = signal<EditorCommand[]>([]);
  private readonly redoStack = signal<EditorCommand[]>([]);

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

  /** Incremented after every undo() or redo() so consumers can react. */
  readonly revision = signal(0);

  pushAndExecute(command: EditorCommand): void {
    command.execute();
    this.undoStack.update((stack) => {
      const next = [...stack, command];
      if (next.length > MAX_STACK_DEPTH) {
        next.shift();
      }
      return next;
    });
    this.redoStack.set([]);
  }

  undo(): void {
    const stack = this.undoStack();
    if (stack.length === 0) return;
    const command = stack[stack.length - 1];
    this.undoStack.update((s) => s.slice(0, -1));
    command.undo();
    this.redoStack.update((s) => [...s, command]);
    this.revision.update((r) => r + 1);
  }

  redo(): void {
    const stack = this.redoStack();
    if (stack.length === 0) return;
    const command = stack[stack.length - 1];
    this.redoStack.update((s) => s.slice(0, -1));
    command.execute();
    this.undoStack.update((s) => {
      const next = [...s, command];
      if (next.length > MAX_STACK_DEPTH) {
        next.shift();
      }
      return next;
    });
    this.revision.update((r) => r + 1);
  }

  clear(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }
}
