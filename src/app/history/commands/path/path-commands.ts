import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { PenPathSegment } from '../../../models/pen-path';
import type { EditorCommand } from '../../../models/editor-command';
import type { SelectionSyncPort } from '../../history-selection.port';
import type {
  EditorShapeLifecycleSvgPort,
  PathDataEditorSvgPort,
  PathNodeHandleLinkSvgPort
} from '../../editor-shape-lifecycle-svg.port';

/**
 * Undoable path creation (pen tool). Same lifecycle as {@link AddShapeCommand}: element exists
 * before `pushAndExecute`; first `execute()` is a no-op; redo restores markup and selection.
 */
export class AddPathCommand implements EditorCommand {
  readonly description = 'Add path';

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
/**
 * Undoable path node edit. Dragging applies `newD` before history push; first execute is a no-op.
 */
export class EditPathNodesCommand implements EditorCommand {
  readonly description = 'Edit path nodes';

  private appliedAlready = false;

  constructor(
    private readonly svc: PathDataEditorSvgPort,
    private readonly pathId: string,
    private readonly oldD: string,
    private readonly newD: string,
    appliedAlready = false
  ) {
    this.appliedAlready = appliedAlready;
  }

  execute(): void {
    if (this.appliedAlready) {
      this.appliedAlready = false;
      return;
    }
    this.svc.updatePathData(this.pathId, this.newD);
  }

  undo(): void {
    this.svc.updatePathData(this.pathId, this.oldD);
  }
}

/**
 * Undoable edit to `data-editor-path-node-handle-link` on a `<path>` (independent vs linked cubic drags).
 */
export class SetPathNodeHandleLinkCommand implements EditorCommand {
  readonly description = 'Path node handle link';

  private appliedAlready: boolean;

  constructor(
    private readonly svc: PathNodeHandleLinkSvgPort,
    private readonly pathId: string,
    private readonly oldRaw: string | null,
    private readonly newRaw: string | null,
    appliedAlready = false
  ) {
    this.appliedAlready = appliedAlready;
  }

  execute(): void {
    if (this.appliedAlready) {
      this.appliedAlready = false;
      return;
    }
    this.svc.setPathNodeHandleLinkRaw(this.pathId, this.newRaw);
  }

  undo(): void {
    this.svc.setPathNodeHandleLinkRaw(this.pathId, this.oldRaw);
  }
}

/**
 * Undoable edit to a single segment while authoring a pen path (before finish).
 * Dropped from history when the pen session ends so geometry stays baked into the finished path.
 */
export class PenSegmentReplaceCommand implements EditorCommand {
  readonly description = 'Pen segment edit';

  private appliedAlready: boolean;

  constructor(
    private readonly segmentIndex: number,
    private readonly before: PenPathSegment,
    private readonly after: PenPathSegment,
    private readonly applySegmentAt: (index: number, segment: PenPathSegment) => void,
    appliedAlready = true
  ) {
    this.appliedAlready = appliedAlready;
  }

  execute(): void {
    if (this.appliedAlready) {
      this.appliedAlready = false;
      return;
    }
    this.applySegmentAt(this.segmentIndex, { ...this.after } as PenPathSegment);
  }

  undo(): void {
    this.applySegmentAt(this.segmentIndex, { ...this.before } as PenPathSegment);
  }
}

/**
 * Atomic boolean path operation: removes operand paths and inserts one result path.
 * Captures operand markup + indices and result markup in the constructor for undo/redo.
 */
/**
 * Replaces a single primitive shape with an equivalent `<path>` at the same DOM index and id.
 * Captures original markup in the constructor for undo.
 */
export class OutlineToPathCommand implements EditorCommand {
  readonly description = 'Outline to path';

  private readonly originalMarkup: string;
  private readonly insertionIndex: number;

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    private readonly shapeId: string,
    private readonly pathMarkup: string,
    insertionIndex: number,
    private readonly selectionSync?: SelectionSyncPort
  ) {
    const svgInstance = this.svc.getSVGInstance();
    const shape = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) {
      this.originalMarkup = '';
      this.insertionIndex = insertionIndex;
      return;
    }
    this.originalMarkup = (shape.node as Element).outerHTML;
    this.insertionIndex = insertionIndex;
  }

  execute(): void {
    if (!this.originalMarkup) return;
    this.svc.removeShape(this.shapeId);
    this.svc.insertShapeMarkup(this.pathMarkup, this.insertionIndex);
    if (!this.selectionSync) return;
    const svgInstance = this.svc.getSVGInstance();
    const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    if (el) {
      this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
    }
  }

  undo(): void {
    if (!this.originalMarkup) return;
    this.svc.removeShape(this.shapeId);
    this.svc.insertShapeMarkup(this.originalMarkup, this.insertionIndex);
    if (!this.selectionSync) return;
    const svgInstance = this.svc.getSVGInstance();
    const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    if (el) {
      this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
    }
  }
}

export class BooleanPathCommand implements EditorCommand {
  readonly description: string;

  private readonly operandSerializedMarkup = new Map<string, string>();
  private readonly operandInsertionIndices = new Map<string, number>();
  private readonly operandIds: string[];

  constructor(
    private readonly svc: EditorShapeLifecycleSvgPort,
    operandIds: string[],
    private readonly resultId: string,
    private readonly resultMarkup: string,
    private readonly resultInsertionIndex: number,
    description: string,
    private readonly selectionSync?: SelectionSyncPort
  ) {
    this.description = description;
    this.operandIds = [...operandIds];
    this.captureOperandState();
  }

  private captureOperandState(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    const contentNode = contentGroup?.node as Element | undefined;

    for (const id of this.operandIds) {
      const shape = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!shape?.node) continue;
      this.operandSerializedMarkup.set(id, (shape.node as Element).outerHTML);
      if (contentNode) {
        const children = Array.from(contentNode.children);
        const idx = children.indexOf(shape.node as Element);
        if (idx >= 0) this.operandInsertionIndices.set(id, idx);
      }
    }
  }

  execute(): void {
    this.svc.removeShapes(this.operandIds);
    this.svc.insertShapeMarkup(this.resultMarkup, this.resultInsertionIndex);
    if (!this.selectionSync) return;
    const svgInstance = this.svc.getSVGInstance();
    const el = svgInstance?.findOne(`#${this.resultId}`) as SvgJsElement | undefined;
    if (el) {
      this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
    }
  }

  undo(): void {
    this.svc.removeShape(this.resultId);
    this.svc.restoreRemovedShapesInContentGroup(
      this.operandIds,
      this.operandSerializedMarkup,
      this.operandInsertionIndices
    );
    if (!this.selectionSync) return;
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const sorted = [...this.operandIds]
      .filter((id) => this.operandSerializedMarkup.has(id))
      .sort((a, b) => (this.operandInsertionIndices.get(a) ?? 0) - (this.operandInsertionIndices.get(b) ?? 0));
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
