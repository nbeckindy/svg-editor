import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SvgCanvasComponent } from '../svg-canvas.component';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorToolService } from '../../../services/editor-tool.service';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { CanvasViewService } from '../../../services/canvas-view.service';
import { PathBooleanPreviewService } from '../../../services/path-boolean-preview.service';
import { PathBooleanGeometryService } from '../../../services/path-boolean-geometry.service';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('boolean preview overlay SVG namespace', () => {
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let previewService: PathBooleanPreviewService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [
        SvgManipulationService,
        ShapeSelectionService,
        EditorToolService,
        CanvasViewService,
        PathBooleanPreviewService,
        {
          provide: PathBooleanGeometryService,
          useValue: {
            createGeometryPort: () => ({}),
            unionLocalD: () => 'M 10 10 L 40 10 L 40 40 L 10 40 Z',
            subtractLocalD: vi.fn(),
            intersectLocalD: vi.fn()
          }
        }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SvgCanvasComponent);
    previewService = TestBed.inject(PathBooleanPreviewService);
  });

  it('renders path boolean preview in the SVG namespace', async () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"></svg>');
    fixture.componentInstance.wrapperWidth = 100;
    fixture.componentInstance.wrapperHeight = 100;
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));

    previewService.setPreview('union', ['path-a', 'path-b']);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));

    const host = fixture.nativeElement.querySelector('[app-boolean-preview-overlay]') as Element | null;
    const preview = fixture.nativeElement.querySelector(
      '[data-testid="canvas-path-boolean-preview"]'
    ) as Element | null;

    expect(host?.namespaceURI).toBe(SVG_NS);
    expect(preview?.namespaceURI).toBe(SVG_NS);
    expect(preview?.getAttribute('d')).toContain('M');
  });
});
