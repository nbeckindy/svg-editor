import type { EditorCommand } from '../../../models/editor-command';
import type { BakePresentationSvgPort } from '../../properties-panel-svg.port';

/**
 * Snapshot of fill-related DOM state needed to fully restore the cascade on undo.
 */
interface FillSnapshot {
  fillAttr: string | null;
  fillStyleValue: string;
}

export class BakeFillCommand implements EditorCommand {
  readonly description = 'Bake fill to local';

  private readonly before: FillSnapshot;

  constructor(
    private readonly svc: BakePresentationSvgPort,
    private readonly shapeId: string
  ) {
    const svgInstance = this.svc.getSVGInstance();
    const node = svgInstance?.findOne(`#${this.shapeId}`)?.node as SVGGraphicsElement | undefined;
    this.before = {
      fillAttr: node?.getAttribute('fill') ?? null,
      fillStyleValue: node?.style?.getPropertyValue('fill')?.trim() ?? ''
    };
  }

  execute(): void {
    this.svc.bakeEffectiveFillToLocal(this.shapeId);
  }

  undo(): void {
    this.svc.restoreBakedFillPresentation(this.shapeId, this.before);
  }
}

/**
 * Snapshot of stroke-related DOM state needed to fully restore the cascade on undo.
 */
interface StrokeSnapshot {
  strokeAttr: string | null;
  strokeStyleValue: string;
  strokeWidthAttr: string | null;
  strokeWidthStyleValue: string;
}

export class BakeStrokeCommand implements EditorCommand {
  readonly description = 'Bake stroke to local';

  private readonly before: StrokeSnapshot;

  constructor(
    private readonly svc: BakePresentationSvgPort,
    private readonly shapeId: string
  ) {
    const svgInstance = this.svc.getSVGInstance();
    const node = svgInstance?.findOne(`#${this.shapeId}`)?.node as SVGGraphicsElement | undefined;
    this.before = {
      strokeAttr: node?.getAttribute('stroke') ?? null,
      strokeStyleValue: node?.style?.getPropertyValue('stroke')?.trim() ?? '',
      strokeWidthAttr: node?.getAttribute('stroke-width') ?? null,
      strokeWidthStyleValue: node?.style?.getPropertyValue('stroke-width')?.trim() ?? ''
    };
  }

  execute(): void {
    this.svc.bakeEffectiveStrokeToLocal(this.shapeId);
  }

  undo(): void {
    this.svc.restoreBakedStrokePresentation(this.shapeId, this.before);
  }
}
