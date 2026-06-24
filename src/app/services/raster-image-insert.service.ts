import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { DocumentReadinessPort } from '../history/document-readiness.port';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { SvgManipulationService } from './svg-manipulation.service';
import { ShapeSelectionService } from './shape-selection.service';
import { EditorHistoryService } from './editor-history.service';
import { EditorToolService } from './editor-tool.service';
import { AddImageCommand } from '../models/editor-commands';
import { computeRasterInsertLayout } from '../utils/raster-insert-layout';
import {
  isAllowedRasterMimeType,
  readFileAsDataUrl,
  readRasterIntrinsicDimensionsFromFile,
  validateRasterFileForInsert,
  validateRasterPixelBudget
} from '../utils/raster-insert-file';

/**
 * Shared insert path for toolbar (e4s.4) and canvas drag-drop (e4s.5).
 *
 * **Multi-file drops (e4s.5):** callers iterate `DataTransfer.files` in order. For each file,
 * non-allowlisted MIME is `skipped` when `silentDisallowedMime` is true (no alert). The first
 * decode/read/insert failure returns `failed` with a message (caller should `alert` and stop).
 * Each successful insert pushes its own `AddImageCommand` (one undo step per image).
 */
export type InsertRasterFileResult =
  | { kind: 'inserted' }
  | { kind: 'skipped' }
  | { kind: 'failed'; message: string };

export interface InsertRasterFileOptions {
  /** When true, disallowed MIME types yield `skipped` instead of `failed` (no user message). */
  silentDisallowedMime?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RasterImageInsertService {
  private readonly documentReadiness: DocumentReadinessPort = inject(SvgEditorDocumentService);
  private readonly svgManipulation = inject(SvgManipulationService);
  private readonly shapeSelection = inject(ShapeSelectionService);
  private readonly editorHistory = inject(EditorHistoryService);
  private readonly editorTool = inject(EditorToolService);

  async insertRasterFileAtAnchor(
    file: File,
    anchor: { x: number; y: number },
    options?: InsertRasterFileOptions
  ): Promise<InsertRasterFileResult> {
    const silentMime = options?.silentDisallowedMime === true;
    if (!isAllowedRasterMimeType(file.type)) {
      return silentMime ? { kind: 'skipped' } : { kind: 'failed', message: this.disallowedMimeMessage(file) };
    }

    const mimeCheck = validateRasterFileForInsert(file);
    if (!mimeCheck.ok) {
      return { kind: 'failed', message: mimeCheck.message };
    }

    if (this.documentReadiness.getSVGInstance() == null) {
      return { kind: 'failed', message: 'No SVG document loaded.' };
    }

    const dims = await readRasterIntrinsicDimensionsFromFile(file);
    if (!dims) {
      return { kind: 'failed', message: 'Could not read image dimensions.' };
    }
    const pxCheck = validateRasterPixelBudget(dims.width, dims.height);
    if (!pxCheck.ok) {
      return { kind: 'failed', message: pxCheck.message };
    }

    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      return { kind: 'failed', message: 'Could not read image file.' };
    }

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
      return { kind: 'failed', message: 'Could not insert image.' };
    }

    const svg = this.svgManipulation.getSVGInstance();
    const el = svg?.findOne(`#${id}`) as SvgJsElement | undefined;
    if (!el) {
      return { kind: 'failed', message: 'Could not insert image.' };
    }

    this.shapeSelection.selectShape(this.svgManipulation.getShapeProperties(el));
    const cmd = new AddImageCommand(this.svgManipulation, id, this.shapeSelection);
    this.editorHistory.pushAndExecute(cmd);
    this.editorTool.setTool('selector');
    return { kind: 'inserted' };
  }

  private disallowedMimeMessage(file: File): string {
    return `Unsupported image type: ${file.type || '(unknown)'}`;
  }
}
