import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditorCommand } from '../../../models/editor-command';
import type { SelectionSyncPort } from '../../history-selection.port';
import type { EditorShapeLifecycleSvgPort } from '../../editor-shape-lifecycle-svg.port';

/**
 * Undoable shape creation. The shape is created before the command is pushed
 * (during the gesture), so `execute()` is a no-op on the first call. Subsequent
 * calls (redo) re-insert from serialized markup.
 */
export class AddShapeCommand implements EditorCommand {
  readonly description: string;

  private serializedMarkup: string | null = null;
  private insertionIndex: number | null = null;
  private executed = false;

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly shapeId: string,
    private readonly selectionSync?: SelectionSyncPort
  ) {
    this.description = `Create shape`;
    this.captureState();
    this.executed = true;
  }

  private captureState(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;
    this.serializedMarkup = (shape.node as Element).outerHTML;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    if (contentGroup?.node) {
      const children = Array.from((contentGroup.node as Element).children);
      this.insertionIndex = children.indexOf(shape.node as Element);
    }
  }

  execute(): void {
    if (this.executed) {
      this.executed = false;
      return;
    }
    if (!this.serializedMarkup) return;
    this.svc.insertShapeMarkup(this.serializedMarkup, this.insertionIndex ?? undefined);
    if (this.selectionSync) {
      const svgInstance = this.svc.getSVGInstance();
      const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
      if (el) {
        this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
      }
    }
  }

  undo(): void {
    this.svc.removeShape(this.shapeId);
    this.selectionSync?.clearSelection();
  }
}

/**
 * Undoable raster `<image>` insert. Same lifecycle as {@link AddShapeCommand}: call
 * {@link SvgManipulationService.insertRasterImageIntoContentGroup} first, then push this command;
 * first `execute()` is a no-op; redo restores captured markup and selection.
 */
export class AddImageCommand implements EditorCommand {
  readonly description = 'Add image';

  private serializedMarkup: string | null = null;
  private insertionIndex: number | null = null;
  private executed = false;

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly shapeId: string,
    private readonly selectionSync?: SelectionSyncPort
  ) {
    this.captureState();
    this.executed = true;
  }

  private captureState(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return;
    this.serializedMarkup = (shape.node as Element).outerHTML;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    if (contentGroup?.node) {
      const children = Array.from((contentGroup.node as Element).children);
      this.insertionIndex = children.indexOf(shape.node as Element);
    }
  }

  execute(): void {
    if (this.executed) {
      this.executed = false;
      return;
    }
    if (!this.serializedMarkup) return;
    this.svc.insertShapeMarkup(this.serializedMarkup, this.insertionIndex ?? undefined);
    if (this.selectionSync) {
      const svgInstance = this.svc.getSVGInstance();
      const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
      if (el) {
        this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
      }
    }
  }

  undo(): void {
    this.svc.removeShape(this.shapeId);
    this.selectionSync?.clearSelection();
  }
}
