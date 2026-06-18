import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { BooleanPathPanelComponent } from './boolean-path-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { EditorToolService } from '../../services/editor-tool.service';
import { SvgManipulationService } from '../../services/svg-manipulation.service';
import { ChromeEditorApplyService } from '../../services/chrome-editor-apply.service';
import { ShapeProperties } from '../../models/shape-properties.interface';

describe('BooleanPathPanelComponent', () => {
  let fixture: ComponentFixture<BooleanPathPanelComponent>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let currentTool: WritableSignal<string>;
  let applyPathBoolean: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    selectedShapes = signal<ShapeProperties[]>([]);
    currentTool = signal('selector');
    applyPathBoolean = vi.fn();

    await TestBed.configureTestingModule({
      imports: [BooleanPathPanelComponent],
      providers: [
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
          provide: ChromeEditorApplyService,
          useValue: {
            applyPathBooleanUnion: (ids: string[]) => applyPathBoolean('union', ids),
            applyPathBooleanSubtract: (ids: string[]) => applyPathBoolean('subtract', ids),
            applyPathBooleanIntersect: (ids: string[]) => applyPathBoolean('intersect', ids)
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BooleanPathPanelComponent);
    fixture.detectChanges();
  });

  it('shows empty hint when fewer than two paths are selected', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-empty-hint"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-union"]')?.disabled).toBe(true);
  });

  it('lists operands and enables union for two closed paths', () => {
    selectedShapes.set([
      { id: 'path-a', type: 'path' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-operand-list"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="path-ops-operand-path-a"]')).toBeTruthy();
    const unionBtn = fixture.nativeElement.querySelector('[data-testid="path-ops-union"]') as HTMLButtonElement;
    expect(unionBtn.disabled).toBe(false);

    unionBtn.click();
    expect(applyPathBoolean).toHaveBeenCalledWith('union', ['path-a', 'path-b']);
  });

  it('wires subtract and intersect buttons', () => {
    selectedShapes.set([
      { id: 'path-a', type: 'path' } as ShapeProperties,
      { id: 'path-b', type: 'path' } as ShapeProperties
    ]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[data-testid="path-ops-subtract"]') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('[data-testid="path-ops-intersect"]') as HTMLButtonElement).click();
    expect(applyPathBoolean).toHaveBeenCalledWith('subtract', ['path-a', 'path-b']);
    expect(applyPathBoolean).toHaveBeenCalledWith('intersect', ['path-a', 'path-b']);
  });
});
