import { Component, computed, inject } from '@angular/core';
import { evaluatePathBooleanSelection } from '../../models/path-boolean';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';

@Component({
  selector: 'app-boolean-path-panel',
  imports: [],
  templateUrl: './boolean-path-panel.component.html',
  styleUrl: './boolean-path-panel.component.css'
})
export class BooleanPathPanelComponent {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorTool = inject(EditorToolService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly chromeApply = inject(ChromeEditorApplyService);

  readonly selectionState = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    return evaluatePathBooleanSelection(
      this.editorTool.currentTool() === 'selector',
      shapes,
      (id) => this.svgManipulation.isElementOrAncestorLocked(id),
      (id) => {
        const svg = this.svgManipulation.getSVGInstance();
        const el = svg?.findOne(`#${id}`)?.node as Element | undefined;
        return el?.getAttribute('d') ?? null;
      }
    );
  });

  readonly operandCount = computed(() => this.selectionState().operandIds.length);

  onUnion(): void {
    const { eligible, operandIds } = this.selectionState();
    if (!eligible) return;
    this.chromeApply.applyPathBooleanUnion(operandIds);
  }
}
