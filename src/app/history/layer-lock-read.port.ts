/** Read-only layer lock state for chrome panels (properties, path ops). */
export interface LayerLockReadPort {
  isElementOrAncestorLocked(elementId: string): boolean;
}
