import { Matrix } from '@svgdotjs/svg.js';
import type { CoalesceableCommand } from '../../../models/editor-command';
import type { TransformGestureSvgPort } from '../../transform-gesture-svg.port';

export class TranslateCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeId: string,
    private readonly dx: number,
    private readonly dy: number,
    private readonly snapshotBefore: Map<string, Matrix>
  ) {
    this.description = `Move shape by (${dx}, ${dy})`;
    this.coalesceKey = `translate:${shapeId}`;
  }

  execute(): void {
    this.svc.translateShape(this.shapeId, this.dx, this.dy);
  }

  undo(): void {
    this.svc.restoreSelectionTransformsFromSnapshot([this.shapeId], this.snapshotBefore);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as TranslateCommand;
    if (n.shapeId !== this.shapeId) {
      throw new Error(`TranslateCommand.coalesceWith shapeId mismatch: ${this.shapeId} vs ${n.shapeId}`);
    }
    return new TranslateCommand(this.svc, this.shapeId, this.dx + n.dx, this.dy + n.dy, this.snapshotBefore);
  }
}
