/** DOM reads for path boolean / compound eligibility in the path-ops panel. */
export interface PathBooleanSelectionReadPort {
  isElementOrAncestorLocked(elementId: string): boolean;
  getPathD(shapeId: string): string | null;
  getCompoundOperandElement(shapeId: string): Element | null;
}
