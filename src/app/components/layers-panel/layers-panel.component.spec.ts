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
  UngroupElementsCommand,
  ReparentElementsCommand,
  ReorderBeforeSiblingCommand
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
            isUserGroupId: vi.fn(
              (id: string) => id.startsWith('g') || id.includes('group')
            ),
            isGroupClipMaskCarrier: vi.fn().mockReturnValue(false),
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

  it('context menu move forward dispatches ReorderCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    fixture.componentInstance.contextMenuLayerId.set('rect-1');
    fixture.componentInstance.onContextMenuMoveForward();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderCommand);
  });

  it('context menu move backward dispatches ReorderCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    fixture.componentInstance.contextMenuLayerId.set('rect-1');
    fixture.componentInstance.onContextMenuMoveBackward();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderCommand);
  });

  it('context menu bring to front dispatches ReorderCommand with front direction', () => {
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

    fixture.componentInstance.contextMenuLayerId.set('rect-1');
    fixture.componentInstance.onContextMenuMoveToFront();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = pushAndExecute.mock.calls[0][0] as ReorderCommand;
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd.description).toContain('front');
  });

  it('context menu send to back dispatches ReorderCommand with back direction', () => {
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

    fixture.componentInstance.contextMenuLayerId.set('rect-1');
    fixture.componentInstance.onContextMenuMoveToBack();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = pushAndExecute.mock.calls[0][0] as ReorderCommand;
    expect(cmd).toBeInstanceOf(ReorderCommand);
    expect(cmd.description).toContain('back');
  });

  it('does not render per-row reorder buttons', () => {
    getLayerTree.mockReturnValue([
      { id: 'rect-1', type: 'rect', name: 'rect-1', visible: true,
        locked: false, elementMarkup: '<rect id="rect-1" />' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.reorder-controls')).toBeNull();
    expect(el.querySelector('[data-testid="layer-forward-rect-1"]')).toBeNull();
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

  it('add to group button is enabled with one group and other shapes', () => {
    getLayerTree.mockReturnValue([
      { id: 'g1', type: 'g', name: 'g1', visible: true, locked: false, elementMarkup: '<g id="g1"/>', children: [] },
      { id: 'r1', type: 'rect', name: 'r1', visible: true, locked: false, elementMarkup: '<rect id="r1"/>' }
    ]);
    selectedShapes.set([
      { id: 'g1', type: 'g' },
      { id: 'r1', type: 'rect' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="layers-add-to-group-btn"]'
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(false);
  });

  it('add to group button dispatches ReparentElementsCommand', () => {
    getLayerTree.mockReturnValue([
      { id: 'g1', type: 'g', name: 'g1', visible: true, locked: false, elementMarkup: '<g id="g1"/>', children: [] },
      { id: 'r1', type: 'rect', name: 'r1', visible: true, locked: false, elementMarkup: '<rect id="r1"/>' }
    ]);
    selectedShapes.set([
      { id: 'g1', type: 'g' },
      { id: 'r1', type: 'rect' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const addBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="layers-add-to-group-btn"]'
    ) as HTMLButtonElement;
    addBtn.click();

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReparentElementsCommand);
  });

  it('remove from group button is enabled when selection has a grouped shape', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    groupEl.id = 'g1';
    contentRoot.appendChild(groupEl);
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectEl.id = 'r1';
    groupEl.appendChild(rectEl);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#r1') return { node: rectEl };
        if (sel === '#g1') return { node: groupEl };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      {
        id: 'g1',
        type: 'g',
        name: 'g1',
        visible: true,
        locked: false,
        elementMarkup: '<g id="g1"><rect id="r1"/></g>',
        children: [
          { id: 'r1', type: 'rect', name: 'r1', visible: true, locked: false, elementMarkup: '<rect id="r1"/>' }
        ]
      }
    ]);
    selectedShapes.set([{ id: 'r1', type: 'rect' }]);
    documentRevision.set(1);
    fixture.detectChanges();

    const removeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="layers-remove-from-group-btn"]'
    ) as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(false);
  });

  it('drop on group row middle dispatches add-to-group reparent', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    groupEl.id = 'g1';
    contentRoot.appendChild(groupEl);
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectEl.id = 'r1';
    contentRoot.appendChild(rectEl);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#g1') return { node: groupEl };
        if (sel === '#r1') return { node: rectEl };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'g1', type: 'g', name: 'g1', visible: true, locked: false, elementMarkup: '<g id="g1"/>', children: [] },
      { id: 'r1', type: 'rect', name: 'r1', visible: true, locked: false, elementMarkup: '<rect id="r1"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const intent = fixture.componentInstance.resolveLayerDropIntent('r1', 'g1', 0.5);
    expect(intent.valid).toBe(true);
    expect(intent.zone).toBe('intoGroup');
    expect(intent.action).toEqual({ kind: 'addToGroup', targetGroupId: 'g1' });

    if (intent.valid && intent.action) {
      fixture.componentInstance['dnd'].executeDropAction('r1', intent.action);
    }

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    const cmd = pushAndExecute.mock.calls[0][0] as ReparentElementsCommand;
    expect(cmd).toBeInstanceOf(ReparentElementsCommand);
    expect(cmd.description).toBe('Add to group');
  });

  it('pull child out of group by dropping on root row resolves reparentToParent', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    groupEl.id = 'g1';
    contentRoot.appendChild(groupEl);
    const childEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    childEl.id = 'child-1';
    groupEl.appendChild(childEl);
    const rootRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rootRect.id = 'root-1';
    contentRoot.appendChild(rootRect);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#g1') return { node: groupEl };
        if (sel === '#child-1') return { node: childEl };
        if (sel === '#root-1') return { node: rootRect };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      {
        id: 'g1',
        type: 'g',
        name: 'g1',
        visible: true,
        locked: false,
        elementMarkup: '<g id="g1"><rect id="child-1"/></g>',
        children: [
          { id: 'child-1', type: 'rect', name: 'child-1', visible: true, locked: false, elementMarkup: '<rect id="child-1"/>' }
        ]
      },
      { id: 'root-1', type: 'rect', name: 'root-1', visible: true, locked: false, elementMarkup: '<rect id="root-1"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const intent = fixture.componentInstance.resolveLayerDropIntent('child-1', 'root-1', 0.2);
    expect(intent.valid).toBe(true);
    expect(intent.action?.kind).toBe('reparentToParent');
    if (intent.valid && intent.action) {
      fixture.componentInstance['dnd'].executeDropAction('child-1', intent.action);
    }
    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReparentElementsCommand);
  });

  it('same-parent drop resolves reorderBeforeSibling', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    a.id = 'a';
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b.id = 'b';
    contentRoot.appendChild(a);
    contentRoot.appendChild(b);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#a') return { node: a };
        if (sel === '#b') return { node: b };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'b', type: 'rect', name: 'b', visible: true, locked: false, elementMarkup: '<rect id="b"/>' },
      { id: 'a', type: 'rect', name: 'a', visible: true, locked: false, elementMarkup: '<rect id="a"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const intent = fixture.componentInstance.resolveLayerDropIntent('a', 'b', 0.2);
    expect(intent.valid).toBe(true);
    expect(intent.action?.kind).toBe('reorderBeforeSibling');
    if (intent.valid && intent.action) {
      fixture.componentInstance['dnd'].executeDropAction('a', intent.action);
    }
    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderBeforeSiblingCommand);
  });

  it('updateDropPreview keeps pendingDropIntent when pointer briefly hits invalid target', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    a.id = 'a';
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b.id = 'b';
    contentRoot.appendChild(a);
    contentRoot.appendChild(b);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#a') return { node: a };
        if (sel === '#b') return { node: b };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'b', type: 'rect', name: 'b', visible: true, locked: false, elementMarkup: '<rect id="b"/>' },
      { id: 'a', type: 'rect', name: 'a', visible: true, locked: false, elementMarkup: '<rect id="a"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const validIntent = {
      ...fixture.componentInstance.resolveLayerDropIntent('a', 'b', 0.2),
      targetId: 'b'
    };
    fixture.componentInstance.pendingDropIntent.set(validIntent);

    const host = fixture.nativeElement as HTMLElement;
    const list = host.querySelector('[data-testid="layers-list"]')!;
    const rowA = document.createElement('div');
    rowA.setAttribute('data-testid', 'layer-row-a');
    rowA.classList.add('cdk-drag-placeholder');
    rowA.getBoundingClientRect = () =>
      ({
        top: 0,
        height: 40,
        left: 0,
        right: 100,
        bottom: 40,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect;
    list.appendChild(rowA);

    fixture.componentInstance['updateDropPreview']('a', { x: 10, y: 10 });

    expect(fixture.componentInstance.pendingDropIntent()).toEqual(validIntent);
    expect(fixture.componentInstance.dropPreview()).toBeNull();
  });

  it('updateDropPreview sets dropPreview when pointer is over a valid target row', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    a.id = 'a';
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b.id = 'b';
    contentRoot.appendChild(a);
    contentRoot.appendChild(b);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#a') return { node: a };
        if (sel === '#b') return { node: b };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'b', type: 'rect', name: 'b', visible: true, locked: false, elementMarkup: '<rect id="b"/>' },
      { id: 'a', type: 'rect', name: 'a', visible: true, locked: false, elementMarkup: '<rect id="a"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const rowB = host.querySelector('[data-testid="layer-row-b"]') as HTMLElement;
    rowB.getBoundingClientRect = () =>
      ({
        top: 50,
        height: 40,
        left: 0,
        right: 100,
        bottom: 90,
        width: 100,
        x: 0,
        y: 50,
        toJSON: () => ({})
      }) as DOMRect;

    fixture.componentInstance['updateDropPreview']('a', { x: 10, y: 60 });

    expect(fixture.componentInstance.dropPreview()).toEqual({
      targetId: 'b',
      zone: 'before',
      valid: true
    });
  });

  it('onLayerDragEnded does not clear pendingDropIntent before drop handler runs', () => {
    const intent = { valid: true, zone: 'before' as const, action: { kind: 'reorderBeforeSibling' as const, referenceNextSiblingId: 'b' } };
    fixture.componentInstance.pendingDropIntent.set(intent);
    fixture.componentInstance.onLayerDragEnded();
    expect(fixture.componentInstance.pendingDropIntent()).toEqual(intent);
  });

  it('onLayerListDropped uses cached pendingDropIntent from drag preview', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const a = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    a.id = 'a';
    const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    b.id = 'b';
    contentRoot.appendChild(a);
    contentRoot.appendChild(b);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#a') return { node: a };
        if (sel === '#b') return { node: b };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'b', type: 'rect', name: 'b', visible: true, locked: false, elementMarkup: '<rect id="b"/>' },
      { id: 'a', type: 'rect', name: 'a', visible: true, locked: false, elementMarkup: '<rect id="a"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const intent = fixture.componentInstance.resolveLayerDropIntent('a', 'b', 0.2);
    fixture.componentInstance.pendingDropIntent.set(intent);

    fixture.componentInstance.onLayerListDropped({
      item: { data: { id: 'a' } },
      dropPoint: { x: 0, y: 0 }
    } as never);

    expect(pushAndExecute).toHaveBeenCalledTimes(1);
    expect(pushAndExecute.mock.calls[0][0]).toBeInstanceOf(ReorderBeforeSiblingCommand);
  });

  it('resolveLayerDropIntent sets dropPreview zone for group middle', () => {
    const contentRoot = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    contentRoot.setAttribute('data-editor-content-group', 'true');
    const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    groupEl.id = 'g1';
    contentRoot.appendChild(groupEl);
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rectEl.id = 'r1';
    contentRoot.appendChild(rectEl);

    getSVGInstance.mockReturnValue({
      findOne: vi.fn((sel: string) => {
        if (sel === '[data-editor-content-group]') return { node: contentRoot };
        if (sel === '#g1') return { node: groupEl };
        if (sel === '#r1') return { node: rectEl };
        return null;
      })
    });

    getLayerTree.mockReturnValue([
      { id: 'g1', type: 'g', name: 'g1', visible: true, locked: false, elementMarkup: '<g id="g1"/>', children: [] },
      { id: 'r1', type: 'rect', name: 'r1', visible: true, locked: false, elementMarkup: '<rect id="r1"/>' }
    ]);
    documentRevision.set(1);
    fixture.detectChanges();

    const intent = fixture.componentInstance.resolveLayerDropIntent('r1', 'g1', 0.5);
    fixture.componentInstance.dropPreview.set({
      targetId: 'g1',
      zone: intent.zone,
      valid: intent.valid
    });
    fixture.detectChanges();

    const groupRow = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="layer-row-g1"]'
    );
    expect(groupRow?.classList.contains('drop-into-group')).toBe(true);
  });
});
