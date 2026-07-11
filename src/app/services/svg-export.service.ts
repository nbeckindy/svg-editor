import { Injectable, inject } from '@angular/core';
import type { SvgExportReadPort } from '../history/document-readiness.port';
import type { ImageHrefExportClass, SvgExportImagePolicyResult } from '../utils/svg-export-image-href-policy';
import {
  aggregateImageHrefExportClasses,
  classifyImageHrefForExport,
  readImageElementHref
} from '../utils/svg-export-image-href-policy';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { EDITOR_CONTENT_GROUP_ID } from './svg-editor-stage.constants';

@Injectable({ providedIn: 'root' })
export class SvgExportService {
  private readonly doc: SvgExportReadPort = inject(SvgEditorDocumentService);

  exportSVG(): string {
    const svgInstance = this.doc.getSVGInstance();
    if (!svgInstance) return '';
    const contentGroup = svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    if (!contentGroup?.node) return svgInstance.svg();
    const xmlns = svgInstance.node.getAttribute('xmlns') || 'http://www.w3.org/2000/svg';
    const inner = (contentGroup.node as Element).innerHTML;
    const ab = this.doc.getArtboard();
    return `<svg xmlns="${xmlns}" width="${ab.width}" height="${ab.height}" viewBox="${this.doc.getDocumentViewBox()}" preserveAspectRatio="${this.doc.getDocumentPreserveAspectRatio()}">${inner}</svg>`;
  }

  /**
   * Scans content `<image>` href / xlink:href for export-time policy (ADR 0001, e4s.7).
   * Does not mutate the document.
   */
  getSvgExportImagePolicyResult(): SvgExportImagePolicyResult {
    const ok: SvgExportImagePolicyResult = {
      blocked: false,
      blockedReason: null,
      hasOversizedDataUrl: false,
      oversizedDataHrefCount: 0,
      oversizedConfirmMessage: null
    };
    const svgInstance = this.doc.getSVGInstance();
    if (!svgInstance) return ok;
    const contentGroup = svgInstance.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`);
    const root = contentGroup?.node as Element | undefined;
    if (!root) return ok;

    const classes: ImageHrefExportClass[] = [];
    root.querySelectorAll('image').forEach((img) => {
      const href = readImageElementHref(img);
      classes.push(classifyImageHrefForExport(href));
    });
    const agg = aggregateImageHrefExportClasses(classes);
    if (agg.blockedByBlob) {
      return {
        blocked: true,
        blockedReason:
          'This document contains an <image> with a blob: URL. Blob URLs are not portable and cannot be saved in an SVG file. Remove or replace those images (for example re-insert via Insert image) before exporting.',
        hasOversizedDataUrl: false,
        oversizedDataHrefCount: 0,
        oversizedConfirmMessage: null
      };
    }
    if (agg.oversizedDataHrefCount > 0) {
      const n = agg.oversizedDataHrefCount;
      return {
        blocked: false,
        blockedReason: null,
        hasOversizedDataUrl: true,
        oversizedDataHrefCount: n,
        oversizedConfirmMessage: `This document contains ${n} embedded image${n === 1 ? '' : 's'} with very large data URLs (over the ~16 MiB embedded-size guideline). The export may be large or slow to open. Continue with download?`
      };
    }
    return ok;
  }
}
