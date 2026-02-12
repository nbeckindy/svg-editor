import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SvgCanvasComponent } from './svg-canvas.component';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeSelectionService } from '../../services/shape-selection.service';

describe('SvgCanvasComponent', () => {
  let component: SvgCanvasComponent;
  let fixture: ComponentFixture<SvgCanvasComponent>;
  let svgManipulationService: SvgManipulationService;
  let shapeSelectionService: ShapeSelectionService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SvgCanvasComponent],
      providers: [
        SvgManipulationService,
        ShapeSelectionService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SvgCanvasComponent);
    component = fixture.componentInstance;
    svgManipulationService = TestBed.inject(SvgManipulationService);
    shapeSelectionService = TestBed.inject(ShapeSelectionService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display placeholder when no SVG content', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    const placeholder = compiled.querySelector('.placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder.textContent).toContain('Load an SVG file to begin editing');
  });

  it('should initialize SVG when content is provided', () => {
    const svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    const initializeSpy = vi.spyOn(svgManipulationService, 'initializeSVG');
    
    component.svgContent = svgContent;
    fixture.detectChanges();
    
    // Give time for AfterViewInit to run
    setTimeout(() => {
      expect(initializeSpy).toHaveBeenCalled();
    }, 0);
  });

  it('should handle canvas click on background', () => {
    const clearSelectionSpy = vi.spyOn(shapeSelectionService, 'clearSelection');
    const clearHighlightSpy = vi.spyOn(svgManipulationService, 'clearHighlight');
    
    component.svgContent = '<svg><circle cx="50" cy="50" r="40"/></svg>';
    fixture.detectChanges();
    
    const mockEvent = {
      target: { tagName: 'svg' }
    } as unknown as MouseEvent;
    
    component.onCanvasClick(mockEvent);
    
    expect(clearSelectionSpy).toHaveBeenCalled();
    expect(clearHighlightSpy).toHaveBeenCalled();
  });
});
