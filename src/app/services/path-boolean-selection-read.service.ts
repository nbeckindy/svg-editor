import { Injectable, inject } from '@angular/core';
import type { PathBooleanSelectionReadPort } from '../history/path-boolean-selection-read.port';
import { isOutlineToPathPrimitiveType } from '../models/primitive-to-path';
import { SvgManipulationService } from './svg-manipulation.service';
import { LAYER_LOCK_READ_PORT } from './manipulation-port-tokens';

const COMPOUND_OPERAND_TAGS = new Set(['path', 'rect', 'circle', 'ellipse']);

@Injectable({ providedIn: 'root' })
export class PathBooleanSelectionReadService implements PathBooleanSelectionReadPort {
  private readonly svg = inject(SvgManipulationService);
  private readonly layerLock = inject(LAYER_LOCK_READ_PORT);

  isElementOrAncestorLocked(elementId: string): boolean {
    return this.layerLock.isElementOrAncestorLocked(elementId);
  }

  getPathElement(pathId: string): Element | null {
    const el = this.findElement(pathId);
    return el?.tagName.toLowerCase() === 'path' ? el : null;
  }

  getPathD(shapeId: string): string | null {
    const el = this.getPathElement(shapeId);
    return el?.getAttribute('d') ?? null;
  }

  getCompoundOperandElement(shapeId: string): Element | null {
    const el = this.findElement(shapeId);
    const tag = el?.tagName.toLowerCase();
    if (tag && COMPOUND_OPERAND_TAGS.has(tag)) {
      return el ?? null;
    }
    return null;
  }

  getOutlineToPathElement(shapeId: string): Element | null {
    const el = this.findElement(shapeId);
    const tag = el?.tagName.toLowerCase();
    if (tag && isOutlineToPathPrimitiveType(tag)) {
      return el ?? null;
    }
    return null;
  }

  private findElement(shapeId: string): Element | undefined {
    return this.svg.getSVGInstance()?.findOne(`#${shapeId}`)?.node as Element | undefined;
  }
}
