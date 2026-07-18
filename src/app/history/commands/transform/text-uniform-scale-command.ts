import type { CoalesceableCommand } from '../../../models/editor-command';
import type { TransformGestureSvgPort } from '../../transform-gesture-svg.port';
import type { TextScaleAttrSnapshot, TextUniformScaleMode } from '../../../utils/text-uniform-scale';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sortedShapeIdsKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

/**
 * Text-only uniform resize: bake scale into `font-size` (+ spacing) and `x`/`y`.
 * Does not compose an SVG transform matrix.
 */
export class TextUniformScaleCommand implements CoalesceableCommand {
  readonly description = 'Resize text';
  readonly coalesceKey: string;

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeIds: string[],
    private readonly unionBefore: Rect,
    private readonly unionAfter: Rect,
    private readonly attrSnapshotBefore: Map<string, TextScaleAttrSnapshot>,
    private readonly mode: TextUniformScaleMode
  ) {
    this.coalesceKey = `text-uniform-scale:${sortedShapeIdsKey(shapeIds)}:${mode}`;
  }

  execute(): void {
    this.svc.applyTextUniformScaleFromSnapshot(
      this.shapeIds,
      this.unionBefore,
      this.unionAfter,
      this.attrSnapshotBefore,
      this.mode
    );
  }

  undo(): void {
    this.svc.restoreTextScaleAttrsFromSnapshot(this.shapeIds, this.attrSnapshotBefore);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as TextUniformScaleCommand;
    if (sortedShapeIdsKey(this.shapeIds) !== sortedShapeIdsKey(n.shapeIds) || this.mode !== n.mode) {
      throw new Error('TextUniformScaleCommand.coalesceWith: shape set or mode mismatch');
    }
    return new TextUniformScaleCommand(
      this.svc,
      this.shapeIds,
      this.unionBefore,
      n.unionAfter,
      this.attrSnapshotBefore,
      this.mode
    );
  }
}
