import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PathBooleanSelectionReadService } from './path-boolean-selection-read.service';
import { SvgManipulationService } from './svg-manipulation.service';

describe('PathBooleanSelectionReadService', () => {
  let service: PathBooleanSelectionReadService;
  let getSVGInstance: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSVGInstance = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        PathBooleanSelectionReadService,
        {
          provide: SvgManipulationService,
          useValue: {
            getSVGInstance,
            isElementOrAncestorLocked: vi.fn().mockReturnValue(false)
          }
        }
      ]
    });
    service = TestBed.inject(PathBooleanSelectionReadService);
  });

  function mountShapes(specs: Record<string, { tag: string; d?: string }>): void {
    const nodes = new Map<string, Element>();
    for (const [id, spec] of Object.entries(specs)) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', spec.tag);
      el.id = id;
      if (spec.d) el.setAttribute('d', spec.d);
      nodes.set(id, el);
    }
    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        const id = sel.replace('#', '');
        const node = nodes.get(id);
        return node ? { node } : undefined;
      })
    });
  }

  it('getPathD returns d only for path elements', () => {
    mountShapes({
      p1: { tag: 'path', d: 'M 0 0 L 1 1 Z' },
      r1: { tag: 'rect' }
    });
    expect(service.getPathD('p1')).toBe('M 0 0 L 1 1 Z');
    expect(service.getPathD('r1')).toBeNull();
  });

  it('getCompoundOperandElement accepts path and primitive shapes', () => {
    mountShapes({
      p1: { tag: 'path', d: 'M 0 0 Z' },
      r1: { tag: 'rect' },
      t1: { tag: 'text' }
    });
    expect(service.getCompoundOperandElement('p1')?.tagName.toLowerCase()).toBe('path');
    expect(service.getCompoundOperandElement('r1')?.tagName.toLowerCase()).toBe('rect');
    expect(service.getCompoundOperandElement('t1')).toBeNull();
  });
});
