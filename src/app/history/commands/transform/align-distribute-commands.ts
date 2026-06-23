import type { EditorCommand } from '../../../models/editor-command';
import { CompositeCommand } from '../../../models/editor-command';
import type { AlignDistributeSvgPort } from '../../align-distribute-svg.port';
import { TranslateCommand } from './translate-command';

export type AlignmentDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

interface PlannedShapeDelta {
  id: string;
  dx: number;
  dy: number;
}

function isFinitePositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

export class AlignCommand implements EditorCommand {
  readonly description: string;
  private readonly composite: CompositeCommand;

  constructor(
    private readonly svc: AlignDistributeSvgPort,
    shapeIds: string[],
    private readonly direction: AlignmentDirection,
    private readonly preferScreenBounds = true
  ) {
    this.description = `Align ${direction}`;
    this.composite = this.buildComposite(shapeIds);
  }

  private buildComposite(shapeIds: string[]): CompositeCommand {
    if (shapeIds.length < 2) return new CompositeCommand([], this.description);
    const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const id of shapeIds) {
      const bounds = this.svc.getShapeBBox(id, { preferScreenBounds: this.preferScreenBounds });
      if (!bounds || !isFinitePositive(bounds.width) || !isFinitePositive(bounds.height)) {
        return new CompositeCommand([], this.description);
      }
      boundsById.set(id, bounds);
    }
    const union = this.svc.getUnionBBox(shapeIds, { preferScreenBounds: this.preferScreenBounds });
    if (!union || !isFinitePositive(union.width) || !isFinitePositive(union.height)) {
      return new CompositeCommand([], this.description);
    }

    const deltas: PlannedShapeDelta[] = shapeIds
      .map((id) => {
        const b = boundsById.get(id)!;
        let dx = 0;
        let dy = 0;
        switch (this.direction) {
          case 'left':
            dx = union.x - b.x;
            break;
          case 'center':
            dx = union.x + union.width / 2 - (b.x + b.width / 2);
            break;
          case 'right':
            dx = union.x + union.width - (b.x + b.width);
            break;
          case 'top':
            dy = union.y - b.y;
            break;
          case 'middle':
            dy = union.y + union.height / 2 - (b.y + b.height / 2);
            break;
          case 'bottom':
            dy = union.y + union.height - (b.y + b.height);
            break;
        }
        return { id, dx, dy };
      })
      .filter((delta) => Math.abs(delta.dx) > 1e-9 || Math.abs(delta.dy) > 1e-9);

    if (deltas.length === 0) return new CompositeCommand([], this.description);
    const snapshot = this.svc.snapshotSelectionTransforms(shapeIds);
    return new CompositeCommand(
      deltas.map((delta) => new TranslateCommand(this.svc, delta.id, delta.dx, delta.dy, snapshot)),
      this.description
    );
  }

  execute(): void {
    this.composite.execute();
  }

  undo(): void {
    this.composite.undo();
  }
}

export type DistributeDirection = 'horizontal' | 'vertical';

interface SortableShape {
  id: string;
  index: number;
  center: number;
}

export class DistributeCommand implements EditorCommand {
  readonly description: string;
  private readonly composite: CompositeCommand;

  constructor(
    private readonly svc: AlignDistributeSvgPort,
    shapeIds: string[],
    private readonly direction: DistributeDirection,
    private readonly preferScreenBounds = true
  ) {
    this.description = `Distribute ${direction}`;
    this.composite = this.buildComposite(shapeIds);
  }

  private buildComposite(shapeIds: string[]): CompositeCommand {
    if (shapeIds.length < 3) return new CompositeCommand([], this.description);
    const boundsById = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const id of shapeIds) {
      const bounds = this.svc.getShapeBBox(id, { preferScreenBounds: this.preferScreenBounds });
      if (!bounds || !isFinitePositive(bounds.width) || !isFinitePositive(bounds.height)) {
        return new CompositeCommand([], this.description);
      }
      boundsById.set(id, bounds);
    }

    const sortable: SortableShape[] = shapeIds.map((id, index) => {
      const b = boundsById.get(id)!;
      return {
        id,
        index,
        center: this.direction === 'horizontal' ? b.x + b.width / 2 : b.y + b.height / 2
      };
    });
    sortable.sort((a, b) => (a.center === b.center ? a.index - b.index : a.center - b.center));
    const first = sortable[0].center;
    const last = sortable[sortable.length - 1].center;
    const span = last - first;
    if (!Number.isFinite(span) || Math.abs(span) <= 1e-9) {
      return new CompositeCommand([], this.description);
    }
    const step = span / (sortable.length - 1);

    const deltas: PlannedShapeDelta[] = sortable
      .map((shape, sortedIndex) => {
        const targetCenter = first + step * sortedIndex;
        const delta = targetCenter - shape.center;
        if (this.direction === 'horizontal') return { id: shape.id, dx: delta, dy: 0 };
        return { id: shape.id, dx: 0, dy: delta };
      })
      .filter((delta) => Math.abs(delta.dx) > 1e-9 || Math.abs(delta.dy) > 1e-9);

    if (deltas.length === 0) return new CompositeCommand([], this.description);
    const snapshot = this.svc.snapshotSelectionTransforms(shapeIds);
    return new CompositeCommand(
      deltas.map((delta) => new TranslateCommand(this.svc, delta.id, delta.dx, delta.dy, snapshot)),
      this.description
    );
  }

  execute(): void {
    this.composite.execute();
  }

  undo(): void {
    this.composite.undo();
  }
}
