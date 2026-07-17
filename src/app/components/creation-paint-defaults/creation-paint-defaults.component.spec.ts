import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreationPaintDefaultsComponent } from './creation-paint-defaults.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { BASE_DRAWING_STYLE_DEFAULTS } from '../../models/drawing-style-defaults';

describe('CreationPaintDefaultsComponent', () => {
  let fixture: ComponentFixture<CreationPaintDefaultsComponent>;
  let chromeApply: {
    applyCreationFillDefault: ReturnType<typeof vi.fn>;
    applyCreationStrokeDefault: ReturnType<typeof vi.fn>;
    applyCreationFillPaintMode: ReturnType<typeof vi.fn>;
    applyCreationStrokePaintMode: ReturnType<typeof vi.fn>;
    applyCreationStrokeWidthDefault: ReturnType<typeof vi.fn>;
  };
  let drawingDefaults: DrawingStyleDefaultsService;

  beforeEach(async () => {
    chromeApply = {
      applyCreationFillDefault: vi.fn(),
      applyCreationStrokeDefault: vi.fn(),
      applyCreationFillPaintMode: vi.fn(),
      applyCreationStrokePaintMode: vi.fn(),
      applyCreationStrokeWidthDefault: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [CreationPaintDefaultsComponent],
      providers: [
        DrawingStyleDefaultsService,
        { provide: ChromeEditorApplyService, useValue: chromeApply }
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

  it('fill color change calls creation-only apply', () => {
    fixture.componentInstance.onFillChange('#ff00aa');
    expect(chromeApply.applyCreationFillDefault).toHaveBeenCalledWith('#ff00aa');
    expect(chromeApply.applyCreationStrokeDefault).not.toHaveBeenCalled();
  });

  it('stroke color change calls creation-only apply', () => {
    fixture.componentInstance.onStrokeChange('#00aaff');
    expect(chromeApply.applyCreationStrokeDefault).toHaveBeenCalledWith('#00aaff');
  });

  it('solid and none paint mode changes call creation-only apply', () => {
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
  });

  it('reports empty fill/stroke for none', () => {
    drawingDefaults.setDefaults({ ...BASE_DRAWING_STYLE_DEFAULTS, fill: 'none', stroke: 'none' });
    fixture.detectChanges();
    expect(fixture.componentInstance.fillEmpty()).toBe(true);
    expect(fixture.componentInstance.strokeEmpty()).toBe(true);
    expect(fixture.componentInstance.fillMode()).toBe('none');
  });
});
