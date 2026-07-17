import { Injectable, inject } from '@angular/core';
import { Element as SvgJsElement, G } from '@svgdotjs/svg.js';
import { EDITOR_PATH_NODE_HANDLE_LINK_ATTR } from '../../models/path-node-handle-link';
import type { DrawingStyleDefaults } from '../../models/drawing-style-defaults';
import type { SvgShapePathDataPort } from './svg-shape-path-data.port';
import { DrawingStyleDefaultsService } from '../drawing-style-defaults.service';
import { SvgEditorDocumentService } from '../svg-editor-document.service';
import { SvgGradientDefsService } from '../svg-gradient-defs.service';
import { EDITOR_CONTENT_GROUP_ID } from '../svg-editor-stage.constants';

@Injectable({ providedIn: 'root' })
export class SvgShapePathDataService implements SvgShapePathDataPort {
  private readonly doc = inject(SvgEditorDocumentService);
  private readonly drawingStyleDefaults = inject(DrawingStyleDefaultsService);
  private readonly gradients = inject(SvgGradientDefsService);

  updatePathData(pathId: string, d: string): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${pathId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'path') return;
    shape.attr('d', d);
    this.doc.bumpDocumentRevision();
  }

  getPathNodeHandleLinkRaw(pathId: string): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const shape = this.doc.getSVGInstance()!.findOne(`#${pathId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'path' || !shape.node) return null;
    return shape.node.getAttribute(EDITOR_PATH_NODE_HANDLE_LINK_ATTR);
  }

  setPathNodeHandleLinkRaw(pathId: string, value: string | null): void {
    if (!this.doc.getSVGInstance()) return;
    const shape = this.doc.getSVGInstance()!.findOne(`#${pathId}`) as SvgJsElement | undefined;
    if (!shape || shape.type !== 'path' || !shape.node) return;
    if (value === null || value === '') {
      shape.node.removeAttribute(EDITOR_PATH_NODE_HANDLE_LINK_ATTR);
    } else {
      shape.attr(EDITOR_PATH_NODE_HANDLE_LINK_ATTR, value);
    }
    this.doc.bumpDocumentRevision();
  }

    /**
   * Insert a `<path>` with the given `d` into the editor content group.
   * Mirrors {@link addShape} id allocation.
   */
  insertPathIntoContentGroup(
    d: string,
    attrs?: { fill?: string; stroke?: string; strokeWidth?: number },
    options?: { closedPath?: boolean }
  ): string | null {
    if (!this.doc.getSVGInstance()) return null;
    const contentGroup = this.doc.getSVGInstance()!.findOne(`[${EDITOR_CONTENT_GROUP_ID}]`) as G | null;
    if (!contentGroup) return null;

    const usedIds = new Set<string>();
    contentGroup.find('*').forEach((el: SvgJsElement) => {
      const id = el.id();
      if (id) usedIds.add(id);
    });
    let newId: string;
    do {
      newId = `shape-${Math.random().toString(36).substr(2, 9)}`;
    } while (usedIds.has(newId));

    const defaults = this.drawingStyleDefaults.defaults();
    const pathFactory = contentGroup as G & { path(pathD: string): SvgJsElement };
    const shape = pathFactory.path(d);
    shape.id(newId);
    const fill =
      attrs?.fill !== undefined
        ? attrs.fill
        : options?.closedPath
          ? this.resolveCreationFill(defaults)
          : 'none';
    shape.fill(fill);
    shape.stroke({
      color: attrs?.stroke !== undefined ? attrs.stroke : this.resolveCreationStroke(defaults),
      width: attrs?.strokeWidth ?? defaults.strokeWidth
    });
    this.doc.bumpDocumentRevision();
    return newId;
  }

  private resolveCreationFill(defaults: DrawingStyleDefaults): string {
    if (defaults.fillGradient) {
      const url = this.gradients.materializeCreationGradientTemplate(defaults.fillGradient);
      if (url) return url;
    }
    return defaults.fill;
  }

  private resolveCreationStroke(defaults: DrawingStyleDefaults): string {
    if (defaults.strokeGradient) {
      const url = this.gradients.materializeCreationGradientTemplate(defaults.strokeGradient);
      if (url) return url;
    }
    return defaults.stroke;
  }
}
