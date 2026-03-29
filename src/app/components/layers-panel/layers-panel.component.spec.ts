import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { LayersPanelComponent } from './layers-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerStackItem, SvgManipulationService } from '../../services/svg-manipulation.service';
import { ShapeProperties } from '../../models/shape-properties.interface';

describe('LayersPanelComponent', () => {
  let fixture: ComponentFixture<LayersPanelComponent>;
  let documentRevision: WritableSignal<number>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let getLayerStackItems: ReturnType<typeof vi.fn>;
  let selectShape: ReturnType<typeof vi.fn>;
  let highlightShape: ReturnType<typeof vi.fn>;
  let getSVGInstance: ReturnType<typeof vi.fn>;
  let getShapeProperties: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    documentRevision = signal(0);
    selectedShapes = signal<ShapeProperties[]>([]);
    getLayerStackItems = vi.fn<() => LayerStackItem[]>(() => []);
    selectShape = vi.fn();
    highlightShape = vi.fn();
    getShapeProperties = vi.fn();
    getSVGInstance = vi.fn(() => ({ findOne: vi.fn() }));

    await TestBed.configureTestingModule({
      imports: [LayersPanelComponent],
      providers: [
        {
          provide: SvgManipulationService,
          useValue: { documentRevision, getLayerStackItems, getSVGInstance, getShapeProperties, highlightShape }
        },
        { provide: ShapeSelectionService, useValue: { selectedShapes, selectShape } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LayersPanelComponent);
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows empty state when there are no layer items', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state')).toBeTruthy();
    expect(el.querySelectorAll('.layer-row').length).toBe(0);
  });

  it('renders top-most layer first with id and type', () => {
    getLayerStackItems.mockReturnValue([
      {
        id: 'shape-back',
        type: 'rect',
        elementMarkup: '<rect id="shape-back" x="0" y="0" width="10" height="10" />'
      },
      {
        id: 'shape-front',
        type: 'circle',
        elementMarkup: '<circle id="shape-front" cx="5" cy="5" r="4" />'
      }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const rows = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('shape-front');
    expect(rows[0].textContent).toContain('circle');
    expect(rows[1].textContent).toContain('shape-back');
    expect(rows[1].textContent).toContain('rect');
  });

  it('marks selected layer rows', () => {
    getLayerStackItems.mockReturnValue([
      { id: 'shape-a', type: 'path', elementMarkup: '<path id="shape-a" d="M0 0 L5 5" />' }
    ]);
    selectedShapes.set([{ id: 'shape-a', type: 'path' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const selectedRow = (fixture.nativeElement as HTMLElement).querySelector('.layer-row.selected');
    expect(selectedRow).toBeTruthy();
  });

  it('selects shape when layer row is clicked', () => {
    const findOne = vi.fn(() => ({ id: () => 'shape-a', type: 'path', attr: vi.fn(() => null) }));
    getSVGInstance.mockReturnValue({ findOne });
    getShapeProperties.mockReturnValue({ id: 'shape-a', type: 'path' });
    getLayerStackItems.mockReturnValue([
      { id: 'shape-a', type: 'path', elementMarkup: '<path id="shape-a" d="M0 0 L5 5" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('.layer-row') as HTMLButtonElement;
    row.click();

    expect(findOne).toHaveBeenCalledWith('#shape-a');
    expect(selectShape).toHaveBeenCalledWith({ id: 'shape-a', type: 'path' });
    expect(highlightShape).toHaveBeenCalledWith('shape-a');
  });
});
