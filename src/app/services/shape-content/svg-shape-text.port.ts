export interface SvgShapeTextPort {
  getTextContent(textId: string): string | null;
  updateTextContent(textId: string, text: string): void;
  updateTextFontFamily(textId: string, fontFamily: string): void;
  updateTextFontSize(textId: string, fontSize: number): void;
  updateTextFontWeight(textId: string, fontWeight: string): void;
  updateTextFontStyle(textId: string, fontStyle: string): void;
  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end'): void;
  updateTextPaintOrder(textId: string, paintOrder: string | undefined): void;
  updateTextVectorEffect(textId: string, effect: string | undefined): void;
}
