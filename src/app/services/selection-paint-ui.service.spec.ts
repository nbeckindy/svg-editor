import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectionPaintUiService } from './selection-paint-ui.service';
import { ShapeSelectionService } from './shape-selection.service';
import { ChromeEditorApplyService } from './chrome-editor-apply.service';
import { DrawingStyleDefaultsService } from './drawing-style-defaults.service';
import { GRADIENT_FILL_EDITOR_SVG_PORT, LAYER_LOCK_READ_PORT } from './manipulation-port-tokens';
import type { ShapeProperties } from '../models/shape-properties.interface';

describe('SelectionPaintUiService', () => {
  let service: SelectionPaintUiService;
  let selectedShapes: ReturnType<typeof signal<ShapeProperties[]>>;

  beforeEach(() => {
    selectedShapes = signal<ShapeProperties[]>([]);
    TestBed.configureTestingModule({
      providers: [
        SelectionPaintUiService,
        {
          provide: ShapeSelectionService,
          useValue: {
            selectedShapes,
            selectedShape: computed(() => selectedShapes()[0] ?? null),
            selectionCount: computed(() => selectedShapes().length),
            getSelectedShapes: () => selectedShapes()
          }
        },
        {
          provide: ChromeEditorApplyService,
          useValue: {
            applyFillColor: vi.fn(),
            applyStrokeColor: vi.fn(),
            applyStrokeWidth: vi.fn(),
            applyOpacity: vi.fn(),
            applyFillOpacity: vi.fn(),
            applyStrokeOpacity: vi.fn(),
            applyStrokeDasharray: vi.fn(),
            applyStrokeDashoffset: vi.fn(),
            applyPaintModeFromChrome: vi.fn()
          }
        },
        {
          provide: DrawingStyleDefaultsService,
          useValue: {
            fill: computed(() => '#000000'),
            stroke: computed(() => '#000000')
          }
        },
        {
          provide: GRADIENT_FILL_EDITOR_SVG_PORT,
          useValue: { readEditableGradientModelById: vi.fn(() => null) }
        },
        {
          provide: LAYER_LOCK_READ_PORT,
          useValue: { isElementOrAncestorLocked: () => false }
        }
      ]
    });
    service = TestBed.inject(SelectionPaintUiService);
  });

  it('maps paint source kinds to short labels', () => {
    expect(service.paintSourceText({ kind: 'inline-style' })).toBe('Inline style');
    expect(service.paintSourceText({ kind: 'presentation-attr' })).toBe('On this shape');
    expect(service.paintSourceText({ kind: 'class-or-stylesheet' })).toBe('From CSS class or stylesheet');
    expect(service.paintSourceText({ kind: 'inherited' })).toBe('From parent');
    expect(service.paintSourceText({ kind: 'default' })).toBe('Default');
    expect(service.paintSourceText({ kind: 'unknown' })).toBe('Unknown');
    expect(service.paintSourceText(undefined)).toBe('Unknown');
  });

  it('detects fill/stroke presence', () => {
    expect(service.hasFillColor({ id: 'a', type: 'rect' })).toBe(false);
    expect(service.hasFillColor({ id: 'a', type: 'rect', fill: 'none' })).toBe(false);
    expect(service.hasFillColor({ id: 'a', type: 'rect', fill: '#ff0000' })).toBe(true);
    expect(service.hasStrokeColor({ id: 'a', type: 'rect', stroke: 'none' })).toBe(false);
    expect(service.hasStrokeColor({ id: 'a', type: 'rect', stroke: '#000000' })).toBe(true);
  });

  it('reports fillMixed when selected shapes disagree', () => {
    selectedShapes.set([
      { id: 'a', type: 'rect', fill: '#ff0000' },
      { id: 'b', type: 'rect', fill: '#00ff00' }
    ]);
    expect(service.fillMixed()).toBe(true);
  });

  it('reports fillOpacitiesMixed and strokeOpacitiesMixed when values disagree', () => {
    selectedShapes.set([
      { id: 'a', type: 'rect', fillOpacity: 0.2, strokeOpacity: 0.5 },
      { id: 'b', type: 'rect', fillOpacity: 0.9, strokeOpacity: 0.5 }
    ]);
    expect(service.fillOpacitiesMixed()).toBe(true);
    expect(service.strokeOpacitiesMixed()).toBe(false);

    selectedShapes.set([
      { id: 'a', type: 'rect', fillOpacity: 1, strokeOpacity: 0.2 },
      { id: 'b', type: 'rect', fillOpacity: 1, strokeOpacity: 0.8 }
    ]);
    expect(service.fillOpacitiesMixed()).toBe(false);
    expect(service.strokeOpacitiesMixed()).toBe(true);
  });

  it('routes fill and stroke opacity changes through chrome apply', () => {
    const chrome = TestBed.inject(ChromeEditorApplyService) as unknown as {
      applyFillOpacity: ReturnType<typeof vi.fn>;
      applyStrokeOpacity: ReturnType<typeof vi.fn>;
    };
    selectedShapes.set([{ id: 'a', type: 'rect', fillOpacity: 1, strokeOpacity: 1 }]);
    service.onFillOpacityChange({ target: { value: '0.4' } } as unknown as Event);
    service.onStrokeOpacityChange({ target: { value: '0.7' } } as unknown as Event);
    expect(chrome.applyFillOpacity).toHaveBeenCalledWith(0.4);
    expect(chrome.applyStrokeOpacity).toHaveBeenCalledWith(0.7);
  });

  it('disables gradient modes for multi-select', () => {
    selectedShapes.set([
      { id: 'a', type: 'rect', fill: '#000000' },
      { id: 'b', type: 'rect', fill: '#000000' }
    ]);
    expect(service.fillGradientModesDisabled()).toBe(true);
    expect(service.strokeGradientModesDisabled()).toBe(true);
  });

  it('returns none fill swatch mode after gradient fill cleared', () => {
    expect(
      service.fillSwatchMode({
        id: 'shape-1',
        type: 'rect',
        fillPaintType: 'none',
        fillUrl: undefined
      } as ShapeProperties)
    ).toBe('none');
  });

  it('treats gradient fill as having paint so empty swatch is false', () => {
    const shape = {
      id: 'shape-1',
      type: 'rect',
      fillPaintType: 'gradient',
      fillUrl: 'url(#g1)',
      fill: undefined
    } as ShapeProperties;
    expect(service.hasFillColor(shape)).toBe(true);
    expect(service.allSelectedLackFill(shape)).toBe(false);
    expect(service.fillSwatchMode(shape)).toBe('linear');
  });

  it('parses paint def ids from url()', () => {
    expect(service.paintDefIdFromUrl('url(#myGrad)')).toBe('myGrad');
    expect(service.paintDefIdFromUrl(undefined)).toBeNull();
  });
});
