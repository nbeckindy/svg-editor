import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShapeSelectionService } from '../../services/shape-selection.service';
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
  private svgManipulation = inject(SvgManipulationService);
  readonly isCollapsed = signal(true);

  readonly segments = computed(() => {
    this.svgManipulation.documentRevision();
    const raw = this.svgManipulation.exportSVG().trim();
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
