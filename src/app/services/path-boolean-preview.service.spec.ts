import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PathBooleanGeometryPort } from '../models/path-boolean';
import { PathBooleanPreviewService } from './path-boolean-preview.service';
import { PathBooleanGeometryService } from './path-boolean-geometry.service';

describe('PathBooleanPreviewService', () => {
  it('computes preview d for union and clears on cancel', () => {
    const unionLocalD = vi.fn().mockReturnValue('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    const port = {} as PathBooleanGeometryPort;

    TestBed.configureTestingModule({
      providers: [
        PathBooleanPreviewService,
        {
          provide: PathBooleanGeometryService,
          useValue: {
            createGeometryPort: () => port,
            unionLocalD,
            subtractLocalD: vi.fn(),
            intersectLocalD: vi.fn()
          }
        }
      ]
    });

    const service = TestBed.inject(PathBooleanPreviewService);
    service.setPreview('union', ['a', 'b']);
    expect(unionLocalD).toHaveBeenCalledWith(['a', 'b'], port);
    expect(service.previewRootUserD()).toContain('M');

    service.clearPreview();
    expect(service.previewOp()).toBeNull();
    expect(service.previewRootUserD()).toBeNull();
  });
});
