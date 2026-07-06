import { Injectable } from '@angular/core';
import { type LiveTreeMarkup, sanitizeSvgMarkup } from '../utils/svg-sanitize';

/** Returns true when removed attributes include any href-type blocked by the ingest policy. */
function hasBlockedHrefs(removedAttributes: string[]): boolean {
  return removedAttributes.some(
    (a) => a === 'href' || a === 'xlink:href' || a === 'svg:href'
  );
}

/**
 * Single entry point for all external SVG markup arriving at the editor.
 * Wraps `sanitizeSvgMarkup` with unified user feedback (ADR 0002).
 */
@Injectable({ providedIn: 'root' })
export class SvgIngestService {
  /** Sanitize a full SVG document string. Returns LiveTreeMarkup safe for the Live tree. */
  ingestDocument(raw: string): LiveTreeMarkup {
    return this.ingest(raw, 'document');
  }

  /** Sanitize an SVG fragment (shape markup). Returns LiveTreeMarkup safe for the Live tree. */
  ingestFragment(raw: string): LiveTreeMarkup {
    return this.ingest(raw, 'fragment');
  }

  private ingest(raw: string, kind: 'document' | 'fragment'): LiveTreeMarkup {
    const result = sanitizeSvgMarkup(raw);

    if (ngDevMode && (result.removedElements.length > 0 || result.removedAttributes.length > 0)) {
      console.warn(
        `SVG sanitizer stripped content from ingested ${kind}:`,
        { removedElements: result.removedElements, removedAttributes: result.removedAttributes }
      );
    }

    if (hasBlockedHrefs(result.removedAttributes)) {
      const count = result.removedAttributes.filter(
        (a) => a === 'href' || a === 'xlink:href' || a === 'svg:href'
      ).length;
      window.alert(
        `${count} image or link(s) were removed because they used an insecure or unsupported URL (http:, javascript:, blob:, or external reference).`
      );
    }

    return result.sanitized;
  }
}
