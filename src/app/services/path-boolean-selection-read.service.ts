import { Injectable, inject } from '@angular/core';
import type { PathBooleanSelectionReadPort } from '../history/path-boolean-selection-read.port';
import { SvgManipulationService } from './svg-manipulation.service';

@Injectable({ providedIn: 'root' })
export class PathBooleanSelectionReadService implements PathBooleanSelectionReadPort {
  private readonly svg = inject(SvgManipulationService);

  isElementOrAncestorLocked(elementId: string): boolean {
    return this.svg.isElementOrAncestorLocked(elementId);
  }

  getPathD(shapeId: string): string | null {
    const el = this.svg.getSVGInstance()?.findOne(`#${shapeId}`)?.node as Element | undefined;
    return el?.getAttribute('d') ?? null;
  }

  getCompoundOperandElement(shapeId: string): Element | null {
    const el = this.svg.getSVGInstance()?.findOne(`#${shapeId}`)?.node as Element | undefined;
    return el ?? null;
  }
}
