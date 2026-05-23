/** One shape serialized for clipboard / paste / duplicate flows. */
export interface ClipboardShapeSnapshot {
  id: string;
  markup: string;
  insertionIndex?: number;
}

/** Clipboard payload carried by History commands and the clipboard service. */
export interface ClipboardPayload {
  shapes: ClipboardShapeSnapshot[];
}
