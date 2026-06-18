import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { BooleanPathPanelComponent } from './boolean-path-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { PathBooleanPreviewService } from '../../services/path-boolean-preview.service';
import { PathBooleanGeometryService } from '../../services/path-boolean-geometry.service';
import { ShapeProperties } from '../../models/shape-properties.interface';

describe('BooleanPathPanelComponent', () => {
  let fixture: ComponentFixture<BooleanPathPanelComponent>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let currentTool: WritableSignal<string>;
  let applyPathBoolean: ReturnType<typeof vi.fn>;
  let previewService: PathBooleanPreviewService;

  beforeEach(async () => {
    selectedShapes = signal<ShapeProperties[]>([]);
    currentTool = signal('selector');
    applyPathBoolean = vi.fn();

    await TestBed.configureTestingModule({
      imports: [BooleanPathPanelComponent],
      providers: [
        PathBooleanPreviewService,
        {
          provide: ShapeSelectionService,
          useValue: {
            getSelectedShapes: () => selectedShapes(),
            selectedShapes
          }
        },
        {
          provide: EditorToolService,
          useValue: { currentTool }
        },
        {
          provide: SvgManipulationService,
          useValue: {
            isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
            getSVGInstance: vi.fn(() => ({
              findOne: vi.fn((sel: string) => {
                const id = sel.replace('#', '');
                const shape = selectedShapes().find((s) => s.id === id);
                if (!shape) return undefined;
                return {
                  node: {
                    getAttribute: (attr: string) =>
                      attr === 'd' ? 'M 0 0 L 10 0 L 10 10 L 0 10 Z' : null
                  }
                };
              })
            }))
          }
        },
        {
          provide: PathBooleanGeometryService,
          useValue: {
            createGeometryPort: () => ({}),
            unionLocalD: () => 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
            subtractLocalD: () => 'M 0 0 L 10 0 L 10 10 L 0 10 Z',
            intersectLocalD: () => 'M 0 0 L 10 0 L 10 10 L 0 10 Z'
          }
        },
        {
          provide: ChromeEditorApplyService,
          useValue: { applyPathBoolean }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BooleanPathPanelComponent);
    previewService = TestBed.inject(PathBooleanPreviewService);
    fixture.detectChanges();
  });

  it('shows empty hint when fewer than two paths are selected', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-empty-hint"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-union"]')?.disabled).toBe(true);
  });

  it('selects union preview then applies through chrome apply', () => {
    selectedShapes.set([
      { id: 'path-a', type: 'path' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    const unionBtn = fixture.nativeElement.querySelector('[data-testid="path-ops-union"]') as HTMLButtonElement;
    expect(unionBtn.disabled).toBe(false);
    unionBtn.click();
    fixture.detectChanges();

    expect(previewService.previewOp()).toBe('union');
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-apply"]')).toBeTruthy();

    (fixture.nativeElement.querySelector('[data-testid="path-ops-apply"]') as HTMLButtonElement).click();
    expect(applyPathBoolean).toHaveBeenCalledWith('union', ['path-a', 'path-b']);
    expect(previewService.previewOp()).toBeNull();
  });

  it('cancel clears preview without applying', () => {
    selectedShapes.set([
      { id: 'path-a', type: 'path' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="path-ops-intersect"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[data-testid="path-ops-cancel"]') as HTMLButtonElement).click();

    expect(applyPathBoolean).not.toHaveBeenCalled();
    expect(previewService.previewOp()).toBeNull();
  });
});
