import type { EditorCommand } from '../../../models/editor-command';
import type {
  ClipPathSvgPort,
  MakeClipPathUndoSnapshot,
  ReleaseClipPathUndoSnapshot
} from '../../clip-path-svg.port';

export class MakeClipPathCommand implements EditorCommand {
  readonly description = 'Make clipping mask';

  private carrierGroupId: string | null = null;
  private clipPathDefId: string | null = null;
  private clipGeometryId: string | null = null;
  private undoSnapshot: MakeClipPathUndoSnapshot | null = null;

  constructor(
    private readonly svc: ClipPathSvgPort,
    private readonly contentIds: string[],
    private readonly clipShapeId: string
  ) {}

  get createdCarrierGroupId(): string | null {
    return this.carrierGroupId;
  }

  get clippedContentIds(): string[] {
    return this.contentIds;
  }

  get createdClipGeometryId(): string | null {
    return this.clipGeometryId;
  }

  execute(): void {
    const result = this.svc.makeClipPathFromSelection(this.contentIds, this.clipShapeId);
    if (!result) return;
    this.carrierGroupId = result.carrierGroupId;
    this.clipPathDefId = result.clipPathDefId;
    this.clipGeometryId = result.clipGeometryId;
    this.undoSnapshot = result.undo;
  }

  undo(): void {
    if (!this.undoSnapshot || !this.carrierGroupId || !this.clipPathDefId) return;
    this.svc.undoMakeClipPath(this.undoSnapshot, this.carrierGroupId, this.clipPathDefId);
    this.carrierGroupId = null;
    this.clipPathDefId = null;
    this.clipGeometryId = null;
    this.undoSnapshot = null;
  }
}

export class ReleaseClipPathCommand implements EditorCommand {
  readonly description = 'Release clipping mask';

  private undoSnapshot: ReleaseClipPathUndoSnapshot | null = null;
  private freedChildIds: string[] = [];

  constructor(
    private readonly svc: ClipPathSvgPort,
    private readonly shapeIds: string[]
  ) {}

  get releasedChildIds(): string[] {
    return this.freedChildIds;
  }

  get restoredClipShapeId(): string | null {
    return this.restoredClipShapeIdValue;
  }

  private restoredClipShapeIdValue: string | null = null;

  execute(): void {
    const result = this.svc.releaseClipPathForSelection(this.shapeIds);
    if (!result) return;
    this.undoSnapshot = result.undo;
    this.freedChildIds = result.freedChildIds;
    this.restoredClipShapeIdValue = result.restoredClipShapeId;
  }

  undo(): void {
    if (!this.undoSnapshot) return;
    this.svc.undoReleaseClipPath(this.undoSnapshot);
    this.undoSnapshot = null;
    this.freedChildIds = [];
    this.restoredClipShapeIdValue = null;
  }
}
