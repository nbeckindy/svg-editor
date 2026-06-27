import type { CoalesceableCommand } from '../../../models/editor-command';
import type { PropertiesPanelRectSvgPort } from '../../properties-panel-svg.port';

export class RectCornerRadiusCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: PropertiesPanelRectSvgPort,
    private readonly shapeId: string,
    private readonly oldRx: number,
    private readonly oldRy: number,
    private readonly newRadius: number
  ) {
    this.description =
      newRadius > 0 ? `Set corner radius to ${newRadius}` : 'Remove corner radius';
    this.coalesceKey = `rect-corner-radius:${shapeId}`;
  }

  execute(): void {
    this.svc.updateRectCornerRadius(this.shapeId, this.newRadius);
  }

  undo(): void {
    this.svc.restoreRectCornerRadii(this.shapeId, this.oldRx, this.oldRy);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as RectCornerRadiusCommand;
    return new RectCornerRadiusCommand(this.svc, this.shapeId, this.oldRx, this.oldRy, n.newRadius);
  }
}
