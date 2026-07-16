import { Component, computed, inject } from '@angular/core';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { LAYER_LOCK_READ_PORT } from '../../services/manipulation-port-tokens';
import { ShapeSelectionService } from '../../services/shape-selection.service';

@Component({
  selector: 'app-align-distribute-panel',
  templateUrl: './align-distribute-panel.component.html',
  styleUrl: './align-distribute-panel.component.css'
})
export class AlignDistributePanelComponent {
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorTool = inject(EditorToolService);
  private readonly chromeApply = inject(ChromeEditorApplyService);
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);

  readonly alignShortcutLabels = {
    left: 'Ctrl/Cmd+Shift+Left',
    center: 'Ctrl/Cmd+Shift+Down',
    right: 'Ctrl/Cmd+Shift+Right',
    top: 'Ctrl/Cmd+Shift+Up',
    middle: 'Ctrl/Cmd+Shift+M',
    bottom: 'Ctrl/Cmd+Shift+B',
    distributeHorizontal: 'Ctrl/Cmd+Shift+H',
    distributeVertical: 'Ctrl/Cmd+Shift+V'
  } as const;

  readonly selectionCount = this.shapeSelection.selectionCount;
  readonly isSelectorMode = computed(() => this.editorTool.currentTool() === 'selector');
  readonly hasSelection = computed(() => this.selectionCount() > 0);

  readonly anySelectedShapeLocked = computed(() => {
    const shapes = this.shapeSelection.getSelectedShapes();
    return shapes.some((s) => this.layerLock.isElementOrAncestorLocked(s.id));
  });

  readonly canAlignSelection = computed(() => this.selectionCount() >= 2);
  readonly canDistributeSelection = computed(() => this.selectionCount() >= 3);

  onAlign(direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void {
    const ids = this.shapeSelection.getSelectedShapes().map((shape) => shape.id);
    this.chromeApply.applyAlignFromChrome(direction, ids);
  }

  onDistribute(direction: 'horizontal' | 'vertical'): void {
    const ids = this.shapeSelection.getSelectedShapes().map((shape) => shape.id);
    this.chromeApply.applyDistributeFromChrome(direction, ids);
  }
}
