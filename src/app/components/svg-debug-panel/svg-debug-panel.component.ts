import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import type { SvgDebugPanelSvgPort } from '../../history/editor-chrome-svg.port';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { formatSvgXmlWithHighlightSegments } from '../../utils/svg-debug-xml';

@Component({
  selector: 'app-svg-debug-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './svg-debug-panel.component.html',
  styleUrl: './svg-debug-panel.component.css'
})
export class SvgDebugPanelComponent {
  private shapeSelection = inject(ShapeSelectionService);
  private readonly svg: SvgDebugPanelSvgPort = inject(SvgManipulationService);
  readonly isCollapsed = signal(true);

  readonly segments = computed(() => {
    this.svg.documentRevision();
    const raw = this.svg.exportSVG().trim();
    if (!raw) {
      return null;
    }
    const ids = this.shapeSelection.selectedShapes().map((s) => s.id);
    return formatSvgXmlWithHighlightSegments(raw, ids);
  });

  toggleCollapsed(): void {
    this.isCollapsed.update((value) => !value);
  }
}
