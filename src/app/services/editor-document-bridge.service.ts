import { Injectable } from '@angular/core';
import { DEFAULT_DOCUMENT_SVG } from '../models/default-document';

export interface EditorDocumentBridgeHandlers {
  /** Force full document replace even when content equals current accepted content. */
  replaceDocument(svgContent: string): boolean;
}

/**
 * Bridges document lifecycle commands from the app shell to the canvas adapter.
 * {@link SvgCanvasComponent} registers handlers in its constructor and clears them on destroy.
 */
@Injectable({ providedIn: 'root' })
export class EditorDocumentBridgeService {
  private handlers: EditorDocumentBridgeHandlers | null = null;

  register(handlers: EditorDocumentBridgeHandlers | null): void {
    this.handlers = handlers;
  }

  replaceDocument(svgContent: string): boolean {
    return this.handlers?.replaceDocument(svgContent) ?? false;
  }

  resetDocument(): boolean {
    return this.replaceDocument(DEFAULT_DOCUMENT_SVG);
  }
}
