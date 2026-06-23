/** DOM reads for path boolean / compound eligibility and geometry ports. */
export interface PathBooleanSelectionReadPort {
  isElementOrAncestorLocked(elementId: string): boolean;
  getPathElement(pathId: string): Element | null;
  getPathD(shapeId: string): string | null;
  getCompoundOperandElement(shapeId: string): Element | null;
}
