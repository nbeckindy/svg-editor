import type { ClipboardPayload } from '../../models/clipboard-payload';

/** Clipboard snapshot seam for copy/paste commands. */
export interface SvgClipboardPort {
  createClipboardPayload(shapeIds: string[]): ClipboardPayload;
  pasteClipboardPayload(
    payload: ClipboardPayload,
    offset: { dx: number; dy: number }
  ): { insertedIds: string[]; insertedMarkup: string[] };
}
