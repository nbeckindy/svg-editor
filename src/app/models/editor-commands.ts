import { Matrix, Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgManipulationService, type CreatableShapeType, type ShapeCreationAttrs } from '../services/svg-manipulation.service';
import { ShapeSelectionService } from '../services/shape-selection.service';
import { type ResizeCorner } from '../utils/selection-resize';
import { ArtboardModel } from './artboard.model';

export interface EditorCommand {
  readonly description: string;
  execute(): void;
  undo(): void;
}

export interface CoalesceableCommand extends EditorCommand {
  readonly coalesceKey: string;
  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand;
}

export function isCoalesceable(cmd: EditorCommand): cmd is CoalesceableCommand {
  return (
    typeof (cmd as Partial<CoalesceableCommand>).coalesceKey === 'string' &&
    typeof (cmd as Partial<CoalesceableCommand>).coalesceWith === 'function'
  );
}

export class CompositeCommand implements EditorCommand {
  readonly description: string;
  readonly coalesceKey?: string;

  constructor(
    private readonly commands: EditorCommand[],
    description?: string
  ) {
    this.description = description ?? commands[0]?.description ?? 'Batch edit';
    if (commands.length > 0 && commands.every(isCoalesceable)) {
      const keys = (commands as CoalesceableCommand[]).map((c) => c.coalesceKey).sort();
      this.coalesceKey = `composite:${keys.join('|')}`;
    }
  }

  execute(): void {
    for (const cmd of this.commands) cmd.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as CompositeCommand;
    const merged = this.commands.map((cmd, i) =>
      (cmd as CoalesceableCommand).coalesceWith(n.commands[i] as CoalesceableCommand)
    );
    return new CompositeCommand(merged, this.description) as EditorCommand & CoalesceableCommand;
  }
}

export class FillColorCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change fill to ${newColor}`;
    this.coalesceKey = `fill:${shapeId}`;
  }

  execute(): void {
    this.svc.updateFillColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.svc.updateFillColor(this.shapeId, this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as FillColorCommand;
    return new FillColorCommand(this.svc, this.shapeId, this.oldColor, n.newColor);
  }
}

export class StrokeColorCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change stroke to ${newColor}`;
    this.coalesceKey = `stroke-color:${shapeId}`;
  }

  execute(): void {
    this.svc.updateStrokeColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.svc.updateStrokeColor(this.shapeId, this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as StrokeColorCommand;
    return new StrokeColorCommand(this.svc, this.shapeId, this.oldColor, n.newColor);
  }
}

export class AddStrokeCommand implements EditorCommand {
  readonly description = 'Add stroke';

  constructor(
    private readonly svc: SvgManipulationService,
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
    private readonly svc: SvgManipulationService,
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
    private readonly svc: SvgManipulationService,
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
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldOpacity: number,
    private readonly newOpacity: number
  ) {
    this.description = `Change opacity to ${newOpacity}`;
    this.coalesceKey = `opacity:${shapeId}`;
  }

  execute(): void {
    this.svc.updateOpacity(this.shapeId, this.newOpacity);
  }

  undo(): void {
    this.svc.updateOpacity(this.shapeId, this.oldOpacity);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as OpacityCommand;
    return new OpacityCommand(this.svc, this.shapeId, this.oldOpacity, n.newOpacity);
  }
}

export class StrokeDashArrayCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey: string;

  constructor(
    private readonly svc: SvgManipulationService,
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
    private readonly svc: SvgManipulationService,
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

export class TranslateCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly dx: number,
    private readonly dy: number,
    private readonly snapshotBefore: Map<string, Matrix>
  ) {
    this.description = `Move shape by (${dx}, ${dy})`;
  }

  execute(): void {
    this.svc.translateShape(this.shapeId, this.dx, this.dy);
  }

  undo(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    const saved = this.snapshotBefore.get(this.shapeId);
    if (shape && saved && typeof shape.matrix === 'function') {
      shape.matrix(saved);
    }
  }
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class UnionScaleCommand implements EditorCommand {
  readonly description = 'Resize shapes';

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeIds: string[],
    private readonly unionBefore: Rect,
    private readonly unionAfter: Rect,
    private readonly snapshotBefore: Map<string, Matrix>,
    private readonly handle: ResizeCorner
  ) {}

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
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    for (const id of this.shapeIds) {
      const shape = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      const saved = this.snapshotBefore.get(id);
      if (shape && saved && typeof shape.matrix === 'function') {
        shape.matrix(saved);
      }
    }
  }
}

export class UnionRotateCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeIds: string[],
    private readonly pivot: { x: number; y: number },
    private readonly angleDeg: number,
    private readonly snapshotBefore: Map<string, Matrix>
  ) {
    this.description = `Rotate ${angleDeg}°`;
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
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    for (const id of this.shapeIds) {
      const shape = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      const saved = this.snapshotBefore.get(id);
      if (shape && saved && typeof shape.matrix === 'function') {
        shape.matrix(saved);
      }
    }
  }
}

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export class ReorderCommand implements EditorCommand {
  readonly description: string;
  private oldIndex: number = -1;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly elementId: string,
    private readonly direction: ReorderDirection
  ) {
    this.description = `Move element ${direction}`;
    this.captureOldIndex();
  }

  private captureOldIndex(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const el = svgInstance.findOne(`#${this.elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return;
    const node = el.node as Element;
    const parent = node.parentElement;
    if (!parent) return;
    this.oldIndex = Array.from(parent.children).indexOf(node);
  }

  execute(): void {
    this.captureOldIndex();
    switch (this.direction) {
      case 'forward':
        this.svc.moveElementForward(this.elementId);
        break;
      case 'backward':
        this.svc.moveElementBackward(this.elementId);
        break;
      case 'front':
        this.svc.moveElementToFront(this.elementId);
        break;
      case 'back':
        this.svc.moveElementToBack(this.elementId);
        break;
    }
  }

  undo(): void {
    if (this.oldIndex < 0) return;
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const el = svgInstance.findOne(`#${this.elementId}`) as SvgJsElement | undefined;
    if (!el?.node) return;
    const node = el.node as Element;
    const parent = node.parentElement;
    if (!parent) return;
    const children = parent.children;
    if (this.oldIndex >= children.length) {
      parent.appendChild(node);
    } else {
      parent.insertBefore(node, children[this.oldIndex]);
    }
  }
}

export class ToggleVisibilityCommand implements EditorCommand {
  readonly description = 'Toggle visibility';

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly elementId: string
  ) {}

  execute(): void {
    this.svc.toggleLayerVisibility(this.elementId);
  }

  undo(): void {
    this.svc.toggleLayerVisibility(this.elementId);
  }
}

export class GroupCommand implements EditorCommand {
  readonly description = 'Group elements';
  private groupId: string | null = null;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly elementIds: string[]
  ) {}

  execute(): void {
    this.groupId = this.svc.groupSelectedElements(this.elementIds);
  }

  undo(): void {
    if (this.groupId) {
      this.svc.ungroupElement(this.groupId);
      this.groupId = null;
    }
  }
}

export class UngroupCommand implements EditorCommand {
  readonly description = 'Ungroup elements';
  private childIds: string[] = [];

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly groupId: string
  ) {}

  execute(): void {
    this.childIds = this.svc.ungroupElement(this.groupId);
  }

  undo(): void {
    if (this.childIds.length > 0) {
      this.svc.groupSelectedElements(this.childIds);
    }
  }
}

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
    private readonly svc: SvgManipulationService,
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
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    const node = shape?.node as SVGGraphicsElement | undefined;
    if (!node) return;

    if (this.before.fillAttr !== null) {
      node.setAttribute('fill', this.before.fillAttr);
    } else {
      node.removeAttribute('fill');
    }

    if (this.before.fillStyleValue) {
      node.style?.setProperty('fill', this.before.fillStyleValue);
    } else {
      node.style?.removeProperty('fill');
    }
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
    private readonly svc: SvgManipulationService,
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
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const shape = svgInstance.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
    const node = shape?.node as SVGGraphicsElement | undefined;
    if (!node) return;

    if (this.before.strokeAttr !== null) {
      node.setAttribute('stroke', this.before.strokeAttr);
    } else {
      node.removeAttribute('stroke');
    }

    if (this.before.strokeStyleValue) {
      node.style?.setProperty('stroke', this.before.strokeStyleValue);
    } else {
      node.style?.removeProperty('stroke');
    }

    if (this.before.strokeWidthAttr !== null) {
      node.setAttribute('stroke-width', this.before.strokeWidthAttr);
    } else {
      node.removeAttribute('stroke-width');
    }

    if (this.before.strokeWidthStyleValue) {
      node.style?.setProperty('stroke-width', this.before.strokeWidthStyleValue);
    } else {
      node.style?.removeProperty('stroke-width');
    }
  }
}

export class RemoveShapesCommand implements EditorCommand {
  readonly description = 'Remove shapes';

  private readonly serializedMarkup: Map<string, string>;
  private readonly insertionIndices: Map<string, number>;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeIds: string[],
    private readonly selectionSvc?: ShapeSelectionService
  ) {
    this.serializedMarkup = new Map();
    this.insertionIndices = new Map();

    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    const contentNode = contentGroup?.node as Element | undefined;

    for (const id of this.shapeIds) {
      const shape = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
      if (!shape?.node) continue;
      this.serializedMarkup.set(id, (shape.node as Element).outerHTML);
      if (contentNode) {
        const children = Array.from(contentNode.children);
        const idx = children.indexOf(shape.node as Element);
        if (idx >= 0) this.insertionIndices.set(id, idx);
      }
    }
  }

  execute(): void {
    this.svc.removeShapes(this.shapeIds);
    this.selectionSvc?.clearSelection();
  }

  undo(): void {
    const svgInstance = this.svc.getSVGInstance();
    if (!svgInstance) return;
    const contentGroup = svgInstance.findOne('[data-editor-content-group]');
    const contentNode = contentGroup?.node as Element | undefined;
    if (!contentNode) return;

    const sorted = [...this.shapeIds]
      .filter((id) => this.serializedMarkup.has(id))
      .sort((a, b) => (this.insertionIndices.get(a) ?? 0) - (this.insertionIndices.get(b) ?? 0));

    for (const id of sorted) {
      const markup = this.serializedMarkup.get(id);
      if (!markup) continue;
      const temp = document.createElement('div');
      temp.innerHTML = markup;
      const restored = temp.firstElementChild;
      if (!restored) continue;

      const idx = this.insertionIndices.get(id);
      const children = contentNode.children;
      if (idx !== undefined && idx < children.length) {
        contentNode.insertBefore(restored, children[idx]);
      } else {
        contentNode.appendChild(restored);
      }
    }

    if (this.selectionSvc) {
      const restoredProps = sorted
        .map((id) => {
          const el = svgInstance.findOne(`#${id}`) as SvgJsElement | undefined;
          return el ? this.svc.getShapeProperties(el) : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      if (restoredProps.length > 0) {
        this.selectionSvc.selectShapes(restoredProps);
      }
    }
  }
}

export class ArtboardSizeCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey = 'artboard-size';

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly oldWidth: number,
    private readonly oldHeight: number,
    private readonly newWidth: number,
    private readonly newHeight: number
  ) {
    this.description = `Resize artboard to ${newWidth}×${newHeight}`;
  }

  execute(): void {
    this.svc.setArtboardSize(this.newWidth, this.newHeight);
  }

  undo(): void {
    this.svc.setArtboardSize(this.oldWidth, this.oldHeight);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as ArtboardSizeCommand;
    return new ArtboardSizeCommand(this.svc, this.oldWidth, this.oldHeight, n.newWidth, n.newHeight);
  }
}

export class ArtboardBackgroundCommand implements CoalesceableCommand {
  readonly description: string;
  readonly coalesceKey = 'artboard-bg';

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change background to ${newColor}`;
  }

  execute(): void {
    this.svc.setBackgroundColor(this.newColor);
  }

  undo(): void {
    this.svc.setBackgroundColor(this.oldColor);
  }

  coalesceWith(newer: CoalesceableCommand): CoalesceableCommand {
    const n = newer as ArtboardBackgroundCommand;
    return new ArtboardBackgroundCommand(this.svc, this.oldColor, n.newColor);
  }
}

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
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly selectionSvc?: ShapeSelectionService
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
    if (this.selectionSvc) {
      const svgInstance = this.svc.getSVGInstance();
      const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
      if (el) {
        this.selectionSvc.selectShapes([this.svc.getShapeProperties(el)]);
      }
    }
  }

  undo(): void {
    this.svc.removeShape(this.shapeId);
    this.selectionSvc?.clearSelection();
  }
}

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
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly selectionSvc?: ShapeSelectionService
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
    if (this.selectionSvc) {
      const svgInstance = this.svc.getSVGInstance();
      const el = svgInstance?.findOne(`#${this.shapeId}`) as SvgJsElement | undefined;
      if (el) {
        this.selectionSvc.selectShapes([this.svc.getShapeProperties(el)]);
      }
    }
  }

  undo(): void {
    this.svc.removeShape(this.shapeId);
    this.selectionSvc?.clearSelection();
  }
}
