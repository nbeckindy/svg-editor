/**
 * Export-time policy for `<image>` `href` / `xlink:href` (ADR 0001, e4s.7).
 * Pure helpers — no DOM beyond reading attributes from a given element.
 */

/** 16 MiB binary cap from ADR, expanded as base64 in a `data:` URL (~4/3) plus metadata prefix slack. */
export const MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM = Math.ceil((16 * 1024 * 1024 * 4) / 3) + 512;

export type ImageHrefExportClass = 'empty' | 'blob' | 'data_oversized' | 'data_ok' | 'other';

/**
 * Classifies one `href` string for export UX: `blob:` blocks; oversized `data:` needs confirm.
 */
export function classifyImageHrefForExport(href: string | null | undefined): ImageHrefExportClass {
  if (href == null || href.trim() === '') return 'empty';
  const h = href.trim();
  if (/^blob:/i.test(h)) return 'blob';
  if (/^data:/i.test(h)) {
    return h.length > MAX_DATA_IMAGE_HREF_CHARS_WITHOUT_CONFIRM ? 'data_oversized' : 'data_ok';
  }
  return 'other';
}

export function readImageElementHref(el: Element): string | null {
  const direct =
    el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/2000/svg', 'href') ?? null;
  if (direct != null && direct.trim() !== '') return direct;
  const xlink = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
  return xlink != null && xlink.trim() !== '' ? xlink : null;
}

export interface ImageHrefExportAggregate {
  blockedByBlob: boolean;
  oversizedDataHrefCount: number;
}

export function aggregateImageHrefExportClasses(classes: Iterable<ImageHrefExportClass>): ImageHrefExportAggregate {
  let blockedByBlob = false;
  let oversizedDataHrefCount = 0;
  for (const c of classes) {
    if (c === 'blob') blockedByBlob = true;
    if (c === 'data_oversized') oversizedDataHrefCount++;
  }
  return { blockedByBlob, oversizedDataHrefCount };
}

/** Result of scanning the live document for `<image>` hrefs before download/export (e4s.7). */
export interface SvgExportImagePolicyResult {
  blocked: boolean;
  blockedReason: string | null;
  hasOversizedDataUrl: boolean;
  oversizedDataHrefCount: number;
  oversizedConfirmMessage: string | null;
}
