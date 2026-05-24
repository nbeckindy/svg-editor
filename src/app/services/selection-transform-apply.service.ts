import { Injectable, inject } from '@angular/core';
import type { SelectionTransformApplySvgPort } from '../history/transform-gesture-svg.port';
import { EditorToolService } from './editor-tool.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { SelectionPaintApplyService } from './selection-paint-apply.service';
import { SelectionTransformReadoutService } from './selection-transform-readout.service';
import { TranslateCommand, UnionScaleCommand, UnionRotateCommand } from '../models/editor-commands';
import { MIN_UNION_SIZE } from '../utils/selection-resize';
import { unionRotationPivot } from '../utils/selection-rotate';
import {
  ROTATION_MIXED_EPS_DEG,
  isFinitePositiveDim,
  normDeg0To360,
  shortestSignedDeltaDeg
} from '../utils/selection-transform-matrix';

/**
 * Applies union-bbox numeric edits from **Chrome** (properties panel): translate X/Y,
 * edge-anchored scale W/H, rigid rotation R — same semantics as canvas union transforms.
 */
@Injectable({
  providedIn: 'root'
})
export class SelectionTransformApplyService {
  private readonly svg: SelectionTransformApplySvgPort = inject(SvgManipulationService);
  private readonly editorTool = inject(EditorToolService);
  private readonly transformReadout = inject(SelectionTransformReadoutService);
  private readonly selectionPaintApply = inject(SelectionPaintApplyService);

  /**
   * Commit a numeric bbox / rotation edit from an input `change` event.
   * Rapid commits coalesce via transform command `CoalesceableCommand` + history window.
   */
  onBBoxFieldCommit(field: 'x' | 'y' | 'w' | 'h' | 'r', event: Event): void {
    if (this.editorTool.currentTool() !== 'selector') return;
    const target = event.target as HTMLInputElement;
    const raw = target.value.trim();
    if (raw === '') return;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;

    const model = this.transformReadout.selectionBBoxFieldModel();
    if (!model || !model.ok) return;
    const { ids, union: unionBefore } = model;
    const epsPos = 1e-6;

    if (field === 'x') {
      const dx = parsed - unionBefore.x;
      if (Math.abs(dx) < epsPos) return;
      const snap = this.svg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.svg, id, dx, 0, snap));
      this.selectionPaintApply.executeEditorCommands(cmds, `Set selection X to ${parsed}`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }

    if (field === 'y') {
      const dy = parsed - unionBefore.y;
      if (Math.abs(dy) < epsPos) return;
      const snap = this.svg.snapshotSelectionTransforms(ids);
      const cmds = ids.map((id) => new TranslateCommand(this.svg, id, 0, dy, snap));
      this.selectionPaintApply.executeEditorCommands(cmds, `Set selection Y to ${parsed}`);
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }

    if (field === 'w') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.width) < epsPos) return;
      const unionAfter = { ...unionBefore, width: parsed };
      const snap = this.svg.snapshotSelectionTransforms(ids);
      const ve = this.svg.snapshotVectorEffectsForShapes(ids);
      this.selectionPaintApply.executeEditorCommands(
        [new UnionScaleCommand(this.svg, ids, unionBefore, unionAfter, snap, 'e', ve)],
        `Set selection width to ${parsed}`
      );
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }

    if (field === 'h') {
      if (!isFinitePositiveDim(parsed) || parsed < MIN_UNION_SIZE) return;
      if (Math.abs(parsed - unionBefore.height) < epsPos) return;
      const unionAfter = { ...unionBefore, height: parsed };
      const snap = this.svg.snapshotSelectionTransforms(ids);
      const ve = this.svg.snapshotVectorEffectsForShapes(ids);
      this.selectionPaintApply.executeEditorCommands(
        [new UnionScaleCommand(this.svg, ids, unionBefore, unionAfter, snap, 's', ve)],
        `Set selection height to ${parsed}`
      );
      this.selectionPaintApply.syncSelectedShapesFromDom();
      return;
    }

    if (field === 'r') {
      if (model.rMixed || model.rDeg == null || !Number.isFinite(model.rDeg)) return;
      const rTarget = normDeg0To360(parsed);
      if (!Number.isFinite(rTarget)) return;
      const delta = shortestSignedDeltaDeg(model.rDeg, rTarget);
      if (Math.abs(delta) < ROTATION_MIXED_EPS_DEG) return;
      const pivot =
        this.svg.getSelectionRotationPivot(ids) ?? unionRotationPivot(unionBefore);
      const snap = this.svg.snapshotSelectionTransforms(ids);
      this.selectionPaintApply.executeEditorCommands(
        [new UnionRotateCommand(this.svg, ids, pivot, delta, snap)],
        `Rotate selection toward ${rTarget}°`
      );
      this.selectionPaintApply.syncSelectedShapesFromDom();
    }
  }
}
