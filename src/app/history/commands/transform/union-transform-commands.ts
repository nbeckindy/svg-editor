import { Matrix } from '@svgdotjs/svg.js';
import type { CoalesceableCommand, EditorCommand } from '../../../models/editor-command';
import type { TransformGestureSvgPort } from '../../transform-gesture-svg.port';
import { type ResizeHandle } from '../../../utils/selection-resize';
import { type SkewAxis } from '../../../utils/selection-skew';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sortedShapeIdsKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

function pivotCoalesceKey(p: { x: number; y: number }): string {
  const q = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  return `${q(p.x)},${q(p.y)}`;
}

export class UnionScaleCommand implements CoalesceableCommand {
  readonly description = 'Resize shapes';
  readonly coalesceKey: string;

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeIds: string[],
    private readonly unionBefore: Rect,
    private readonly unionAfter: Rect,
    private readonly snapshotBefore: Map<string, Matrix>,
    private readonly handle: ResizeHandle,
    private readonly vectorEffectBefore: Map<string, (string | null)[]>
  ) {
    this.coalesceKey = `union-scale:${sortedShapeIdsKey(shapeIds)}:${handle}`;
  }

  execute(): void {
    this.svc.applyUnionScaleFromSnapshot(
      this.shapeIds,
      this.unionBefore,
      this.unionAfter,
      this.snapshotBefore,
      this.handle
    );
  }

  undo(): void {
    this.svc.restoreSelectionTransformsFromSnapshot(this.shapeIds, this.snapshotBefore);
    this.svc.restoreVectorEffectsForShapeSubtrees(this.shapeIds, this.vectorEffectBefore);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as UnionScaleCommand;
    if (sortedShapeIdsKey(this.shapeIds) !== sortedShapeIdsKey(n.shapeIds) || this.handle !== n.handle) {
      throw new Error('UnionScaleCommand.coalesceWith: shape set or handle mismatch');
    }
    return new UnionScaleCommand(
      this.svc,
      this.shapeIds,
      this.unionBefore,
      n.unionAfter,
      this.snapshotBefore,
      this.handle,
      this.vectorEffectBefore
    );
  }
}

export class UnionScaleFromCenterCommand implements EditorCommand {
  readonly description = 'Resize shapes (center)';

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeIds: string[],
    private readonly unionBefore: Rect,
    private readonly unionAfter: Rect,
    private readonly snapshotBefore: Map<string, Matrix>,
    private readonly vectorEffectBefore: Map<string, (string | null)[]>
  ) {}

  execute(): void {
    this.svc.applyUnionScaleFromCenter(
      this.shapeIds,
      this.unionBefore,
      this.unionAfter,
      this.snapshotBefore
    );
  }

  undo(): void {
    this.svc.restoreSelectionTransformsFromSnapshot(this.shapeIds, this.snapshotBefore);
    this.svc.restoreVectorEffectsForShapeSubtrees(this.shapeIds, this.vectorEffectBefore);
  }
}

export class UnionRotateCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeIds: string[],
    private readonly pivot: { x: number; y: number },
    private readonly angleDeg: number,
    private readonly snapshotBefore: Map<string, Matrix>
  ) {
    this.description = `Rotate ${angleDeg}°`;
    this.coalesceKey = `union-rotate:${sortedShapeIdsKey(shapeIds)}:${pivotCoalesceKey(pivot)}`;
  }

  execute(): void {
    this.svc.applyUnionRotationFromSnapshot(
      this.shapeIds,
      this.pivot,
      this.angleDeg,
      this.snapshotBefore
    );
  }

  undo(): void {
    this.svc.restoreSelectionTransformsFromSnapshot(this.shapeIds, this.snapshotBefore);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as UnionRotateCommand;
    if (sortedShapeIdsKey(this.shapeIds) !== sortedShapeIdsKey(n.shapeIds) || this.coalesceKey !== n.coalesceKey) {
      throw new Error('UnionRotateCommand.coalesceWith: shape set or pivot mismatch');
    }
    const sum = this.angleDeg + n.angleDeg;
    return new UnionRotateCommand(this.svc, this.shapeIds, this.pivot, sum, this.snapshotBefore);
  }
}

export class SkewCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: TransformGestureSvgPort,
    private readonly shapeIds: string[],
    private readonly axis: SkewAxis,
    private readonly angleDeg: number,
    private readonly pivot: { x: number; y: number },
    private readonly snapshotBefore: Map<string, Matrix>
  ) {
    this.description = this.axis === 'x' ? `Skew X ${angleDeg}°` : `Skew Y ${angleDeg}°`;
  }

  execute(): void {
    this.svc.applyUnionSkewFromSnapshot(
      this.shapeIds,
      this.axis,
      this.angleDeg,
      this.pivot,
      this.snapshotBefore
    );
  }

  undo(): void {
    this.svc.restoreSelectionTransformsFromSnapshot(this.shapeIds, this.snapshotBefore);
  }
}
