import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SvgCanvasComponent } from '../svg-canvas.component';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorToolService } from '../../../services/editor-tool.service';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { CanvasViewService } from '../../../services/canvas-view.service';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('path-node overlay SVG namespace', () => {
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let shapeSelectionService: ShapeSelectionService;
  let editorToolService: EditorToolService;
  let svgManipulationService: SvgManipulationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [SvgManipulationService, ShapeSelectionService, EditorToolService, CanvasViewService]
    }).compileComponents();
    fixture = TestBed.createComponent(SvgCanvasComponent);
    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    editorToolService = TestBed.inject(EditorToolService);
    svgManipulationService = TestBed.inject(SvgManipulationService);
  });

  it('renders path-node affordances in the SVG namespace', async () => {
    const svg = '<svg viewBox="0 0 100 100"><path id="path-a" d="M 10 10 C 20 10 30 20 40 40 L 60 50" /></svg>';
    fixture.componentRef.setInput('svgContent', svg);
    fixture.componentInstance.wrapperWidth = 100;
    fixture.componentInstance.wrapperHeight = 100;
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    svgManipulationService.initializeSVG(
      fixture.nativeElement.querySelector('.svg-user-document')!,
      svg
    );
    shapeSelectionService.selectShape({
      id: 'path-a',
      type: 'path',
      fill: '#000',
      stroke: undefined,
      strokeWidth: 0,
      opacity: 1
    });
    editorToolService.setTool('node-edit-selector');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));

    const anchor = fixture.nativeElement.querySelector(
      '[data-testid="canvas-path-node-anchor"]'
    ) as Element | null;
    const pathHost = fixture.nativeElement.querySelector('[app-path-node-overlay]') as Element | null;
    const pathHandle = fixture.nativeElement.querySelector(
      '[data-testid="canvas-path-node-control-handle"]'
    ) as Element | null;

    expect(pathHost?.namespaceURI).toBe(SVG_NS);
    expect(anchor?.namespaceURI).toBe(SVG_NS);
    expect(pathHandle?.namespaceURI).toBe(SVG_NS);
  });
});
