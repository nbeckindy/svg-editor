import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { SvgCanvasComponent } from '../svg-canvas.component';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorToolService } from '../../../services/editor-tool.service';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { CanvasViewService } from '../../../services/canvas-view.service';
import { editorPortTestProviders } from '../../../testing/editor-port-test-providers';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('smart guide overlay SVG namespace', () => {
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let component: SvgCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [...editorPortTestProviders, SvgManipulationService, ShapeSelectionService, EditorToolService, CanvasViewService]
    }).compileComponents();
    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
  });

  it('renders smart guide lines in the SVG namespace', () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"><rect id="r1" x="0" y="0" width="10" height="10"/></svg>');
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    component.overlayViewBox = '0 0 100 100';

    const resizeHandler = component['resize'] as unknown as {
      isActive: boolean;
      smartGuides: { vertical: number[]; horizontal: number[] };
    };
    resizeHandler.isActive = true;
    resizeHandler.smartGuides = { vertical: [25], horizontal: [30] };
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('[app-smart-guide-overlay]') as Element | null;
    const line = fixture.nativeElement.querySelector('[data-testid="canvas-smart-guide-line"]') as Element | null;

    expect(line).toBeTruthy();
    expect(host?.namespaceURI).toBe(SVG_NS);
    expect(line?.namespaceURI).toBe(SVG_NS);
  });
});
