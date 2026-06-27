import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { BooleanPathPanelComponent } from './boolean-path-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { PathBooleanPreviewService } from '../../services/path-boolean-preview.service';
import { PathBooleanSelectionReadService } from '../../services/path-boolean-selection-read.service';
import { ShapeProperties } from '../../models/shape-properties.interface';

describe('BooleanPathPanelComponent', () => {
  let fixture: ComponentFixture<BooleanPathPanelComponent>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let currentTool: WritableSignal<string>;
  let applyPathBoolean: ReturnType<typeof vi.fn>;
  let applyPathCompound: ReturnType<typeof vi.fn>;
  let applyOutlineToPath: ReturnType<typeof vi.fn>;
  let previewService: PathBooleanPreviewService;

  beforeEach(async () => {
    selectedShapes = signal<ShapeProperties[]>([]);
    currentTool = signal('selector');
    applyPathBoolean = vi.fn();
    applyPathCompound = vi.fn();
    applyOutlineToPath = vi.fn();

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
          provide: PathBooleanSelectionReadService,
          useValue: {
            isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
            getPathD: vi.fn((id: string) => {
              const shape = selectedShapes().find((s) => s.id === id);
              if (!shape || shape.type !== 'path') return null;
              return 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
            }),
            getCompoundOperandElement: vi.fn((id: string) => {
              const shape = selectedShapes().find((s) => s.id === id);
              if (!shape) return null;
              if (shape.type === 'rect') {
                return {
                  tagName: 'rect',
                  getAttribute: (attr: string) => {
                    const attrs: Record<string, string> = {
                      x: '0',
                      y: '0',
                      width: '10',
                      height: '10'
                    };
                    return attrs[attr] ?? null;
                  }
                } as Element;
              }
              return {
                tagName: 'path',
                getAttribute: (attr: string) =>
                  attr === 'd' ? 'M 0 0 L 10 0 L 10 10 L 0 10 Z' : null
              } as Element;
            }),
            getOutlineToPathElement: vi.fn((id: string) => {
              const shape = selectedShapes().find((s) => s.id === id);
              if (!shape || shape.type !== 'rect') return null;
              return {
                tagName: 'rect',
                getAttribute: (attr: string) => {
                  const attrs: Record<string, string> = {
                    id,
                    x: '0',
                    y: '0',
                    width: '10',
                    height: '10'
                  };
                  return attrs[attr] ?? null;
                },
                hasAttribute: (attr: string) => attr in { id: true, x: true, y: true, width: true, height: true }
              } as Element;
            })
          }
        },
        {
          provide: ChromeEditorApplyService,
          useValue: { applyPathBoolean, applyPathCompound, applyOutlineToPath }
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

  it('compound applies immediately without preview', () => {
    selectedShapes.set([
      { id: 'path-a', type: 'path' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="path-ops-compound"]') as HTMLButtonElement).click();
    expect(applyPathCompound).toHaveBeenCalledWith(['path-a', 'path-b']);
    expect(applyPathBoolean).not.toHaveBeenCalled();
    expect(previewService.previewOp()).toBeNull();
  });

  it('compound enables for two rectangles', () => {
    selectedShapes.set([
      { id: 'rect-a', type: 'rect' } as ShapeProperties,
      { id: 'rect-b', type: 'rect' } as ShapeProperties
    ]);
    fixture.detectChanges();

    const compoundBtn = fixture.nativeElement.querySelector('[data-testid="path-ops-compound"]') as HTMLButtonElement;
    expect(compoundBtn.disabled).toBe(false);
    compoundBtn.click();
    expect(applyPathCompound).toHaveBeenCalledWith(['rect-a', 'rect-b']);
  });

  it('boolean union enables for rect and path selection', () => {
    selectedShapes.set([
      { id: 'rect-a', type: 'rect' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    const unionBtn = fixture.nativeElement.querySelector('[data-testid="path-ops-union"]') as HTMLButtonElement;
    expect(unionBtn.disabled).toBe(false);
    unionBtn.click();
    expect(applyPathBoolean).not.toHaveBeenCalled();
    expect(previewService.previewOp()).toBe('union');
  });

  it('outline to path applies for a single rectangle', () => {
    selectedShapes.set([{ id: 'rect-a', type: 'rect' } as ShapeProperties]);
    fixture.detectChanges();

    const outlineBtn = fixture.nativeElement.querySelector('[data-testid="path-ops-outline"]') as HTMLButtonElement;
    expect(outlineBtn.disabled).toBe(false);
    outlineBtn.click();

    expect(applyOutlineToPath).toHaveBeenCalledWith('rect-a');
  });
});
