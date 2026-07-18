import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import {
  TranslateCommand,
  UnionScaleCommand,
  UnionRotateCommand,
  TextUniformScaleCommand,
  AlignCommand,
  DistributeCommand,
  RectCornerRadiusCommand,
  ChangeElementIdCommand
} from '../../models/editor-commands';
import { SelectionTransformReadoutService } from '../selection-transform-readout.service';
import { MIN_UNION_SIZE } from '../../utils/selection-resize';
import { unionRotationPivot } from '../../utils/selection-rotate';
import {
  ROTATION_MIXED_EPS_DEG,
  isFinitePositiveDim,
  normDeg0To360,
  shortestSignedDeltaDeg
} from '../../utils/selection-transform-matrix';
import {
  isTextOnlyShapeList,
  proportionalUnionAfterAxisEdit
} from '../../utils/text-uniform-scale';
import { ChromeEditorApplySupport } from './chrome-editor-apply-support.service';
import {
  PROPERTIES_PANEL_SVG_PORT,
  SELECTION_TRANSFORM_APPLY_SVG_PORT
} from './chrome-apply.tokens';

@Injectable({ providedIn: 'root' })
export class ChromeEditorTransformApplyService {
  private readonly support = inject(ChromeEditorApplySupport);
  private readonly propertiesSvg = inject(PROPERTIES_PANEL_SVG_PORT);
  private readonly transformSvg = inject(SELECTION_TRANSFORM_APPLY_SVG_PORT);
  private readonly transformReadout = inject(SelectionTransformReadoutService);

  private get shapeSelection() { return this.support.shapeSelection; }
  private get editorHistory() { return this.support.editorHistory; }
  private selectedShapesList() { return this.support.selectedShapesList(); }
  private shapeIdsTouchLocked(ids: string[]) { return this.support.shapeIdsTouchLocked(ids); }
  private shouldBlockShapeOnlyMutations() { return this.support.shouldBlockShapeOnlyMutations(); }
  private pushCommandsAndSyncSelection(cmds: Parameters<ChromeEditorApplySupport['pushCommandsAndSyncSelection']>[0], desc?: string) {
    return this.support.pushCommandsAndSyncSelection(cmds, desc);
  }

  applyAlignFromChrome(
    direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
    shapeIds: string[]
  ): void {
    if (shapeIds.length < 2) return;
    if (this.shapeIdsTouchLocked(shapeIds)) return;
    this.pushCommandsAndSyncSelection(
      [new AlignCommand(this.propertiesSvg, shapeIds, direction)],
      undefined
    );
  }

  applyDistributeFromChrome(direction: 'horizontal' | 'vertical', shapeIds: string[]): void {
    if (shapeIds.length < 3) return;
    if (this.shapeIdsTouchLocked(shapeIds)) return;
    this.pushCommandsAndSyncSelection(
      [new DistributeCommand(this.propertiesSvg, shapeIds, direction)],
      undefined
    );
  }

  /** Properties panel: nearest `<g>` ancestor for inherited paint / "select parent". */
  getNearestGroupAncestorId(shapeId: string): string | null {
    return this.propertiesSvg.getNearestGroupAncestorId(shapeId);
  }

  /** Properties panel: select parent `<g>` when exactly one shape is selected. */
  selectParentGroupForSingleSelection(): void {
    const list = this.selectedShapesList();
    if (list.length !== 1) return;
    const shape = list[0]!;
    const parentId = this.propertiesSvg.getNearestGroupAncestorId(shape.id);
    if (!parentId) return;
    const svg = this.propertiesSvg.getSVGInstance();
    const el = svg?.findOne(`#${parentId}`) as SvgJsElement | undefined;
    if (!el) return;
    this.shapeSelection.selectShape(this.propertiesSvg.getShapeProperties(el));
  }

  /** Properties panel: clear **Selection** and editor chrome highlight (e.g. dash preview). */
  clearInspectorSelection(): void {
    this.shapeSelection.clearSelection();
    this.propertiesSvg.clearHighlight();
  }

  /** Properties panel: change the selected element's SVG `id` (single selection only). */
  applyShapeIdFromChrome(rawId: string): void {
    const shapes = this.selectedShapesList();
    if (shapes.length !== 1) return;
    if (this.shouldBlockShapeOnlyMutations()) return;
    const oldId = shapes[0]!.id;
    const newId = rawId.trim();
    if (!newId || newId === oldId) return;
    if (!/^[A-Za-z_][\w.\-:]*$/.test(newId)) return;
    if (this.shapeIdsTouchLocked([oldId])) return;

    this.editorHistory.pushAndExecute(
      new ChangeElementIdCommand(this.propertiesSvg, oldId, newId, this.shapeSelection)
    );
  }

  onSelectionBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    const target = event.target as HTMLInputElement;
    const raw = target.value.trim();
    if (raw === '') return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;

    const model = this.transformReadout.selectionBBoxFieldModel();
    if (!model || !model.ok) return;
    const { ids, union: unionBefore } = model;
    if (this.shapeIdsTouchLocked(ids)) return;
    const epsPos = 1e-6;

    if (field === 'x') {
      const dx = parsed - unionBefore.x;
      if (Math.abs(dx) < epsPos) return;
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.transformSvg, id, dx, 0, snap));
      this.pushCommandsAndSyncSelection(cmds, `Set selection X to ${parsed}`);
      return;
    }

    if (field === 'y') {
      const dy = parsed - unionBefore.y;
      if (Math.abs(dy) < epsPos) return;
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.transformSvg, id, 0, dy, snap));
      this.pushCommandsAndSyncSelection(cmds, `Set selection Y to ${parsed}`);
      return;
    }

    if (field === 'w') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.width) < epsPos) return;
      if (isTextOnlyShapeList(this.selectedShapesList())) {
        const unionAfter = proportionalUnionAfterAxisEdit(unionBefore, 'w', parsed);
        const attrSnap = this.transformSvg.snapshotTextScaleAttrs(ids);
        this.pushCommandsAndSyncSelection(
          [
            new TextUniformScaleCommand(
              this.transformSvg,
              ids,
              unionBefore,
              unionAfter,
              attrSnap,
              'e'
            )
          ],
          `Set selection width to ${parsed}`
        );
        return;
      }
      const unionAfter = { ...unionBefore, width: parsed };
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const ve = this.transformSvg.snapshotVectorEffectsForShapes(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionScaleCommand(this.transformSvg, ids, unionBefore, unionAfter, snap, 'e', ve)],
        `Set selection width to ${parsed}`
      );
      return;
    }

    if (field === 'h') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.height) < epsPos) return;
      if (isTextOnlyShapeList(this.selectedShapesList())) {
        const unionAfter = proportionalUnionAfterAxisEdit(unionBefore, 'h', parsed);
        const attrSnap = this.transformSvg.snapshotTextScaleAttrs(ids);
        this.pushCommandsAndSyncSelection(
          [
            new TextUniformScaleCommand(
              this.transformSvg,
              ids,
              unionBefore,
              unionAfter,
              attrSnap,
              's'
            )
          ],
          `Set selection height to ${parsed}`
        );
        return;
      }
      const unionAfter = { ...unionBefore, height: parsed };
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      const ve = this.transformSvg.snapshotVectorEffectsForShapes(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionScaleCommand(this.transformSvg, ids, unionBefore, unionAfter, snap, 's', ve)],
        `Set selection height to ${parsed}`
      );
      return;
    }

    if (field === 'r') {
      if (model.rMixed || model.rDeg == null || !Number.isFinite(model.rDeg)) return;
      const rTarget = normDeg0To360(parsed);
      if (!Number.isFinite(rTarget)) return;
      const delta = shortestSignedDeltaDeg(model.rDeg, rTarget);
      if (Math.abs(delta) < ROTATION_MIXED_EPS_DEG) return;
      const pivot =
        this.transformSvg.getSelectionRotationPivot(ids) ?? unionRotationPivot(unionBefore);
      const snap = this.transformSvg.snapshotSelectionTransforms(ids);
      this.pushCommandsAndSyncSelection(
        [new UnionRotateCommand(this.transformSvg, ids, pivot, delta, snap)],
        `Rotate selection toward ${rTarget}°`
      );
    }
  }

  applyRectCornerRadiusFromChrome(radius: number): void {
    if (this.shouldBlockShapeOnlyMutations()) return;
    if (!Number.isFinite(radius) || radius < 0) return;
    const rects = this.selectedShapesList().filter((s) => s.type === 'rect');
    if (rects.length === 0) return;
    const commands = rects.map(
      (s) => new RectCornerRadiusCommand(this.propertiesSvg, s.id, s.rx ?? 0, s.ry ?? 0, radius)
    );
    this.pushCommandsAndSyncSelection(
      commands,
      radius > 0 ? `Set corner radius to ${radius}` : 'Remove corner radius'
    );
  }
}
