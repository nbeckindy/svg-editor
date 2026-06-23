import { Component, computed, effect, inject } from '@angular/core';
import { evaluatePathBooleanSelection, evaluatePathCompoundSelection, type BooleanOp } from '../../models/path-boolean';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { PathBooleanPreviewService } from '../../services/path-boolean-preview.service';
import { PathBooleanSelectionReadService } from '../../services/path-boolean-selection-read.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';

@Component({
  selector: 'app-boolean-path-panel',
  imports: [],
  templateUrl: './boolean-path-panel.component.html',
  styleUrl: './boolean-path-panel.component.css'
})
export class BooleanPathPanelComponent {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorTool = inject(EditorToolService);
  private readonly pathSelectionRead = inject(PathBooleanSelectionReadService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly preview = inject(PathBooleanPreviewService);

  readonly previewOp = this.preview.previewOp;

  readonly selectionState = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    return evaluatePathBooleanSelection(
      this.editorTool.currentTool() === 'selector',
      shapes,
      (id) => this.pathSelectionRead.isElementOrAncestorLocked(id),
      (id) => this.pathSelectionRead.getPathD(id)
    );
  });

  readonly compoundSelectionState = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    return evaluatePathCompoundSelection(
      this.editorTool.currentTool() === 'selector',
      shapes,
      (id) => this.pathSelectionRead.isElementOrAncestorLocked(id),
      (id) => this.pathSelectionRead.getCompoundOperandElement(id)
    );
  });

  readonly operandCount = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length >= 2) {
      return this.compoundSelectionState().operandIds.length;
    }
    return this.selectionState().operandIds.length;
  });

  readonly operandIdsForList = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    if (shapes.length >= 2) {
      return this.compoundSelectionState().operandIds;
    }
    return this.selectionState().operandIds;
  });

  readonly subtractTitle = computed(() =>
    this.selectionState().eligible
      ? 'Subtract shapes behind the frontmost path from the frontmost path'
      : this.selectionState().reason
  );

  readonly intersectTitle = computed(() =>
    this.selectionState().eligible
      ? 'Keep the overlapping region of all selected paths'
      : this.selectionState().reason
  );

  readonly compoundTitle = computed(() =>
    this.compoundSelectionState().eligible
      ? 'Combine selected paths and shapes into one compound path (keeps each outline as a subpath)'
      : this.compoundSelectionState().reason
  );

  constructor() {
    effect(() => {
      const op = this.preview.previewOp();
      if (!op) return;
      const state = this.selectionState();
      if (!state.eligible) {
        this.preview.clearPreview();
        return;
      }
      this.preview.setPreview(op, state.operandIds);
    });
  }

  onSelectOp(op: BooleanOp): void {
    const { eligible, operandIds } = this.selectionState();
    if (!eligible) return;
    this.preview.setPreview(op, operandIds);
  }

  onApplyPreview(): void {
    const op = this.preview.previewOp();
    const ids = [...this.preview.previewOperandIds()];
    if (!op || ids.length < 2) return;
    this.chromeApply.applyPathBoolean(op, ids);
    this.preview.clearPreview();
  }

  onCancelPreview(): void {
    this.preview.clearPreview();
  }

  onMakeCompound(): void {
    const { eligible, operandIds } = this.compoundSelectionState();
    if (!eligible) return;
    this.preview.clearPreview();
    this.chromeApply.applyPathCompound(operandIds);
  }
}
