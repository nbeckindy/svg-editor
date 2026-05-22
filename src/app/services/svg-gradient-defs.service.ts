import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement } from '@svgdotjs/svg.js';
import {
  applyEditableGradientModelToElement,
  defaultLinearGradientModel,
  defaultRadialGradientModel,
  parsePaintReferenceId,
  readEditableGradientModel,
  type EditableGradientModel,
  type PaintGradientSnapshot
} from '../models/svg-gradient';
import { SvgEditorDocumentService } from './svg-editor-document.service';
import { CONTENT_SHAPE_SELECTOR, EDITOR_CONTENT_GROUP_ID, SVG_NS } from './svg-editor-stage.constants';
import type { SvgGradientDefsPort } from './svg-gradient-defs.port';

@Injectable({
  providedIn: 'root'
})
export class SvgGradientDefsService implements SvgGradientDefsPort {
  private readonly doc = inject(SvgEditorDocumentService);

  allocateUniqueDefId(prefix: string): string {
    if (!this.doc.getSVGInstance()) return `${prefix}-fallback`;
    let id: string;
    do {
      id = `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
    } while (this.doc.getSVGInstance()!.findOne(`#${id}`));
    return id;
  }

  private static paintAttrReferencesDefId(value: string | null, defId: string): boolean {
    if (!value) return false;
    const esc = defId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`url\\(\\s*#${esc}\\s*\\)`, 'i').test(value);
  }

  private static cssEscapeSelector(id: string): string {
    const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
    if (typeof g.CSS?.escape === 'function') return g.CSS.escape(id);
    return id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  }

  countPaintUrlReferencesToDefId(defId: string): number {
    if (!this.doc.getSVGInstance()) return 0;
    const root = this.doc.getSVGInstance()!.node as SVGSVGElement;
    let n = 0;
    const walk = (el: Element) => {
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      const style = el.getAttribute('style');
      if (SvgGradientDefsService.paintAttrReferencesDefId(fill, defId)) n++;
      if (SvgGradientDefsService.paintAttrReferencesDefId(stroke, defId)) n++;
      if (SvgGradientDefsService.paintAttrReferencesDefId(style, defId)) n++;
      for (let i = 0; i < el.children.length; i++) walk(el.children[i] as Element);
    };
    walk(root);
    return n;
  }

  removeGradientDefById(gradientId: string): void {
    if (!this.doc.getSVGInstance()) return;
    const defs = this.doc.getSVGInstance()!.defs().node;
    const old = defs.querySelector(`#${SvgGradientDefsService.cssEscapeSelector(gradientId)}`);
    if (old?.parentNode === defs) {
      const tag = old.tagName.toLowerCase();
      if (tag === 'lineargradient' || tag === 'radialgradient') {
        defs.removeChild(old);
        this.doc.bumpDocumentRevision();
      }
    }
  }

  countContentShapesReferencingPaintDef(defId: string): number {
    if (!this.doc.getSVGInstance()) return 0;
    const root = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`)?.node as Element | null;
    if (!root) return 0;
    let n = 0;
    root.querySelectorAll(CONTENT_SHAPE_SELECTOR).forEach((node) => {
      const el = node as Element;
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      if (
        SvgGradientDefsService.paintAttrReferencesDefId(fill, defId) ||
        SvgGradientDefsService.paintAttrReferencesDefId(stroke, defId)
      ) {
        n++;
      }
    });
    return n;
  }

  findGradientDomElement(
    gradientId: string
  ): SVGLinearGradientElement | SVGRadialGradientElement | null {
    if (!this.doc.getSVGInstance()) return null;
    const el = this.doc.getSVGInstance()!.findOne(`#${gradientId}`)?.node as Element | null;
    if (!el) return null;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'lineargradient' || tag === 'radialgradient') {
      return el as SVGLinearGradientElement | SVGRadialGradientElement;
    }
    return null;
  }

  readEditableGradientModelById(gradientId: string): EditableGradientModel | null {
    const el = this.findGradientDomElement(gradientId);
    return el ? readEditableGradientModel(el) : null;
  }

  ensureDedicatedPaintGradient(shapeId: string, paintProperty: 'fill' | 'stroke'): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape?.node) return null;
    const raw = shape.attr(paintProperty) as string | null;
    const id = parsePaintReferenceId(raw ?? undefined);
    if (!id) return null;
    const gradEl = this.findGradientDomElement(id);
    if (!gradEl) return null;
    if (this.countContentShapesReferencingPaintDef(id) <= 1) {
      return id;
    }
    const newId = this.allocateUniqueDefId('grad');
    const clone = gradEl.cloneNode(true) as SVGLinearGradientElement | SVGRadialGradientElement;
    clone.setAttribute('id', newId);
    const defs = this.doc.getSVGInstance()!.defs().node;
    defs.appendChild(clone);
    shape.attr(paintProperty, `url(#${newId})`);
    this.doc.bumpDocumentRevision();
    return newId;
  }

  capturePaintGradientSnapshot(shapeId: string, paintProperty: 'fill' | 'stroke'): PaintGradientSnapshot {
    if (!this.doc.getSVGInstance()) {
      return { gradientId: null, shapePaintAttr: null, gradientOuterHtml: null };
    }
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const shapePaintAttr = (shape?.attr(paintProperty) as string | null) ?? null;
    const gradientId = parsePaintReferenceId(shapePaintAttr ?? undefined);
    if (!gradientId) {
      return { gradientId: null, shapePaintAttr, gradientOuterHtml: null };
    }
    const gel = this.findGradientDomElement(gradientId);
    const gradientOuterHtml = gel ? gel.outerHTML : null;
    return { gradientId, shapePaintAttr, gradientOuterHtml };
  }

  applyPaintGradientSnapshot(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    snapshot: PaintGradientSnapshot
  ): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    if (!shape) return;
    const defs = this.doc.getSVGInstance()!.defs().node;

    const idsToRemove = new Set<string>();
    if (snapshot.gradientId) idsToRemove.add(snapshot.gradientId);
    if (snapshot.gradientOuterHtml) {
      const m = snapshot.gradientOuterHtml.match(/\bid\s*=\s*["']([^"']+)["']/i);
      if (m) idsToRemove.add(m[1]);
    }
    for (const rid of idsToRemove) {
      const old = defs.querySelector(`#${SvgGradientDefsService.cssEscapeSelector(rid)}`);
      if (old?.parentNode === defs) defs.removeChild(old);
    }

    if (snapshot.gradientOuterHtml) {
      const wrapped = `<svg xmlns="${SVG_NS}">${snapshot.gradientOuterHtml}</svg>`;
      const parsedDoc = new DOMParser().parseFromString(wrapped, 'image/svg+xml');
      const parsed = parsedDoc.documentElement.firstElementChild as
        | SVGLinearGradientElement
        | SVGRadialGradientElement
        | null;
      if (parsed?.getAttribute('id')) {
        defs.appendChild(parsed);
      }
    }

    if (snapshot.shapePaintAttr == null || snapshot.shapePaintAttr === '') {
      shape.attr(paintProperty, null);
    } else {
      shape.attr(paintProperty, snapshot.shapePaintAttr);
    }

    this.doc.bumpDocumentRevision();
  }

  writeEditableGradientModel(model: EditableGradientModel): void {
    if (!this.doc.getSVGInstance()) return;
    let el = this.findGradientDomElement(model.id);
    const defs = this.doc.getSVGInstance()!.defs().node;
    const ownerDoc = defs.ownerDocument;
    if (!ownerDoc) return;

    if (!el || el.tagName.toLowerCase() !== (model.kind === 'linear' ? 'lineargradient' : 'radialgradient')) {
      if (el?.parentNode === defs) defs.removeChild(el);
      const tag = model.kind === 'linear' ? 'linearGradient' : 'radialGradient';
      const nu = ownerDoc.createElementNS(SVG_NS, tag);
      nu.setAttribute('id', model.id);
      defs.appendChild(nu);
      el = nu as SVGLinearGradientElement | SVGRadialGradientElement;
    }
    applyEditableGradientModelToElement(el, model);
  }

  createLinearGradientFillForShape(shapeId: string, fromColor: string, toColor = '#ffffff'): string {
    if (!this.doc.getSVGInstance()) return '';
    const id = this.allocateUniqueDefId('grad');
    const model = defaultLinearGradientModel(id, fromColor, toColor);
    const ownerDoc = this.doc.getSVGInstance()!.defs().node.ownerDocument;
    if (!ownerDoc) return id;
    const nu = ownerDoc.createElementNS(SVG_NS, 'linearGradient');
    nu.setAttribute('id', id);
    this.doc.getSVGInstance()!.defs().node.appendChild(nu);
    applyEditableGradientModelToElement(nu, model);
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    shape?.fill(`url(#${id})`);
    this.doc.bumpDocumentRevision();
    return id;
  }

  applyGradientModelToShapePaint(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    model: EditableGradientModel
  ): void {
    if (!this.doc.getSVGInstance()) return;
    this.writeEditableGradientModel(model);
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const url = `url(#${model.id})`;
    if (paintProperty === 'fill') {
      shape?.fill(url);
    } else {
      shape?.attr('stroke', url);
    }
    this.doc.bumpDocumentRevision();
  }

  setGradientKindForShape(
    shapeId: string,
    paintProperty: 'fill' | 'stroke',
    kind: 'linear' | 'radial',
    preserveStopsFrom: EditableGradientModel
  ): EditableGradientModel {
    const id = preserveStopsFrom.id;
    const stops =
      preserveStopsFrom.stops.length >= 2
        ? preserveStopsFrom.stops
        : defaultLinearGradientModel(id, '#000000', '#ffffff').stops;
    const units = preserveStopsFrom.gradientUnits;
    let model: EditableGradientModel;
    if (kind === 'linear') {
      model = {
        ...defaultLinearGradientModel(
          id,
          stops[0]?.color ?? '#000000',
          stops[stops.length - 1]?.color ?? '#ffffff'
        ),
        stops,
        gradientUnits: units
      };
    } else {
      model = {
        ...defaultRadialGradientModel(
          id,
          stops[0]?.color ?? '#000000',
          stops[stops.length - 1]?.color ?? '#ffffff'
        ),
        stops,
        gradientUnits: units
      };
    }
    if (!this.doc.getSVGInstance()) return model;
    const defs = this.doc.getSVGInstance()!.defs().node;
    const old = this.findGradientDomElement(id);
    if (old?.parentNode === defs) defs.removeChild(old);
    const ownerDoc = defs.ownerDocument;
    if (!ownerDoc) return model;
    const tag = kind === 'linear' ? 'linearGradient' : 'radialGradient';
    const nu = ownerDoc.createElementNS(SVG_NS, tag);
    nu.setAttribute('id', id);
    defs.appendChild(nu);
    applyEditableGradientModelToElement(nu as SVGLinearGradientElement | SVGRadialGradientElement, model);
    const shape = this.doc.getSVGInstance()!.findOne(`#${shapeId}`) as SvgJsElement | undefined;
    const url = `url(#${id})`;
    if (paintProperty === 'fill') shape?.fill(url);
    else shape?.attr('stroke', url);
    this.doc.bumpDocumentRevision();
    return model;
  }
}
