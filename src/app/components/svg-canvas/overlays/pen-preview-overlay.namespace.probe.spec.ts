import { TestBed, ComponentFixture } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SvgCanvasComponent } from '../svg-canvas.component';
import { ShapeSelectionService } from '../../../services/shape-selection.service';
import { EditorToolService } from '../../../services/editor-tool.service';
import { SvgManipulationService } from '../../../services/svg-manipulation.service';
import { CanvasViewService } from '../../../services/canvas-view.service';

const SVG_NS = 'http://www.w3.org/2000/svg';

function stubEditorSvgScreenMapping(
  component: SvgCanvasComponent,
  rect: DOMRect,
  viewBox: string
): void {
  vi.spyOn(component, 'clientToEditorSvgPoint').mockImplementation((clientX, clientY) => {
    const [vbX, vbY, vbW, vbH] = viewBox.split(/\s+/).map(Number);
    const x = vbX + ((clientX - rect.left) / rect.width) * vbW;
    const y = vbY + ((clientY - rect.top) / rect.height) * vbH;
    return { x, y };
  });
}

describe('pen preview overlay SVG namespace', () => {
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let component: SvgCanvasComponent;
  let editorToolService: EditorToolService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [SvgManipulationService, ShapeSelectionService, EditorToolService, CanvasViewService]
    }).compileComponents();
    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
    editorToolService = TestBed.inject(EditorToolService);
  });

  it('renders pen preview paths in the SVG namespace', async () => {
    fixture.componentRef.setInput('svgContent', '<svg viewBox="0 0 100 100"></svg>');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));
    fixture.detectChanges();
    component.wrapperWidth = 100;
    component.wrapperHeight = 100;
    editorToolService.setTool('pen');
    editorToolService.setPenAltCurveMode(false);
    stubEditorSvgScreenMapping(component, new DOMRect(0, 0, 100, 100), '0 0 100 100');
    fixture.detectChanges();

    component.onCanvasMouseDown({
      button: 0,
      clientX: 10,
      clientY: 10,
      detail: 1,
      preventDefault: vi.fn()
    } as unknown as MouseEvent);
    component.onDocumentMouseMove({ clientX: 40, clientY: 20 } as MouseEvent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 50));

    const host = fixture.nativeElement.querySelector('[app-pen-preview-overlay]') as Element | null;
    const preview = fixture.nativeElement.querySelector('[data-testid="canvas-pen-path-preview"]') as Element | null;

    expect(host?.namespaceURI).toBe(SVG_NS);
    expect(preview?.namespaceURI).toBe(SVG_NS);
  });
});
