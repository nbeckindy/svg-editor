import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { PropertiesPanelComponent } from './properties-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import { vi } from 'vitest';

describe('PropertiesPanelComponent', () => {
  let component: PropertiesPanelComponent;
  let fixture: ComponentFixture<PropertiesPanelComponent>;
  let shapeSelectionService: ShapeSelectionService;
  let svgManipulationService: SvgManipulationService;
  let selectedShapeSignal: WritableSignal<ShapeProperties | null>;

  beforeEach(async () => {
    selectedShapeSignal = signal<ShapeProperties | null>(null);

    const shapeSelectionServiceMock = {
      selectedShape: selectedShapeSignal,
      updateSelectedShape: vi.fn((updates: Partial<ShapeProperties>) => {
        const current = selectedShapeSignal();
        if (current) {
          selectedShapeSignal.set({ ...current, ...updates });
        }
      }),
      clearSelection: vi.fn()
    };

    const svgManipulationServiceMock = {
      updateFillColor: vi.fn(),
      updateStrokeColor: vi.fn(),
      addStroke: vi.fn(),
      removeStroke: vi.fn(),
      updateOpacity: vi.fn(),
      clearHighlight: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [PropertiesPanelComponent],
      providers: [
        { provide: ShapeSelectionService, useValue: shapeSelectionServiceMock },
        { provide: SvgManipulationService, useValue: svgManipulationServiceMock }
      ]
    }).compileComponents();

    shapeSelectionService = TestBed.inject(ShapeSelectionService);
    svgManipulationService = TestBed.inject(SvgManipulationService);
    fixture = TestBed.createComponent(PropertiesPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display empty state when no shape is selected', () => {
    const compiled = fixture.nativeElement;
    const emptyState = compiled.querySelector('.empty-state');
    
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No shape selected');
  });

  it('should display properties when a shape is selected', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'circle',
      fill: '#ff0000',
      stroke: '#000000',
      strokeWidth: 2,
      opacity: 0.8
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.properties-content')).toBeTruthy();
    expect(compiled.textContent).toContain('circle');
    expect(compiled.textContent).toContain('shape-1');
  });

  it('should update fill color when color picker changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      fill: '#ff0000'
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const newColor = '#00ff00';

    component.onFillColorChange(newColor);
    fixture.detectChanges();

    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', newColor);
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({ fill: newColor });
  });

  it('should update stroke color when color picker changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const newColor = '#0000ff';

    component.onStrokeColorChange(newColor);
    fixture.detectChanges();

    expect(svgManipulationService.updateStrokeColor).toHaveBeenCalledWith('shape-1', newColor);
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({ stroke: newColor });
  });

  it('should remove stroke when stroke color is set to "none"', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    component.onStrokeColorChange('none');
    fixture.detectChanges();

    expect(svgManipulationService.removeStroke).toHaveBeenCalledWith('shape-1');
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      stroke: undefined,
      strokeWidth: 0
    });
  });

  it('should update stroke width when slider changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const newWidth = 5;
    const event = { target: { value: newWidth.toString() } } as unknown as Event;
    
    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', newWidth);
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({ strokeWidth: newWidth });
  });

  it('should remove stroke when stroke width is set to 0', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      stroke: '#000000',
      strokeWidth: 2
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const event = { target: { value: '0' } } as unknown as Event;
    
    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.removeStroke).toHaveBeenCalledWith('shape-1');
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({ strokeWidth: 0 });
  });

  it('should update opacity when slider changes', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      opacity: 1
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const newOpacity = 0.5;
    const event = { target: { value: newOpacity.toString() } } as unknown as Event;
    
    component.onOpacityChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.updateOpacity).toHaveBeenCalledWith('shape-1', newOpacity);
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({ opacity: newOpacity });
  });

  it('should clear selection when clear button is clicked', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect'
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    component.onClearSelection();
    fixture.detectChanges();

    expect(shapeSelectionService.clearSelection).toHaveBeenCalled();
    expect(svgManipulationService.clearHighlight).toHaveBeenCalled();
  });

  it('should reflect selected shape from signal', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-2',
      type: 'circle',
      fill: '#00ff00'
    };

    expect(component.selectedShape()).toBeNull();

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    expect(component.selectedShape()).toEqual(mockShape);
  });

  it('should use default stroke color when adding stroke without existing stroke', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'rect',
      strokeWidth: 0
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const newWidth = 3;
    const event = { target: { value: newWidth.toString() } } as unknown as Event;
    
    component.onStrokeWidthChange(event);
    fixture.detectChanges();

    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', newWidth);
  });
});
