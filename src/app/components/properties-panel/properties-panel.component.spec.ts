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
      clearHighlight: vi.fn(),
      getNearestGroupAncestorId: vi.fn(() => null),
      bakeEffectiveFillToLocal: vi.fn(),
      bakeEffectiveStrokeToLocal: vi.fn(),
      getSVGInstance: vi.fn(),
      getShapeProperties: vi.fn(),
      highlightShape: vi.fn()
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

  it('should show fill and stroke paint source badges when metadata is set', () => {
    const mockShape: ShapeProperties = {
      id: 'shape-1',
      type: 'circle',
      fill: '#ff0000',
      fillSource: { kind: 'class-or-stylesheet', classNames: ['accent'] },
      stroke: '#000000',
      strokeWidth: 2,
      strokeSource: { kind: 'presentation-attr' }
    };

    selectedShapeSignal.set(mockShape);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const badges = compiled.querySelectorAll('.paint-source-badge');
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toContain('CSS');
    expect(compiled.textContent).toContain('accent');
    expect(badges[1].textContent).toContain('On this shape');
    expect(compiled.querySelector('.paint-source-row.class-controlled')).toBeTruthy();
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
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      fill: newColor,
      fillSource: { kind: 'presentation-attr' }
    });
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
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      stroke: newColor,
      strokeSource: { kind: 'presentation-attr' }
    });
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
      strokeWidth: 0,
      strokeSource: { kind: 'default' }
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
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      strokeWidth: newWidth,
      strokeSource: { kind: 'presentation-attr' }
    });
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
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      strokeWidth: 0,
      stroke: undefined,
      strokeSource: { kind: 'default' }
    });
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

  describe('paintSourceText', () => {
    it('maps paint source kinds to short labels', () => {
      expect(component.paintSourceText({ kind: 'inline-style' })).toBe('Inline style');
      expect(component.paintSourceText({ kind: 'presentation-attr' })).toBe('On this shape');
      expect(component.paintSourceText({ kind: 'class-or-stylesheet' })).toBe('From CSS class or stylesheet');
      expect(component.paintSourceText({ kind: 'inherited' })).toBe('From parent');
      expect(component.paintSourceText({ kind: 'default' })).toBe('Default');
      expect(component.paintSourceText({ kind: 'unknown' })).toBe('Unknown');
      expect(component.paintSourceText(undefined)).toBe('Unknown');
    });
  });

  describe('isClassControlled', () => {
    it('is true only for class-or-stylesheet', () => {
      expect(component.isClassControlled({ kind: 'class-or-stylesheet' })).toBe(true);
      expect(component.isClassControlled({ kind: 'presentation-attr' })).toBe(false);
      expect(component.isClassControlled(undefined)).toBe(false);
    });
  });

  describe('hasFillColor / hasStrokeColor', () => {
    it('hasFillColor is false when fill is missing or none', () => {
      expect(component.hasFillColor({ id: 'a', type: 'rect' })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: undefined })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: 'none' })).toBe(false);
      expect(component.hasFillColor({ id: 'a', type: 'rect', fill: '#ff0000' })).toBe(true);
    });

    it('hasStrokeColor is false when stroke is missing or none', () => {
      expect(component.hasStrokeColor({ id: 'a', type: 'rect' })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: undefined })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: 'none' })).toBe(false);
      expect(component.hasStrokeColor({ id: 'a', type: 'rect', stroke: '#000000' })).toBe(true);
    });
  });

  it('shows No fill and No stroke instead of color pickers when paint is absent', () => {
    selectedShapeSignal.set({
      id: 'shape-1',
      type: 'rect',
      strokeWidth: 0
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No fill');
    expect(el.textContent).toContain('No stroke');
    expect(el.querySelector('app-color-picker')).toBeNull();
  });

  it('Set fill button applies black fill via manipulation service', () => {
    selectedShapeSignal.set({ id: 'shape-1', type: 'rect' });
    fixture.detectChanges();
    component.onFillColorChange('#000000');
    expect(svgManipulationService.updateFillColor).toHaveBeenCalledWith('shape-1', '#000000');
  });

  it('Set stroke button adds stroke with width 1', () => {
    selectedShapeSignal.set({ id: 'shape-1', type: 'rect', strokeWidth: 0 });
    fixture.detectChanges();
    component.onAddStrokeClick();
    expect(svgManipulationService.addStroke).toHaveBeenCalledWith('shape-1', '#000000', 1);
    expect(shapeSelectionService.updateSelectedShape).toHaveBeenCalledWith({
      stroke: '#000000',
      strokeWidth: 1,
      strokeSource: { kind: 'presentation-attr' }
    });
  });
});
