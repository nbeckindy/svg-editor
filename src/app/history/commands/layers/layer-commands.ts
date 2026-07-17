import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { EditorCommand } from '../../../models/editor-command';
import { CompositeCommand } from '../../../models/editor-command';
import type { ElementParentSnapshot } from '../../../services/svg-layer-structure.port';
import type { ChangeElementIdSvgPort, LayerReorderGroupSvgPort } from '../../layers-panel-svg.port';
import type { SelectionSyncPort } from '../../history-selection.port';

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

export class ReorderCommand implements EditorCommand {
  readonly description: string;
  private oldIndex: number = -1;

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
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
    this.svc.restoreElementSiblingOrder(this.elementId, this.oldIndex);
  }
}

/**
 * Build one undoable command to move elements to the front or back of their respective parents.
 * Multi-select uses DOM sibling order per parent so relative stacking is preserved:
 * - `front`: ascending index (move deeper/back nodes in the selection first, then toward front).
 * - `back`: descending index (move front-most selected nodes first toward back).
 */
export function buildReorderToExtremeCommand(
  svc: LayerReorderGroupSvgPort,
  elementIds: string[],
  direction: 'front' | 'back'
): EditorCommand | null {
  const svgInstance = svc.getSVGInstance();
  if (!svgInstance || elementIds.length === 0) return null;

  const seen = new Set<string>();
  type Entry = { id: string; index: number };
  const byParent = new Map<Element, Entry[]>();

  for (const rawId of elementIds) {
    if (seen.has(rawId)) continue;
    seen.add(rawId);
    const el = svgInstance.findOne(`#${rawId}`) as SvgJsElement | undefined;
    if (!el?.node) continue;
    const node = el.node as Element;
    const parent = node.parentElement;
    if (!parent) continue;
    const index = Array.from(parent.children).indexOf(node);
    if (index < 0) continue;
    const list = byParent.get(parent) ?? [];
    list.push({ id: rawId, index });
    byParent.set(parent, list);
  }

  const commands: EditorCommand[] = [];
  for (const entries of byParent.values()) {
    entries.sort((a, b) =>
      direction === 'front' ? a.index - b.index : b.index - a.index
    );
    for (const e of entries) {
      commands.push(new ReorderCommand(svc, e.id, direction));
    }
  }

  if (commands.length === 0) return null;
  if (commands.length === 1) return commands[0];
  return new CompositeCommand(
    commands,
    direction === 'front' ? 'Bring to front' : 'Send to back'
  );
}

export class RenameElementCommand implements EditorCommand {
  readonly description = 'Rename layer';

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementId: string,
    private readonly oldDataName: string | null,
    private readonly newDataName: string | null
  ) {}

  execute(): void {
    this.svc.setElementDataName(this.elementId, this.newDataName);
  }

  undo(): void {
    this.svc.setElementDataName(this.elementId, this.oldDataName);
  }
}

export class ChangeElementIdCommand implements EditorCommand {
  readonly description = 'Change element id';

  constructor(
    private readonly svc: ChangeElementIdSvgPort,
    private readonly oldId: string,
    private readonly newId: string,
    private readonly selectionSync?: SelectionSyncPort
  ) {}

  execute(): void {
    this.svc.changeElementId(this.oldId, this.newId);
    this.resyncSelection(this.newId);
  }

  undo(): void {
    this.svc.changeElementId(this.newId, this.oldId);
    this.resyncSelection(this.oldId);
  }

  private resyncSelection(id: string): void {
    if (!this.selectionSync) return;
    const el = this.svc.getSVGInstance()?.findOne(`#${id}`) as SvgJsElement | undefined;
    if (!el) return;
    this.selectionSync.selectShapes([this.svc.getShapeProperties(el)]);
  }
}

export class ToggleVisibilityCommand implements EditorCommand {
  readonly description = 'Toggle visibility';

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementId: string
  ) {}

  execute(): void {
    this.svc.toggleLayerVisibility(this.elementId);
  }

  undo(): void {
    this.svc.toggleLayerVisibility(this.elementId);
  }
}

export class ToggleLayerLockCommand implements EditorCommand {
  readonly description = 'Toggle layer lock';
  private readonly lockedBefore: boolean;

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementId: string
  ) {
    this.lockedBefore = this.svc.isElementDirectLocked(elementId);
  }

  execute(): void {
    this.svc.setLayerLocked(this.elementId, !this.lockedBefore);
  }

  undo(): void {
    this.svc.setLayerLocked(this.elementId, this.lockedBefore);
  }
}

export class ReorderBeforeSiblingCommand implements EditorCommand {
  readonly description = 'Reorder layer (drag)';
  private oldIndex = -1;

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementId: string,
    private readonly referenceNextSiblingId: string | null
  ) {}

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
    this.svc.moveElementBeforeNextSibling(this.elementId, this.referenceNextSiblingId);
  }

  undo(): void {
    if (this.oldIndex < 0) return;
    this.svc.restoreElementSiblingOrder(this.elementId, this.oldIndex);
  }
}

export class GroupCommand implements EditorCommand {
  readonly description = 'Group elements';
  private groupId: string | null = null;

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementIds: string[]
  ) {}

  /** New wrapper `<g>` id after the last `execute()` (or `null` if grouping failed). */
  get createdGroupId(): string | null {
    return this.groupId;
  }

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
    private readonly svc: LayerReorderGroupSvgPort,
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

export class UngroupElementsCommand implements EditorCommand {
  readonly description = 'Ungroup elements';
  private undoSnapshots: string[][] = [];
  private allChildElementIds: string[] = [];

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly groupIds: string[]
  ) {}

  /** Direct child ids (flattened, DOM order) after the last `execute()`. */
  get ungroupedChildIds(): string[] {
    return this.allChildElementIds;
  }

  execute(): void {
    const r = this.svc.ungroupElements(this.groupIds);
    this.undoSnapshots = r.undoSnapshots;
    this.allChildElementIds = r.allChildElementIds;
  }

  undo(): void {
    for (let i = this.undoSnapshots.length - 1; i >= 0; i--) {
      const ids = this.undoSnapshots[i];
      if (ids.length > 0) {
        this.svc.groupSelectedElements(ids);
      }
    }
  }
}

export type ReparentElementsMode =
  | { kind: 'addToGroup'; targetGroupId: string; referenceNextSiblingId?: string | null }
  | { kind: 'removeFromGroup' }
  | {
      kind: 'reparentToParent';
      targetParentId: string | null;
      referenceNextSiblingId: string | null;
    };

export class ReparentElementsCommand implements EditorCommand {
  readonly description: string;
  private snapshots: ElementParentSnapshot[] = [];
  private movedIds: string[] = [];

  constructor(
    private readonly svc: LayerReorderGroupSvgPort,
    private readonly elementIds: string[],
    private readonly mode: ReparentElementsMode
  ) {
    this.description =
      mode.kind === 'removeFromGroup'
        ? 'Remove from group'
        : mode.kind === 'addToGroup'
          ? 'Add to group'
          : 'Reparent layers';
  }

  /** Element ids successfully reparented by the last `execute()`. */
  get reparentedElementIds(): string[] {
    return this.movedIds;
  }

  execute(): void {
    this.snapshots = this.svc.snapshotElementParentOrder(this.elementIds);
    switch (this.mode.kind) {
      case 'addToGroup':
        this.movedIds =
          this.svc.addElementsToGroup(
            this.elementIds,
            this.mode.targetGroupId,
            this.mode.referenceNextSiblingId ?? null
          ) ?? [];
        break;
      case 'removeFromGroup':
        this.movedIds = this.svc.removeElementsFromGroup(this.elementIds) ?? [];
        break;
      case 'reparentToParent':
        this.movedIds =
          this.svc.reparentElementsToParent(
            this.elementIds,
            this.mode.targetParentId,
            this.mode.referenceNextSiblingId
          ) ?? [];
        break;
    }
  }

  undo(): void {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      const s = this.snapshots[i];
      this.svc.restoreElementParentOrder(s.elementId, s.formerParentId, s.formerIndex);
    }
    this.movedIds = [];
  }
}
