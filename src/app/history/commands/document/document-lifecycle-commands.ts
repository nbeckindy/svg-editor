import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ClipboardPayload } from '../../../models/clipboard-payload';
import type { EditorCommand } from '../../../models/editor-command';
import type { SelectionSyncPort } from '../../history-selection.port';
import type { EditorShapeLifecycleSvgPort } from '../../editor-shape-lifecycle-svg.port';
import type { LiveTreeMarkup } from '../../../utils/svg-sanitize';

export class RemoveShapesCommand implements EditorCommand {
  readonly description = 'Remove shapes';

  private readonly serializedMarkup: Map<string, LiveTreeMarkup>;
  private readonly insertionIndices: Map<string, number>;

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly shapeIds: string[],
    private readonly selectionSync?: SelectionSyncPort
  ) {
    this.serializedMarkup = new Map<string, LiveTreeMarkup>();
    this.insertionIndices = new Map();

    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    const contentNode = contentGroup?.node as Element | undefined;

    for (const id of this.shapeIds) {
      const shape = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!shape?.node) continue;
      // outerHTML comes from the Live tree, which was sanitized at ingest (ADR 0002).
      this.serializedMarkup.set(id, (shape.node as Element).outerHTML as LiveTreeMarkup);
      if (contentNode) {
        const children = Array.from(contentNode.children);
        const idx = children.indexOf(shape.node as Element);
        if (idx >= 0) this.insertionIndices.set(id, idx);
      }
    }
  }

  execute(): void {
    this.svc.removeShapes(this.shapeIds);
    this.selectionSync?.clearSelection();
  }

  undo(): void {
    this.svc.restoreRemovedShapesInContentGroup(this.shapeIds, this.serializedMarkup, this.insertionIndices);

    if (this.selectionSync) {
      const svgInstance = this.svc.getSVGInstance();
      if (!svgInstance) return;
      const sorted = [...this.shapeIds]
        .filter((id) => this.serializedMarkup.has(id))
        .sort((a, b) => (this.insertionIndices.get(a) ?? 0) - (this.insertionIndices.get(b) ?? 0));
      const restoredProps = sorted
        .map((id) => {
          const el = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
          return el ? this.svc.getShapeProperties(el) : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      if (restoredProps.length > 0) {
        this.selectionSync.selectShapes(restoredProps);
      }
    }
  }
}

export class PasteCommand implements EditorCommand {
  readonly description = 'Paste shapes';
  private insertedIds: string[] = [];
  private insertedMarkup: LiveTreeMarkup[] = [];

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly payload: ClipboardPayload,
    private readonly offset: { dx: number; dy: number },
    private readonly selectionSync?: SelectionSyncPort
  ) {}

  execute(): void {
    if (this.insertedMarkup.length > 0) {
      for (const markup of this.insertedMarkup) {
        this.svc.insertShapeMarkup(markup);
      }
    } else {
      const inserted = this.svc.pasteClipboardPayload(this.payload, this.offset);
      this.insertedIds = inserted.insertedIds;
      this.insertedMarkup = inserted.insertedMarkup;
    }

    if (!this.selectionSync || this.insertedIds.length === 0) return;
    const svg = this.svc.getSVGInstance();
    if (!svg) return;
    const selected = this.insertedIds
      .map((id) => {
        const el = svg.findOne(`#${id}`) as SvgJsElement | undefined;
        return el ? this.svc.getShapeProperties(el) : null;
      })
      .filter((shape): shape is NonNullable<typeof shape> => shape !== null);
    if (selected.length > 0) this.selectionSync.selectShapes(selected);
  }

  undo(): void {
    if (this.insertedIds.length === 0) return;
    this.svc.removeShapes(this.insertedIds);
    this.selectionSync?.clearSelection();
  }
}

export class DuplicateCommand implements EditorCommand {
  readonly description = 'Duplicate shapes';
  private readonly payload: ClipboardPayload;
  private insertedIds: string[] = [];
  private insertedMarkup: LiveTreeMarkup[] = [];

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    sourceShapeIds: string[],
    private readonly offset: { dx: number; dy: number },
    private readonly selectionSync?: SelectionSyncPort
  ) {
    this.payload = this.svc.createClipboardPayload(sourceShapeIds);
  }

  execute(): void {
    if (this.payload.shapes.length === 0) return;
    if (this.insertedMarkup.length > 0) {
      for (const markup of this.insertedMarkup) {
        this.svc.insertShapeMarkup(markup);
      }
    } else {
      const inserted = this.svc.pasteClipboardPayload(this.payload, this.offset);
      this.insertedIds = inserted.insertedIds;
      this.insertedMarkup = inserted.insertedMarkup;
    }

    if (!this.selectionSync || this.insertedIds.length === 0) return;
    const svg = this.svc.getSVGInstance();
    if (!svg) return;
    const selected = this.insertedIds
      .map((id) => {
        const el = svg.findOne(`#${id}`) as SvgJsElement | undefined;
        return el ? this.svc.getShapeProperties(el) : null;
      })
      .filter((shape): shape is NonNullable<typeof shape> => shape !== null);
    if (selected.length > 0) this.selectionSync.selectShapes(selected);
  }

  undo(): void {
    if (this.insertedIds.length === 0) return;
    this.svc.removeShapes(this.insertedIds);
    this.selectionSync?.clearSelection();
  }
}
