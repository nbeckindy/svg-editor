import { Injectable, inject } from '@angular/core';
import { BooleanPathCommand } from '../../models/editor-commands';
import { EditorToolService } from '../editor-tool.service';
import { PathBooleanGeometryService } from '../path-boolean-geometry.service';
import { ShapeSelectionService } from '../shape-selection.service';
import {
  sortPathIdsByDocumentOrder,
  sortCompoundOperandIdsByDocumentOrder,
  type BooleanOp
} from '../../models/path-boolean';
import { ChromeEditorApplySupport } from './chrome-editor-apply-support.service';
import { EDITOR_SHAPE_LIFECYCLE_SVG_PORT } from './chrome-apply.tokens';

const PATH_BOOLEAN_LABELS: Record<BooleanOp, string> = {
  union: 'Union paths',
  subtract: 'Subtract paths',
  intersect: 'Intersect paths'
};

@Injectable({ providedIn: 'root' })
export class ChromeEditorPathOpsApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly shapeLifecycleSvg = inject(EDITOR_SHAPE_LIFECYCLE_SVG_PORT);
  private readonly pathBooleanGeometry = inject(PathBooleanGeometryService);
  private readonly editorTool = inject(EditorToolService);
  private readonly shapeSelection = inject(ShapeSelectionService);

  private shapeIdsTouchLocked(ids: string[]) { return this.support.shapeIdsTouchLocked(ids); }
  private pushCommandsAndSyncSelection(cmds: Parameters<ChromeEditorApplySupport['pushCommandsAndSyncSelection']>[0], desc?: string) {
    return this.support.pushCommandsAndSyncSelection(cmds, desc);
  }

  applyPathBooleanUnion(pathIds: string[]): void {
    this.applyPathBoolean('union', pathIds);
  }

  applyPathBooleanSubtract(pathIds: string[]): void {
    this.applyPathBoolean('subtract', pathIds);
  }

  applyPathBooleanIntersect(pathIds: string[]): void {
    this.applyPathBoolean('intersect', pathIds);
  }

  applyPathBoolean(op: BooleanOp, pathIds: string[]): void {
    this.applyPathShapeOperation(
      pathIds,
      (port, usedIds, topmostInsertionIndex) =>
        this.pathBooleanGeometry.buildBooleanResult(op, pathIds, port, usedIds, topmostInsertionIndex),
      PATH_BOOLEAN_LABELS[op],
      'boolean'
    );
  }

  applyPathCompound(pathIds: string[]): void {
    this.applyPathShapeOperation(
      pathIds,
      (port, usedIds, topmostInsertionIndex) =>
        this.pathBooleanGeometry.buildCompoundPathResult(pathIds, port, usedIds, topmostInsertionIndex),
      'Make compound path',
      'compound'
    );
  }

  private applyPathShapeOperation(
    pathIds: string[],
    build: (
      port: NonNullable<ReturnType<PathBooleanGeometryService['createGeometryPort']>>,
      usedIds: Set<string>,
      topmostInsertionIndex: number
    ) => ReturnType<PathBooleanGeometryService['buildBooleanResult']>,
    description: string,
    mode: 'boolean' | 'compound'
  ): void {
    if (pathIds.length < 2) return;
    if (this.shapeIdsTouchLocked(pathIds)) return;
    if (this.editorTool.currentTool() !== 'selector') return;

    const svg = this.shapeLifecycleSvg.getSVGInstance();
    if (!svg) return;
    const contentGroup = svg.findOne('[data-editor-content-group]');
    if (!contentGroup?.node) return;

    const port = this.pathBooleanGeometry.createGeometryPort();
    if (!port) return;

    const sorted =
      mode === 'compound'
        ? sortCompoundOperandIdsByDocumentOrder(pathIds, port)
        : sortPathIdsByDocumentOrder(pathIds, port);
    const topmostId = sorted[sorted.length - 1];
    if (!topmostId) return;
    const topmostNode =
      mode === 'compound' ? port.getCompoundOperandElement(topmostId) : port.getPathElement(topmostId);
    if (!topmostNode) return;

    const children = Array.from((contentGroup.node as Element).children);
    const topmostInsertionIndex = children.indexOf(topmostNode);
    if (topmostInsertionIndex < 0) return;

    const usedIds = new Set<string>();
    contentGroup.find('*').forEach((el) => {
      const id = el.id();
      if (id) usedIds.add(id);
    });

    const built = build(port, usedIds, topmostInsertionIndex);
    if (!built) return;

    this.pushCommandsAndSyncSelection(
      [
        new BooleanPathCommand(
          this.shapeLifecycleSvg,
          built.operandIds,
          built.resultId,
          built.resultMarkup,
          built.topmostOperandIndex,
          description,
          this.shapeSelection
        )
      ],
      description
    );
  }
}
