import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreationPaintDefaultsComponent } from './creation-paint-defaults.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from '../../services/drawing-style-defaults.service';
import { BASE_DRAWING_STYLE_DEFAULTS } from '../../models/drawing-style-defaults';
import { defaultLinearGradientModel } from '../../models/svg-gradient';

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

  it('fill color change calls creation-only apply', () => {
    fixture.componentInstance.onFillChange('#ff00aa');
    expect(chromeApply.applyCreationFillDefault).toHaveBeenCalledWith('#ff00aa');
    expect(chromeApply.applyCreationStrokeDefault).not.toHaveBeenCalled();
  });

  it('stroke color change calls creation-only apply', () => {
    fixture.componentInstance.onStrokeChange('#00aaff');
    expect(chromeApply.applyCreationStrokeDefault).toHaveBeenCalledWith('#00aaff');
  });

  it('paint mode change calls creation-only apply', () => {
    fixture.componentInstance.onFillPaintModeChange('linear');
    expect(chromeApply.applyCreationFillPaintMode).toHaveBeenCalledWith('linear');
    fixture.componentInstance.onStrokePaintModeChange('none');
    expect(chromeApply.applyCreationStrokePaintMode).toHaveBeenCalledWith('none');
  });

  it('reports empty fill/stroke for none', () => {
    drawingDefaults.setDefaults({ ...BASE_DRAWING_STYLE_DEFAULTS, fill: 'none', stroke: 'none' });
    fixture.detectChanges();
    expect(fixture.componentInstance.fillEmpty()).toBe(true);
    expect(fixture.componentInstance.strokeEmpty()).toBe(true);
    expect(fixture.componentInstance.fillMode()).toBe('none');
  });

  it('shows gradient mode and preview when fillGradient is set', () => {
    const model = defaultLinearGradientModel('creation-fill-grad', '#ff0000', '#0000ff');
    drawingDefaults.setDefaults({
      ...BASE_DRAWING_STYLE_DEFAULTS,
      fill: '#ff0000',
      fillGradient: model
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.fillMode()).toBe('linear');
    expect(fixture.componentInstance.fillEmpty()).toBe(false);
    const swatch = fixture.nativeElement.querySelector('.psp-swatch-gradient') as HTMLElement;
    expect(swatch).toBeTruthy();
    expect(swatch.style.backgroundImage).toContain('linear-gradient');
    expect(fixture.nativeElement.querySelector('[data-testid="paint-swatch-popover-empty-icon"]')).toBeNull();
  });
});
