import type { CoalesceableCommand, EditorCommand } from '../../../models/editor-command';
import type { PropertiesPanelTextSvgPort } from '../../properties-panel-svg.port';
import type { EditorShapeLifecycleSvgPort } from '../../editor-shape-lifecycle-svg.port';

export class TextContentCommand implements EditorCommand {
  readonly description = 'Edit text content';

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly textId: string,
    private readonly oldText: string,
    private readonly newText: string
  ) {}

  execute(): void {
    this.svc.updateTextContent(this.textId, this.newText);
  }

  undo(): void {
    this.svc.updateTextContent(this.textId, this.oldText);
  }
}

export type FontProperty = 'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle';
type FontValue = string | number;

export class FontCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: PropertiesPanelTextSvgPort,
    private readonly textId: string,
    private readonly property: FontProperty,
    private readonly oldValue: FontValue,
    private readonly newValue: FontValue
  ) {
    this.description = `Set ${property}`;
    this.coalesceKey = `font:${this.textId}:${this.property}`;
  }

  execute(): void {
    this.apply(this.newValue);
  }

  undo(): void {
    this.apply(this.oldValue);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as FontCommand;
    return new FontCommand(this.svc, this.textId, this.property, this.oldValue, n.newValue);
  }

  private apply(value: FontValue): void {
    switch (this.property) {
      case 'fontFamily':
        this.svc.updateTextFontFamily(this.textId, String(value));
        break;
      case 'fontSize':
        this.svc.updateTextFontSize(this.textId, Number(value));
        break;
      case 'fontWeight':
        this.svc.updateTextFontWeight(this.textId, String(value));
        break;
      case 'fontStyle':
        this.svc.updateTextFontStyle(this.textId, String(value));
        break;
    }
  }
}

export class TextAlignCommand implements CoalesceableCommand {
  readonly description = 'Set text alignment';
  readonly coalesceKey: string;

  constructor(
    private readonly svc: PropertiesPanelTextSvgPort,
    private readonly textId: string,
    private readonly oldAnchor: 'start' | 'middle' | 'end',
    private readonly newAnchor: 'start' | 'middle' | 'end'
  ) {
    this.coalesceKey = `text-anchor:${textId}`;
  }

  execute(): void {
    this.svc.updateTextAnchor(this.textId, this.newAnchor);
  }

  undo(): void {
    this.svc.updateTextAnchor(this.textId, this.oldAnchor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as TextAlignCommand;
    return new TextAlignCommand(this.svc, this.textId, this.oldAnchor, n.newAnchor);
  }
}

/** Sets `paint-order` on `<text>` (outline vs fill stacking). */
export class TextPaintOrderCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: PropertiesPanelTextSvgPort,
    private readonly textId: string,
    private readonly oldOrder: string | undefined,
    private readonly newOrder: string | undefined
  ) {
    this.description = 'Set text paint order';
    this.coalesceKey = `text-paint-order:${textId}`;
  }

  execute(): void {
    this.svc.updateTextPaintOrder(this.textId, this.newOrder);
  }

  undo(): void {
    this.svc.updateTextPaintOrder(this.textId, this.oldOrder);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as TextPaintOrderCommand;
    return new TextPaintOrderCommand(this.svc, this.textId, this.oldOrder, n.newOrder);
  }
}

/** Sets `vector-effect` on `<text>` (e.g. non-scaling stroke when the SVG is scaled). */
export class TextVectorEffectCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: PropertiesPanelTextSvgPort,
    private readonly textId: string,
    private readonly oldEffect: string | undefined,
    private readonly newEffect: string | undefined
  ) {
    this.description = 'Set text vector-effect';
    this.coalesceKey = `text-vector-effect:${textId}`;
  }

  execute(): void {
    this.svc.updateTextVectorEffect(this.textId, this.newEffect);
  }

  undo(): void {
    this.svc.updateTextVectorEffect(this.textId, this.oldEffect);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as TextVectorEffectCommand;
    return new TextVectorEffectCommand(this.svc, this.textId, this.oldEffect, n.newEffect);
  }
}
