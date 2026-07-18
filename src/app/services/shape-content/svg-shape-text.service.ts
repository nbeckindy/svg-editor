import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import type { SvgShapeTextPort } from './svg-shape-text.port';
import { SvgEditorDocumentService } from '../svg-editor-document.service';

@Injectable({ providedIn: 'root' })
export class SvgShapeTextService implements SvgShapeTextPort {
  private readonly doc = inject(SvgEditorDocumentService);

  readShapeTextFields(
    element: SvgJsElement,
    node: Element
  ): Pick<
    ShapeProperties,
    | 'textContent'
    | 'fontFamily'
    | 'fontSize'
    | 'fontWeight'
    | 'fontStyle'
    | 'textAnchor'
    | 'dominantBaseline'
    | 'letterSpacing'
    | 'wordSpacing'
    | 'paintOrder'
    | 'vectorEffect'
  > {
    const textNode = node.tagName.toLowerCase() === 'text' ? node : null;
    const rawPaintOrder = (element.attr('paint-order') as string | null)?.trim();
    const paintOrder =
      rawPaintOrder && rawPaintOrder.length > 0 && rawPaintOrder.toLowerCase() !== 'normal'
        ? rawPaintOrder
        : undefined;
    const rawVectorEffect = (element.attr('vector-effect') as string | null)?.trim();
    const vectorEffect =
      rawVectorEffect && rawVectorEffect.length > 0 && rawVectorEffect.toLowerCase() !== 'none'
        ? rawVectorEffect
        : undefined;

    const rawFontSize = textNode ? Number.parseFloat(textNode.getAttribute('font-size') ?? '') : Number.NaN;
    const textAnchorAttr = textNode?.getAttribute('text-anchor');
    const textAnchor =
      textAnchorAttr === 'middle' || textAnchorAttr === 'end' || textAnchorAttr === 'start'
        ? textAnchorAttr
        : undefined;

    const rawDominantBaseline = textNode?.getAttribute('dominant-baseline')?.trim();
    const dominantBaseline =
      rawDominantBaseline && rawDominantBaseline.length > 0 && rawDominantBaseline.toLowerCase() !== 'auto'
        ? rawDominantBaseline
        : undefined;

    const rawLetterSpacing = textNode
      ? Number.parseFloat(textNode.getAttribute('letter-spacing') ?? '')
      : Number.NaN;
    const rawWordSpacing = textNode
      ? Number.parseFloat(textNode.getAttribute('word-spacing') ?? '')
      : Number.NaN;

    return {
      textContent: textNode?.textContent ?? undefined,
      fontFamily: textNode?.getAttribute('font-family') ?? undefined,
      fontSize: Number.isFinite(rawFontSize) ? rawFontSize : undefined,
      fontWeight: textNode?.getAttribute('font-weight') ?? undefined,
      fontStyle: textNode?.getAttribute('font-style') ?? undefined,
      textAnchor,
      dominantBaseline,
      letterSpacing: Number.isFinite(rawLetterSpacing) ? rawLetterSpacing : undefined,
      wordSpacing: Number.isFinite(rawWordSpacing) ? rawWordSpacing : undefined,
      paintOrder,
      vectorEffect
    };
  }


  getTextContent(textId: string): string | null {
    const textNode = this.resolveTextNode(textId);
    return textNode?.textContent ?? null;
  }

  /**
   * Replace text content for a `<text>` node. `<tspan>` ids are resolved to their parent `<text>`.
   */
  updateTextContent(textId: string, text: string): void {
    const textNode = this.resolveTextNode(textId);
    if (!textNode) return;
    // Use plain DOM text replacement: svg.js `Text.text()` can call `getBBox()` for layout, which
    // is unavailable in jsdom and breaks unit tests; stroke/fill still go through svg.js helpers.
    textNode.textContent = text;
    this.doc.bumpDocumentRevision();
  }

  updateTextFontFamily(textId: string, fontFamily: string): void {
    this.updateTextAttr(textId, 'font-family', fontFamily);
  }

  updateTextFontSize(textId: string, fontSize: number): void {
    this.updateTextAttr(textId, 'font-size', `${fontSize}`);
  }

  updateTextFontWeight(textId: string, fontWeight: string): void {
    this.updateTextAttr(textId, 'font-weight', fontWeight);
  }

  updateTextFontStyle(textId: string, fontStyle: string): void {
    this.updateTextAttr(textId, 'font-style', fontStyle);
  }

  updateTextAnchor(textId: string, textAnchor: 'start' | 'middle' | 'end'): void {
    this.updateTextAttr(textId, 'text-anchor', textAnchor);
  }

  /**
   * Sets SVG `dominant-baseline` on the target `<text>`. Pass `undefined` or `'auto'` to clear.
   */
  updateTextDominantBaseline(textId: string, baseline: string | undefined): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    const trimmed = baseline?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'auto') {
      shape.attr('dominant-baseline', null);
    } else {
      shape.attr('dominant-baseline', trimmed);
    }
    this.doc.bumpDocumentRevision();
  }

  updateTextLetterSpacing(textId: string, letterSpacing: number): void {
    if (!Number.isFinite(letterSpacing)) return;
    this.updateTextAttr(textId, 'letter-spacing', `${letterSpacing}`);
  }

  updateTextWordSpacing(textId: string, wordSpacing: number): void {
    if (!Number.isFinite(wordSpacing)) return;
    this.updateTextAttr(textId, 'word-spacing', `${wordSpacing}`);
  }

  /**
   * Sets SVG `paint-order` on the target `<text>`. Pass `undefined` or `'normal'` to clear the
   * attribute (browser default: fill then stroke on top).
   */
  updateTextPaintOrder(textId: string, paintOrder: string | undefined): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    const trimmed = paintOrder?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'normal') {
      shape.attr('paint-order', null);
    } else {
      shape.attr('paint-order', trimmed);
    }
    this.doc.bumpDocumentRevision();
  }

  /**
   * Sets SVG `vector-effect` on the target `<text>`. Use `non-scaling-stroke` so outline width stays
   * constant in screen pixels when the SVG is scaled (e.g. editor zoom); pass `undefined` / `'none'`
   * to clear. See SVG spec — behavior depends on the root viewport transform chain.
   */
  updateTextVectorEffect(textId: string, effect: string | undefined): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    const trimmed = effect?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      shape.attr('vector-effect', null);
    } else {
      shape.attr('vector-effect', trimmed);
    }
    this.doc.bumpDocumentRevision();
  }

  private updateTextAttr(textId: string, attr: string, value: string): void {
    const shape = this.resolveTextSvgShape(textId);
    if (!shape) return;
    shape.attr(attr, value);
    this.doc.bumpDocumentRevision();
  }

  /** Resolve a `<text>` SVG.js element from an id on `<text>` or a child like `<tspan>`. */
  private resolveTextSvgShape(textId: string): SvgJsElement | null {
    if (!this.doc.getSVGInstance()) return null;
    let current = this.doc.getSVGInstance()!.findOne(`#${textId}`) as SvgJsElement | undefined;
    if (!current?.node) return null;
    for (let depth = 0; depth < 24 && current; depth++) {
      if (current.type === 'text') {
        return current;
      }
      const parent = current.parent() as SvgJsElement | undefined;
      if (!parent || parent === current) {
        break;
      }
      current = parent;
    }
    return null;
  }

  private resolveTextNode(textId: string): Element | null {
    return (this.resolveTextSvgShape(textId)?.node as Element | null) ?? null;
  }
}
