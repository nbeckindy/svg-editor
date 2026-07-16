import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlignDistributePanelComponent } from './align-distribute-panel.component';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { LAYER_LOCK_READ_PORT } from '../../services/manipulation-port-tokens';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import type { ShapeProperties } from '../../models/shape-properties.interface';

describe('AlignDistributePanelComponent', () => {
  let fixture: ComponentFixture<AlignDistributePanelComponent>;
  let selectedShapes: ReturnType<typeof signal<ShapeProperties[]>>;
  let currentTool: ReturnType<typeof signal<'selector' | 'pen'>>;
  let chromeApply: { applyAlignFromChrome: ReturnType<typeof vi.fn>; applyDistributeFromChrome: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    selectedShapes = signal<ShapeProperties[]>([]);
    currentTool = signal<'selector' | 'pen'>('selector');
    chromeApply = {
      applyAlignFromChrome: vi.fn(),
      applyDistributeFromChrome: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [AlignDistributePanelComponent],
      providers: [
        {
          provide: ShapeSelectionService,
          useValue: {
            selectedShapes,
            selectionCount: computed(() => selectedShapes().length),
            getSelectedShapes: () => selectedShapes()
          }
        },
        {
          provide: EditorToolService,
          useValue: {
            currentTool
          }
        },
        { provide: ChromeEditorApplyService, useValue: chromeApply },
        {
          provide: LAYER_LOCK_READ_PORT,
          useValue: { isElementOrAncestorLocked: () => false }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AlignDistributePanelComponent);
    fixture.detectChanges();
  });

  it('shows empty hint when nothing is selected', () => {
    expect(fixture.nativeElement.textContent).toContain('Select two or more shapes');
  });

  it('enables align when two shapes are selected and calls chrome apply', () => {
    selectedShapes.set([
      { id: 'a', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 },
      { id: 'b', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 }
    ]);
    fixture.detectChanges();

    const left = fixture.nativeElement.querySelector('[data-testid="align-left"]') as HTMLButtonElement;
    expect(left.disabled).toBe(false);
    left.click();
    expect(chromeApply.applyAlignFromChrome).toHaveBeenCalledWith('left', ['a', 'b']);
  });

  it('disables align for a single selection and distribute until three shapes', () => {
    selectedShapes.set([
      { id: 'a', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 }
    ]);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('[data-testid="align-left"]') as HTMLButtonElement).disabled
    ).toBe(true);

    selectedShapes.set([
      { id: 'a', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 },
      { id: 'b', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 },
      { id: 'c', type: 'rect', fill: '#000', stroke: 'none', strokeWidth: 0, opacity: 1 }
    ]);
    fixture.detectChanges();
    const dist = fixture.nativeElement.querySelector(
      '[data-testid="distribute-horizontal"]'
    ) as HTMLButtonElement;
    expect(dist.disabled).toBe(false);
    dist.click();
    expect(chromeApply.applyDistributeFromChrome).toHaveBeenCalledWith('horizontal', ['a', 'b', 'c']);
  });
});
