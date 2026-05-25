import { Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import { EditorToolService, EditorTool } from '../../services/editor-tool.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { RasterInsertAnchorStore } from '../../services/raster-insert-anchor.store';
import { AddImageCommand } from '../../models/editor-commands';
import { computeRasterInsertLayout, parseRootViewBox } from '../../utils/raster-insert-layout';
import {
  readFileAsDataUrl,
  readRasterIntrinsicDimensionsFromFile,
  validateRasterFileForInsert,
  validateRasterPixelBudget
} from '../../utils/raster-insert-file';

@Component({
  selector: 'app-tool-strip',
  standalone: true,
  imports: [],
  templateUrl: './tool-strip.component.html',
  styleUrl: './tool-strip.component.css'
})
export class ToolStripComponent {
  readonly editorTool = inject(EditorToolService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);
  private readonly rasterInsertAnchor = inject(RasterInsertAnchorStore);

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

    const mimeCheck = validateRasterFileForInsert(file);
    if (!mimeCheck.ok) {
      window.alert(mimeCheck.message);
      return;
    }

    const dims = await readRasterIntrinsicDimensionsFromFile(file);
    if (!dims) {
      window.alert('Could not read image dimensions.');
      return;
    }
    const pxCheck = validateRasterPixelBudget(dims.width, dims.height);
    if (!pxCheck.ok) {
      window.alert(pxCheck.message);
      return;
    }

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      window.alert('Could not read image file.');
      return;
    }

    const anchor = this.resolveInsertAnchor();
    const viewBoxStr = this.svgManipulation.getDocumentViewBox();
    const layout = computeRasterInsertLayout({
      viewBox: viewBoxStr,
      intrinsicWidthPx: dims.width,
      intrinsicHeightPx: dims.height,
      anchorX: anchor.x,
      anchorY: anchor.y
    });

    const id = this.svgManipulation.insertRasterImageIntoContentGroup({
      href: dataUrl,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height
    });
    if (!id) {
      window.alert('Could not insert image.');
      return;
    }

    const svg = this.svgManipulation.getSVGInstance();
    const el = svg?.findOne(`#${id}`) as SvgJsElement | undefined;
    if (!el) {
      window.alert('Could not insert image.');
      return;
    }
    this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    const cmd = new AddImageCommand(this.svgManipulation, id, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    this.editorTool.setTool('selector');
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
