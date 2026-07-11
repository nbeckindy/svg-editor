import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SvgCanvasComponent } from '../svg-canvas.component';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorToolService } from '../../../services/editor-tool.service';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { CanvasViewService } from '../../../services/canvas-view.service';
import { editorPortTestProviders } from '../../../testing/editor-port-test-providers';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('selection overlay SVG namespace', () => {
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let component: SvgCanvasComponent;
  let shapeSelectionService: ShapeSelectionService;
  let editorToolService: EditorToolService;
  let svgManipulationService: SvgManipulationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [...editorPortTestProviders, SvgManipulationService, ShapeSelectionService, EditorToolService, CanvasViewService]
    }).compileComponents();
    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    editorToolService = TestBed.inject(EditorToolService);
    svgManipulationService = TestBed.inject(SvgManipulationService);
  });

  it('renders selection handles in the SVG namespace', async () => {
    vi.spyOn(svgManipulationService, 'getShapeBBox').mockReturnValue({
      x: 10,
      y: 10,
      width: 40,
      height: 40
    });
    vi.spyOn(svgManipulationService, 'getUnionBBox').mockReturnValue({
      x: 10,
      y: 10,
      width: 40,
      height: 40
    });
    const svg = '<svg viewBox="0 0 100 100"><rect id="rect-a" x="10" y="10" width="40" height="40" /></svg>';
    fixture.componentRef.setInput('svgContent', svg);
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    svgManipulationService.initializeSVG(
      fixture.nativeElement.querySelector('.svg-user-document')!,
      svg
    );
    shapeSelectionService.selectShape({
      id: 'rect-a',
      type: 'rect',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    editorToolService.setTool('selector');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));

    expect(component.showResizeHandles).toBe(true);
    const host = fixture.nativeElement.querySelector('[app-selection-overlay]') as Element | null;
    const handle = fixture.nativeElement.querySelector('[data-testid="canvas-handle-resize-nw"]') as Element | null;
    const highlight = fixture.nativeElement.querySelector('.highlight-overlay rect[stroke="#2196F3"]') as Element | null;

    expect(handle).toBeTruthy();
    expect(host?.namespaceURI).toBe(SVG_NS);
    expect(handle?.namespaceURI).toBe(SVG_NS);
    expect(highlight?.namespaceURI).toBe(SVG_NS);
  });
});
