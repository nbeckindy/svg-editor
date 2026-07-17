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
    applyCreationStrokeWidthDefault: ReturnType<typeof vi.fn>;
  };
  let drawingDefaults: DrawingStyleDefaultsService;

  beforeEach(async () => {
    chromeApply = {
      applyCreationFillDefault: vi.fn(),
      applyCreationStrokeDefault: vi.fn(),
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

  it('renders fill and stroke-width controls without stroke color', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="creation-paint-defaults"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-default-fill"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="creation-default-stroke"]')).toBeNull();
    expect(el.querySelector('[data-testid="creation-default-stroke-width"]')).toBeTruthy();
  });

  it('stroke width input reflects drawing defaults', () => {
    drawingDefaults.updateDefaults({ strokeWidth: 5.5 });
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="creation-default-stroke-width"]'
    ) as HTMLInputElement;
    expect(input.value).toBe('5.5');
  });

  it('fill color change calls creation-only apply', () => {
    fixture.componentInstance.onFillChange('#ff00aa');
    expect(chromeApply.applyCreationFillDefault).toHaveBeenCalledWith('#ff00aa');
    expect(chromeApply.applyCreationStrokeDefault).not.toHaveBeenCalled();
  });

  it('stroke width change calls creation-only apply', () => {
    const input = document.createElement('input');
    input.value = '3';
    fixture.componentInstance.onStrokeWidthChange({ target: input } as unknown as Event);
    expect(chromeApply.applyCreationStrokeWidthDefault).toHaveBeenCalledWith(3);
  });

  it('reports empty fill for none', () => {
    drawingDefaults.setDefaults({ ...BASE_DRAWING_STYLE_DEFAULTS, fill: 'none', stroke: 'none' });
    fixture.detectChanges();
    expect(fixture.componentInstance.fillEmpty()).toBe(true);
  });
});
