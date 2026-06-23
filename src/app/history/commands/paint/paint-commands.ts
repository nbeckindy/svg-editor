import type { PaintGradientSnapshot } from '../../../models/svg-gradient';
import type { DrawingStyleDefaults } from '../../../models/drawing-style-defaults';
import type { DrawingStyleDefaultsWritePort } from '../../drawing-style-defaults.port';
import type { CoalesceableCommand, EditorCommand } from '../../../models/editor-command';
import type { HistoryPaintPort } from '../../history-paint.port';
import type { SelectionPaintStrokeDashSvgPort } from '../../chrome-editor-apply-svg.port';
import type { GradientFillSnapshotSvgPort } from '../../gradient-fill-editor-svg.port';

export class FillColorCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly paint: HistoryPaintPort,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change fill to ${newColor}`;
    this.coalesceKey = `fill:${shapeId}`;
  }

  execute(): void {
    this.paint.updateFillColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.paint.updateFillColor(this.shapeId, this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as FillColorCommand;
    return new FillColorCommand(this.paint, this.shapeId, this.oldColor, n.newColor);
  }
}

/** Undoable fill/stroke paint swap including serialized `<linearGradient>` / `<radialGradient>` defs. */
export class GradientFillSnapshotCommand implements CoalesceableCommand {
  readonly description = 'Edit gradient paint';
  readonly coalesceKey: string;

  constructor(
    private readonly svc: GradientFillSnapshotSvgPort,
    private readonly shapeId: string,
    private readonly paintProperty: 'fill' | 'stroke',
    readonly before: PaintGradientSnapshot,
    readonly after: PaintGradientSnapshot
  ) {
    this.coalesceKey = `gradfill:${shapeId}:${paintProperty}`;
  }

  execute(): void {
    this.svc.applyPaintGradientSnapshot(this.shapeId, this.paintProperty, this.after);
    const gid = this.before.gradientId;
    if (gid && this.svc.countPaintUrlReferencesToDefId(gid) === 0) {
      this.svc.removeGradientDefById(gid);
    }
  }

  undo(): void {
    this.svc.applyPaintGradientSnapshot(this.shapeId, this.paintProperty, this.before);
    const gid = this.after.gradientId;
    if (gid && this.svc.countPaintUrlReferencesToDefId(gid) === 0) {
      this.svc.removeGradientDefById(gid);
    }
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as GradientFillSnapshotCommand;
    return new GradientFillSnapshotCommand(this.svc, this.shapeId, this.paintProperty, this.before, n.after);
  }
}

export class StrokeColorCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly paint: HistoryPaintPort,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change stroke to ${newColor}`;
    this.coalesceKey = `stroke-color:${shapeId}`;
  }

  execute(): void {
    this.paint.updateStrokeColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.paint.updateStrokeColor(this.shapeId, this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as StrokeColorCommand;
    return new StrokeColorCommand(this.paint, this.shapeId, this.oldColor, n.newColor);
  }
}

export class AddStrokeCommand implements EditorCommand {
  readonly description = 'Add stroke';

  constructor(
    private readonly svc: SelectionPaintStrokeDashSvgPort,
    private readonly shapeId: string,
    private readonly color: string,
    private readonly width: number
  ) {}

  execute(): void {
    this.svc.addStroke(this.shapeId, this.color, this.width);
  }

  undo(): void {
    this.svc.removeStroke(this.shapeId);
  }
}

export class RemoveStrokeCommand implements EditorCommand {
  readonly description = 'Remove stroke';

  constructor(
    private readonly svc: SelectionPaintStrokeDashSvgPort,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly oldWidth: number
  ) {}

  execute(): void {
    this.svc.removeStroke(this.shapeId);
  }

  undo(): void {
    this.svc.addStroke(this.shapeId, this.oldColor, this.oldWidth);
  }
}

export class SetStrokeCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SelectionPaintStrokeDashSvgPort,
    private readonly shapeId: string,
    private readonly hadStrokeBefore: boolean,
    private readonly oldColor: string,
    private readonly oldWidth: number,
    private readonly newColor: string,
    private readonly newWidth: number
  ) {
    this.description = `Set stroke ${newColor} width ${newWidth}`;
    this.coalesceKey = `set-stroke:${shapeId}`;
  }

  execute(): void {
    this.svc.addStroke(this.shapeId, this.newColor, this.newWidth);
  }

  undo(): void {
    if (this.hadStrokeBefore) {
      this.svc.addStroke(this.shapeId, this.oldColor, this.oldWidth);
    } else {
      this.svc.removeStroke(this.shapeId);
    }
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as SetStrokeCommand;
    return new SetStrokeCommand(
      this.svc, this.shapeId,
      this.hadStrokeBefore, this.oldColor, this.oldWidth,
      n.newColor, n.newWidth
    );
  }
}

export class OpacityCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly paint: HistoryPaintPort,
    private readonly shapeId: string,
    private readonly oldOpacity: number,
    private readonly newOpacity: number
  ) {
    this.description = `Change opacity to ${newOpacity}`;
    this.coalesceKey = `opacity:${shapeId}`;
  }

  execute(): void {
    this.paint.updateOpacity(this.shapeId, this.newOpacity);
  }

  undo(): void {
    this.paint.updateOpacity(this.shapeId, this.oldOpacity);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as OpacityCommand;
    return new OpacityCommand(this.paint, this.shapeId, this.oldOpacity, n.newOpacity);
  }
}

export class StrokeDashArrayCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SelectionPaintStrokeDashSvgPort,
    private readonly shapeId: string,
    private readonly oldDasharray: string,
    private readonly newDasharray: string
  ) {
    this.description = newDasharray ? `Set dash pattern ${newDasharray}` : 'Remove dash pattern';
    this.coalesceKey = `stroke-dasharray:${shapeId}`;
  }

  execute(): void {
    this.svc.updateStrokeDasharray(this.shapeId, this.newDasharray);
  }

  undo(): void {
    this.svc.updateStrokeDasharray(this.shapeId, this.oldDasharray);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as StrokeDashArrayCommand;
    return new StrokeDashArrayCommand(this.svc, this.shapeId, this.oldDasharray, n.newDasharray);
  }
}

export class StrokeDashOffsetCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SelectionPaintStrokeDashSvgPort,
    private readonly shapeId: string,
    private readonly oldOffset: number,
    private readonly newOffset: number
  ) {
    this.description = `Set dash offset to ${newOffset}`;
    this.coalesceKey = `stroke-dashoffset:${shapeId}`;
  }

  execute(): void {
    this.svc.updateStrokeDashoffset(this.shapeId, this.newOffset);
  }

  undo(): void {
    this.svc.updateStrokeDashoffset(this.shapeId, this.oldOffset);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as StrokeDashOffsetCommand;
    return new StrokeDashOffsetCommand(this.svc, this.shapeId, this.oldOffset, n.newOffset);
  }
}

export class UpdateDrawingDefaultsCommand implements CoalesceableCommand {
  readonly description = 'Update drawing defaults';
  readonly coalesceKey: string;

  constructor(
    private readonly defaults: DrawingStyleDefaultsWritePort,
    private readonly before: DrawingStyleDefaults,
    private readonly after: DrawingStyleDefaults,
    private readonly scope:
      | 'fill'
      | 'stroke'
      | 'strokeWidth'
      | 'typography'
      | 'all' = 'all'
  ) {
    this.coalesceKey = `drawing-defaults:${scope}`;
  }

  execute(): void {
    this.defaults.setDefaults(this.after);
  }

  undo(): void {
    this.defaults.setDefaults(this.before);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as UpdateDrawingDefaultsCommand;
    return new UpdateDrawingDefaultsCommand(this.defaults, this.before, n.after, this.scope);
  }
}
