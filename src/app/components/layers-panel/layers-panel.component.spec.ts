import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { vi } from 'vitest';
import { flushMdiSvgIfPending, mdiIconHttpTestProviders, registerMdiSvgIconSetForTests } from '../../testing/mdi-icon-testing';
import { LayersPanelComponent } from './layers-panel.component';
import { ShapeSelectionService } from '../../services/shape-selection.service';
import { LayerTreeNode, SvgManipulationService } from '../../services/svg-manipulation.service';
import { EditorHistoryService } from '../../services/editor-history.service';
import { ShapeProperties } from '../../models/shape-properties.interface';
import {
  ToggleVisibilityCommand,
  ToggleLayerLockCommand,
  ReorderCommand,
  GroupCommand,
  UngroupCommand,
  UngroupElementsCommand
} from '../../models/editor-commands';

describe('LayersPanelComponent', () => {
  let fixture: ComponentFixture<LayersPanelComponent>;
  let documentRevision: WritableSignal<number>;
  let selectedShapes: WritableSignal<ShapeProperties[]>;
  let getLayerTree: ReturnType<typeof vi.fn>;
  let selectShapes: ReturnType<typeof vi.fn>;
  let toggleShapeGroupInSelection: ReturnType<typeof vi.fn>;
  let clearSelection: ReturnType<typeof vi.fn>;
  let getSVGInstance: ReturnType<typeof vi.fn>;
  let getShapeProperties: ReturnType<typeof vi.fn>;
  let getShapePropertiesInSameClipGroup: ReturnType<typeof vi.fn>;
  let pushAndExecute: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    documentRevision = signal(0);
    selectedShapes = signal<ShapeProperties[]>([]);
    getLayerTree = vi.fn<() => LayerTreeNode[]>(() => []);
    selectShapes = vi.fn();
    toggleShapeGroupInSelection = vi.fn();
    clearSelection = vi.fn();
    getShapeProperties = vi.fn((el: any) => ({ id: el.id(), type: el.type }));
    getShapePropertiesInSameClipGroup = vi.fn(() => []);
    getSVGInstance = vi.fn(() => ({ findOne: vi.fn() }));
    pushAndExecute = vi.fn();

    await TestBed.configureTestingModule({
      imports: [LayersPanelComponent],
      providers: [
        ...mdiIconHttpTestProviders,
        {
          provide: SvgManipulationService,
          useValue: {
            documentRevision,
            getLayerTree,
            getSVGInstance,
            getShapeProperties,
            getShapePropertiesInSameClipGroup,
            isElementOrAncestorLocked: vi.fn().mockReturnValue(false),
            isElementDirectLocked: vi.fn().mockReturnValue(false),
            setLayerLocked: vi.fn(),
            moveElementBeforeNextSibling: vi.fn().mockReturnValue(true)
          }
        },
        {
          provide: ShapeSelectionService,
          useValue: { selectedShapes, selectShapes, toggleShapeGroupInSelection, clearSelection }
        },
        {
          provide: EditorHistoryService,
          useValue: { pushAndExecute }
        }
      ]
    }).compileComponents();

    registerMdiSvgIconSetForTests();

    fixture = TestBed.createComponent(LayersPanelComponent);
  });

  afterEach(() => {
    flushMdiSvgIfPending();
    TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true });
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
    getLayerTree.mockReturnValue([
      {
        id: 'shape-back',
        type: 'rect',
        name: 'shape-back',
        visible: true,
        locked: false,
        elementMarkup: '<rect id="shape-back" x="0" y="0" width="10" height="10" />'
      },
      {
        id: 'shape-front',
        type: 'circle',
        name: 'shape-front',
        visible: true,
        locked: false,
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
    getLayerTree.mockReturnValue([
      { id: 'shape-a', type: 'path', name: 'shape-a', visible: true,
        locked: false, elementMarkup: '<path id="shape-a" d="M0 0 L5 5" />' },
      { id: 'shape-b', type: 'rect', name: 'shape-b', visible: true,
        locked: false, elementMarkup: '<rect id="shape-b" x="0" y="0" width="5" height="5" />' }
    ]);
    selectedShapes.set([{ id: 'shape-a', type: 'path' }, { id: 'shape-b', type: 'rect' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const selectedRows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row.selected');
    expect(selectedRows.length).toBe(2);
  });

  it('replaces selection with clip-group members when layer row is clicked', () => {
    const findOne = vi.fn((selector: string) => {
      if (selector === '#shape-a') {
        return { id: () => 'shape-a', type: 'path', attr: vi.fn(() => null) };
      }
      return null;
    });
    getSVGInstance.mockReturnValue({ findOne });
    getShapePropertiesInSameClipGroup.mockReturnValue([
      { id: 'shape-a', type: 'path' },
      { id: 'shape-b', type: 'rect' }
    ]);
    getLayerTree.mockReturnValue([
      { id: 'shape-a', type: 'path', name: 'shape-a', visible: true,
        locked: false, elementMarkup: '<path id="shape-a" d="M0 0 L5 5" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('.layer-row') as HTMLButtonElement;
    row.click();

    expect(findOne).toHaveBeenCalledWith('#shape-a');
    expect(selectShapes).toHaveBeenCalledWith([
      { id: 'shape-a', type: 'path' },
      { id: 'shape-b', type: 'rect' }
    ]);
  });

  it('toggle-merges selection when modifier click is used on a layer row', () => {
    const findOne = vi.fn((selector: string) => {
      if (selector === '#shape-a') {
        return { id: () => 'shape-a', type: 'path', attr: vi.fn(() => null) };
      }
      return null;
    });
    getSVGInstance.mockReturnValue({ findOne });
    getShapePropertiesInSameClipGroup.mockReturnValue([{ id: 'shape-a', type: 'path' }]);
    getLayerTree.mockReturnValue([
      { id: 'shape-a', type: 'path', name: 'shape-a', visible: true,
        locked: false, elementMarkup: '<path id="shape-a" d="M0 0 L5 5" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('.layer-row') as HTMLButtonElement;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    expect(toggleShapeGroupInSelection).toHaveBeenCalledWith([{ id: 'shape-a', type: 'path' }]);
    expect(selectShapes).not.toHaveBeenCalled();
  });

  it('shows group rows with chevron for expand/collapse', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'group-1', type: 'g', name: 'group-1', visible: true,
        locked: false,
        elementMarkup: '<g id="group-1"><circle id="child-1" /></g>',
        children: [
          { id: 'child-1', type: 'circle', name: 'child-1', visible: true,
        locked: false, elementMarkup: '<circle id="child-1" />' }
        ]
      }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const groupRow = (fixture.nativeElement as HTMLElement).querySelector('.group-row');
    expect(groupRow).toBeTruthy();
    const chevron = groupRow!.querySelector('.group-chevron');
    expect(chevron).toBeTruthy();
    expect(chevron!.textContent).toContain('▶');
  });

  it('collapsed groups hide their children', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'group-1', type: 'g', name: 'group-1', visible: true,
        locked: false,
        elementMarkup: '<g id="group-1"><circle id="child-1" /></g>',
        children: [
          { id: 'child-1', type: 'circle', name: 'child-1', visible: true,
        locked: false, elementMarkup: '<circle id="child-1" />' }
        ]
      }
    ]);
    documentRevision.set(1);
    fixture.componentInstance.collapsedGroups.set(new Set(['group-1']));
    fixture.detectChanges();

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('group-1');
  });

  it('toggling group expand/collapse works', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'group-1', type: 'g', name: 'group-1', visible: true,
        locked: false,
        elementMarkup: '<g id="group-1"><circle id="child-1" /></g>',
        children: [
          { id: 'child-1', type: 'circle', name: 'child-1', visible: true,
        locked: false, elementMarkup: '<circle id="child-1" />' }
        ]
      }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    let rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row');
    expect(rows.length).toBe(2);

    const chevron = (fixture.nativeElement as HTMLElement).querySelector('.group-chevron') as HTMLElement;
    chevron.click();
    fixture.detectChanges();

    rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row');
    expect(rows.length).toBe(1);

    const chevronAgain = (fixture.nativeElement as HTMLElement).querySelector('.group-chevron') as HTMLElement;
    chevronAgain.click();
    fixture.detectChanges();

    rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row');
    expect(rows.length).toBe(2);
  });

  it('visibility toggle button dispatches ToggleVisibilityCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const visBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-visibility-rect-1"]') as HTMLButtonElement;
    visBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ToggleVisibilityCommand);
  });

  it('lock toggle button dispatches ToggleLayerLockCommand', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'rect-1',
        type: 'rect',
        name: 'rect-1',
        visible: true,
        locked: false,
        elementMarkup: '<rect id="rect-1" />'
      }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const lockBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="layer-lock-rect-1"]'
    ) as HTMLButtonElement;
    lockBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ToggleLayerLockCommand);
  });

  it('reorder forward button dispatches ReorderCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const fwdBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-forward-rect-1"]') as HTMLButtonElement;
    fwdBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderCommand);
  });

  it('reorder backward button dispatches ReorderCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const bwdBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-backward-rect-1"]') as HTMLButtonElement;
    bwdBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderCommand);
  });

  it('bring to front button dispatches ReorderCommand with front direction', () => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.id = 'rect-1';
    const parent = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    parent.appendChild(node);
    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => (sel === '#rect-1' ? { node } : null))
    });
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const btn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-to-front-rect-1"]') as HTMLButtonElement;
    btn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = pushAndExecute.mock.calls[0][0] as ReorderCommand;
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd.description).toContain('front');
  });

  it('send to back button dispatches ReorderCommand with back direction', () => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.id = 'rect-1';
    const parent = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    parent.appendChild(node);
    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => (sel === '#rect-1' ? { node } : null))
    });
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const btn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-to-back-rect-1"]') as HTMLButtonElement;
    btn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = pushAndExecute.mock.calls[0][0] as ReorderCommand;
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd.description).toContain('back');
  });

  it('group button is disabled when < 2 shapes selected', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    selectedShapes.set([{ id: 'rect-1', type: 'rect' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const groupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-group-btn"]') as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(true);
  });

  it('group button groups selected shapes via GroupCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' },
      { id: 'circle-1', type: 'circle', name: 'circle-1', visible: true,
        locked: false, elementMarkup: '<circle id="circle-1" />' }
    ]);
    selectedShapes.set([
      { id: 'rect-1', type: 'rect' },
      { id: 'circle-1', type: 'circle' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const groupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-group-btn"]') as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(false);
    groupBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(GroupCommand);
  });

  it('ungroup button is disabled when no group is selected', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    selectedShapes.set([{ id: 'rect-1', type: 'rect' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const ungroupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-ungroup-btn"]') as HTMLButtonElement;
    expect(ungroupBtn.disabled).toBe(true);
  });

  it('ungroup button is enabled when two groups are selected', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'g1', type: 'g', name: 'g1', visible: true,
        locked: false,
        elementMarkup: '<g id="g1"></g>', children: []
      },
      {
        id: 'g2', type: 'g', name: 'g2', visible: true,
        locked: false,
        elementMarkup: '<g id="g2"></g>', children: []
      }
    ]);
    selectedShapes.set([{ id: 'g1', type: 'g' }, { id: 'g2', type: 'g' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const ungroupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-ungroup-btn"]') as HTMLButtonElement;
    expect(ungroupBtn.disabled).toBe(false);
  });

  it('ungroup button dispatches UngroupCommand and selects freed children', () => {
    const childEl = { id: () => 'child-1', type: 'circle' };
    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '#group-1') {
          return { node: { children: [{ id: 'child-1' }] } };
        }
        if (sel === '#child-1') return childEl;
        return null;
      })
    });
    getLayerTree.mockReturnValue([
      {
        id: 'group-1', type: 'g', name: 'group-1', visible: true,
        locked: false,
        elementMarkup: '<g id="group-1"><circle id="child-1" /></g>',
        children: [
          { id: 'child-1', type: 'circle', name: 'child-1', visible: true,
        locked: false, elementMarkup: '<circle id="child-1" />' }
        ]
      }
    ]);
    selectedShapes.set([{ id: 'group-1', type: 'g' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const ungroupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-ungroup-btn"]') as HTMLButtonElement;
    expect(ungroupBtn.disabled).toBe(false);
    ungroupBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(UngroupCommand);
    expect(selectShapes).toHaveBeenCalledWith([{ id: 'child-1', type: 'circle' }]);
  });

  it('ungroup button dispatches UngroupElementsCommand when two groups are selected', () => {
    const mockSvg = {
      findOne: vi.fn((sel: string) => {
        if (sel === '#g1') return { node: { children: [{ id: 'a' }] } };
        if (sel === '#g2') return { node: { children: [{ id: 'b' }] } };
        if (sel === '#a') return { id: () => 'a', type: 'rect' };
        if (sel === '#b') return { id: () => 'b', type: 'rect' };
        return null;
      })
    };
    getSVGInstance.mockReturnValue(mockSvg);

    getLayerTree.mockReturnValue([
      { id: 'g1', type: 'g', name: 'g1', visible: true,
        locked: false, elementMarkup: '<g id="g1"/>', children: [] },
      { id: 'g2', type: 'g', name: 'g2', visible: true,
        locked: false, elementMarkup: '<g id="g2"/>', children: [] }
    ]);
    selectedShapes.set([
      { id: 'g1', type: 'g' },
      { id: 'g2', type: 'g' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    pushAndExecute.mockImplementation((cmd: { execute(): void }) => {
      cmd.execute();
    });
    const stubSvc = TestBed.inject(SvgManipulationService) as unknown as {
      ungroupElements: (ids: string[]) => { allChildElementIds: string[]; undoSnapshots: string[][] };
    };
    stubSvc.ungroupElements = vi.fn().mockReturnValue({
      allChildElementIds: ['a', 'b'],
      undoSnapshots: [['a'], ['b']]
    });

    const ungroupBtn = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layers-ungroup-btn"]') as HTMLButtonElement;
    ungroupBtn.click();

    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(UngroupElementsCommand);
    expect(selectShapes).toHaveBeenCalled();
  });

  it('hidden layers have .hidden-layer class', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: false, locked: false, elementMarkup: '<rect id="rect-1" />' },
      { id: 'rect-2', type: 'rect', name: 'rect-2', visible: true,
        locked: false, elementMarkup: '<rect id="rect-2" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const hiddenRows = (fixture.nativeElement as HTMLElement).querySelectorAll('.layer-row.hidden-layer');
    expect(hiddenRows.length).toBe(1);
    expect(hiddenRows[0].getAttribute('data-testid')).toBe('layer-row-rect-1');
  });

  it('indentation increases with depth', () => {
    getLayerTree.mockReturnValue([
      {
        id: 'group-1', type: 'g', name: 'group-1', visible: true,
        locked: false,
        elementMarkup: '<g id="group-1"><circle id="child-1" /></g>',
        children: [
          { id: 'child-1', type: 'circle', name: 'child-1', visible: true,
        locked: false, elementMarkup: '<circle id="child-1" />' }
        ]
      }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const groupRow = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-row-group-1"]') as HTMLElement;
    const childRow = (fixture.nativeElement as HTMLElement)
      .querySelector('[data-testid="layer-row-child-1"]') as HTMLElement;

    expect(groupRow.style.paddingLeft).toBe('12px');
    expect(childRow.style.paddingLeft).toBe('28px');
  });

  it('layer preview for <image> does not embed huge raster href in preview data URL', () => {
    const junk = 'z'.repeat(6000);
    const hugeHref = `data:image/png;base64,${junk}`;
    getLayerTree.mockReturnValue([
      {
        id: 'img-1',
        type: 'image',
        name: 'img-1',
        visible: true,
        locked: false,
        elementMarkup: `<image id="img-1" href="${hugeHref}" x="0" y="0" width="20" height="20" />`
      }
    ]);
    documentRevision.set(3);
    fixture.detectChanges();

    const preview = (fixture.nativeElement as HTMLElement).querySelector('.layer-preview') as HTMLImageElement | null;
    expect(preview).toBeTruthy();
    expect(preview!.src).not.toContain(junk);
    expect(preview!.src.length).toBeLessThan(8000);
  });
});
