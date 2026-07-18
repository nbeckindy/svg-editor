import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, WritableSignal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreationPaintDefaultsComponent } from './creation-paint-defaults.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { SelectionPaintUiService } from '../../services/selection-paint-ui.service';
import { BASE_DRAWING_STYLE_DEFAULTS } from '../../models/drawing-style-defaults';
import type { ShapeProperties } from '../../models/shape-properties.interface';
import type { PaintSwatchMode } from '../paint-swatch-popover/paint-swatch-popover.component';

describe('CreationPaintDefaultsComponent', () => {
  let fixture: ComponentFixture<CreationPaintDefaultsComponent>;
  let chromeApply: {
    applyCreationFillDefault: ReturnType<typeof vi.fn>;
    applyCreationStrokeDefault: ReturnType<typeof vi.fn>;
    applyCreationFillPaintMode: ReturnType<typeof vi.fn>;
    applyCreationStrokePaintMode: ReturnType<typeof vi.fn>;
  };
  let drawingDefaults: DrawingStyleDefaultsService;
  let selectedShapesSignal: WritableSignal<ShapeProperties[]>;
  let paintUi: {
    hasSelection: ReturnType<typeof computed<boolean>>;
    selectedShape: ReturnType<typeof computed<ShapeProperties | null>>;
    selectionCount: ReturnType<typeof computed<number>>;
    anySelectedShapeLocked: ReturnType<typeof computed<boolean>>;
    fillSwatchMode: ReturnType<typeof vi.fn>;
    strokeSwatchMode: ReturnType<typeof vi.fn>;
    fillPickerColor: ReturnType<typeof vi.fn>;
    strokePickerColor: ReturnType<typeof vi.fn>;
    allSelectedLackFill: ReturnType<typeof vi.fn>;
    allSelectedLackStroke: ReturnType<typeof vi.fn>;
    fillPaintMixed: ReturnType<typeof vi.fn>;
    strokePaintMixed: ReturnType<typeof vi.fn>;
    supportsFill: ReturnType<typeof vi.fn>;
    isPatternFill: ReturnType<typeof vi.fn>;
    isPatternStroke: ReturnType<typeof vi.fn>;
    gradientModelForShape: ReturnType<typeof vi.fn>;
    onFillColorChange: ReturnType<typeof vi.fn>;
    onStrokeColorChange: ReturnType<typeof vi.fn>;
    onFillPaintModeChange: ReturnType<typeof vi.fn>;
    onStrokePaintModeChange: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    selectedShapesSignal = signal<ShapeProperties[]>([]);
    chromeApply = {
      applyCreationFillDefault: vi.fn(),
      applyCreationStrokeDefault: vi.fn(),
      applyCreationFillPaintMode: vi.fn(),
      applyCreationStrokePaintMode: vi.fn()
    };

    paintUi = {
      hasSelection: computed(() => selectedShapesSignal().length > 0),
      selectedShape: computed(() => {
        const shapes = selectedShapesSignal();
        return shapes.length > 0 ? shapes[0] : null;
      }),
      selectionCount: computed(() => selectedShapesSignal().length),
      anySelectedShapeLocked: computed(() => false),
      fillSwatchMode: vi.fn((shape: ShapeProperties): PaintSwatchMode =>
        !shape.fill || shape.fill.toLowerCase() === 'none' ? 'none' : 'solid'
      ),
      strokeSwatchMode: vi.fn((shape: ShapeProperties): PaintSwatchMode =>
        !shape.stroke || shape.stroke.toLowerCase() === 'none' ? 'none' : 'solid'
      ),
      fillPickerColor: vi.fn((shape: ShapeProperties) => shape.fill ?? '#888888'),
      strokePickerColor: vi.fn((shape: ShapeProperties) => shape.stroke ?? '#888888'),
      allSelectedLackFill: vi.fn(
        (shape: ShapeProperties) => !shape.fill || shape.fill.toLowerCase() === 'none'
      ),
      allSelectedLackStroke: vi.fn(
        (shape: ShapeProperties) => !shape.stroke || shape.stroke.toLowerCase() === 'none'
      ),
      fillPaintMixed: vi.fn(() => false),
      strokePaintMixed: vi.fn(() => false),
      supportsFill: vi.fn(() => true),
      isPatternFill: vi.fn(() => false),
      isPatternStroke: vi.fn(() => false),
      gradientModelForShape: vi.fn(() => null),
      onFillColorChange: vi.fn(),
      onStrokeColorChange: vi.fn(),
      onFillPaintModeChange: vi.fn(),
      onStrokePaintModeChange: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CreationPaintDefaultsComponent],
      providers: [
        DrawingStyleDefaultsService,
        { provide: ChromeEditorApplyService, useValue: chromeApply },
        { provide: SelectionPaintUiService, useValue: paintUi }
      ]
    }).compileComponents();

    drawingDefaults = TestBed.inject(DrawingStyleDefaultsService);
    drawingDefaults.resetDefaults();
    fixture = TestBed.createComponent(CreationPaintDefaultsComponent);
    fixture.detectChanges();
  });

  it('renders fill and stroke paint swatches without stroke width', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="creation-paint-defaults"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-default-fill"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-default-stroke"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-fill-paint-swatch"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-stroke-paint-swatch"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-default-stroke-width"]')).toBeNull();
  });

  it('omits gradient mode tabs on creation defaults', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="paint-swatch-mode-solid"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="paint-swatch-mode-none"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="paint-swatch-mode-linear"]')).toBeNull();
    expect(el.querySelector('[data-testid="paint-swatch-mode-radial"]')).toBeNull();
  });

  it('fill color change calls creation-only apply when nothing is selected', () => {
    fixture.componentInstance.onFillChange('#ff00aa');
    expect(chromeApply.applyCreationFillDefault).toHaveBeenCalledWith('#ff00aa');
    expect(paintUi.onFillColorChange).not.toHaveBeenCalled();
  });

  it('stroke color change calls creation-only apply when nothing is selected', () => {
    fixture.componentInstance.onStrokeChange('#00aaff');
    expect(chromeApply.applyCreationStrokeDefault).toHaveBeenCalledWith('#00aaff');
    expect(paintUi.onStrokeColorChange).not.toHaveBeenCalled();
  });

  it('solid and none paint mode changes call creation-only apply when nothing is selected', () => {
    fixture.componentInstance.onFillPaintModeChange('none');
    expect(chromeApply.applyCreationFillPaintMode).toHaveBeenCalledWith('none');
    fixture.componentInstance.onStrokePaintModeChange('solid');
    expect(chromeApply.applyCreationStrokePaintMode).toHaveBeenCalledWith('solid');
  });

  it('ignores gradient paint mode changes on the rail', () => {
    fixture.componentInstance.onFillPaintModeChange('linear');
    fixture.componentInstance.onStrokePaintModeChange('radial');
    expect(chromeApply.applyCreationFillPaintMode).not.toHaveBeenCalled();
    expect(chromeApply.applyCreationStrokePaintMode).not.toHaveBeenCalled();
    expect(paintUi.onFillPaintModeChange).not.toHaveBeenCalled();
    expect(paintUi.onStrokePaintModeChange).not.toHaveBeenCalled();
  });

  it('reports empty fill/stroke for none defaults', () => {
    drawingDefaults.setDefaults({ ...BASE_DRAWING_STYLE_DEFAULTS, fill: 'none', stroke: 'none' });
    fixture.detectChanges();
    expect(fixture.componentInstance.fillEmpty()).toBe(true);
    expect(fixture.componentInstance.strokeEmpty()).toBe(true);
    expect(fixture.componentInstance.fillMode()).toBe('none');
  });

  it('routes fill/stroke changes to selection paint when a shape is selected', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', fill: '#ff0000', stroke: '#00ff00' }
    ]);
    fixture.detectChanges();

    fixture.componentInstance.onFillChange('#112233');
    fixture.componentInstance.onStrokeChange('#445566');
    fixture.componentInstance.onFillPaintModeChange('none');
    fixture.componentInstance.onStrokePaintModeChange('solid');

    expect(paintUi.onFillColorChange).toHaveBeenCalledWith('#112233');
    expect(paintUi.onStrokeColorChange).toHaveBeenCalledWith('#445566');
    expect(paintUi.onFillPaintModeChange).toHaveBeenCalledWith('none');
    expect(paintUi.onStrokePaintModeChange).toHaveBeenCalledWith('solid');
    expect(chromeApply.applyCreationFillDefault).not.toHaveBeenCalled();
    expect(chromeApply.applyCreationStrokeDefault).not.toHaveBeenCalled();
    expect(chromeApply.applyCreationFillPaintMode).not.toHaveBeenCalled();
    expect(chromeApply.applyCreationStrokePaintMode).not.toHaveBeenCalled();
  });

  it('reflects selection paint in swatch presentation', () => {
    selectedShapesSignal.set([
      { id: 'shape-1', type: 'rect', fill: '#abcdef', stroke: 'none' }
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.groupAriaLabel()).toBe('Selection fill and stroke');
    expect(fixture.componentInstance.fillMode()).toBe('solid');
    expect(fixture.componentInstance.fillPickerColor()).toBe('#abcdef');
    expect(fixture.componentInstance.strokeEmpty()).toBe(true);
    expect(paintUi.fillSwatchMode).toHaveBeenCalled();
  });

  it('disables fill when selection does not support fill', () => {
    selectedShapesSignal.set([{ id: 'line-1', type: 'line', stroke: '#000000' }]);
    paintUi.supportsFill.mockReturnValue(false);
    fixture.detectChanges();
    expect(fixture.componentInstance.fillDisabled()).toBe(true);
  });
});
