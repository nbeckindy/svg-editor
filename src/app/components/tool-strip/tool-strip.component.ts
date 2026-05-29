import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { RasterInsertAnchorStore } from '../../services/raster-insert-anchor.store';
import { RasterImageInsertService } from '../../services/raster-image-insert.service';
import { parseRootViewBox } from '../../utils/raster-insert-layout';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './tool-strip.component.html',
  styleUrl: './tool-strip.component.css'
})
export class ToolStripComponent {
  readonly editorTool = inject(EditorToolService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly rasterInsertAnchor = inject(RasterInsertAnchorStore);
  private readonly rasterImageInsert = inject(RasterImageInsertService);

  private readonly imageFileInput = viewChild<ElementRef<HTMLInputElement>>('imageFileInput');

  /** Reactive: canvas may attach the SVG instance after first paint (see documentRevision). */
  readonly insertImageDisabled = computed(() => {
    this.svgManipulation.documentRevision();
    return this.svgManipulation.getSVGInstance() == null;
  });

  setTool(tool: EditorTool): void {
    this.editorTool.setTool(tool);
  }

  openInsertImagePicker(): void {
    if (this.insertImageDisabled()) return;
    this.imageFileInput()?.nativeElement.click();
  }

  async onRasterImageFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const anchor = this.resolveInsertAnchor();
    const result = await this.rasterImageInsert.insertRasterFileAtAnchor(file, anchor);
    if (result.kind === 'failed') {
      window.alert(result.message);
    }
  }

  private resolveInsertAnchor(): { x: number; y: number } {
    const last = this.rasterInsertAnchor.lastDocPoint();
    if (last) {
      return { x: last.x, y: last.y };
    }
    const vb = parseRootViewBox(this.svgManipulation.getDocumentViewBox());
    if (vb) {
      return { x: vb.minX + vb.width / 2, y: vb.minY + vb.height / 2 };
    }
    return { x: 0, y: 0 };
  }
}
