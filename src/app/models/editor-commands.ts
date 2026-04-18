import { Matrix, Element as SvgJsElement } from '@svgdotjs/svg.js';
import { SvgManipulationService } from '../services/svg-manipulation.service';
import { type ResizeCorner } from '../utils/selection-resize';

export interface EditorCommand {
  readonly description: string;
  execute(): void;
  undo(): void;
}

export class CompositeCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly commands: EditorCommand[],
    description?: string
  ) {
    this.description = description ?? commands[0]?.description ?? 'Batch edit';
  }

  execute(): void {
    for (const cmd of this.commands) cmd.execute();
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}

export class FillColorCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change fill to ${newColor}`;
  }

  execute(): void {
    this.svc.updateFillColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.svc.updateFillColor(this.shapeId, this.oldColor);
  }
}

export class StrokeColorCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldColor: string,
    private readonly newColor: string
  ) {
    this.description = `Change stroke to ${newColor}`;
  }

  execute(): void {
    this.svc.updateStrokeColor(this.shapeId, this.newColor);
  }

  undo(): void {
    this.svc.updateStrokeColor(this.shapeId, this.oldColor);
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

export class SetStrokeCommand implements EditorCommand {
  readonly description: string;

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
}

export class OpacityCommand implements EditorCommand {
  readonly description: string;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeId: string,
    private readonly oldOpacity: number,
    private readonly newOpacity: number
  ) {
    this.description = `Change opacity to ${newOpacity}`;
  }

  execute(): void {
    this.svc.updateOpacity(this.shapeId, this.newOpacity);
  }

  undo(): void {
    this.svc.updateOpacity(this.shapeId, this.oldOpacity);
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

export class RemoveShapesCommand implements EditorCommand {
  readonly description = 'Remove shapes';

  private readonly serializedMarkup: Map<string, string>;
  private readonly insertionIndices: Map<string, number>;

  constructor(
    private readonly svc: SvgManipulationService,
    private readonly shapeIds: string[]
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
  }
}
